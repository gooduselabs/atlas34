import express from 'express'; import compression from 'compression'; import cookieParser from 'cookie-parser';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import cron from 'node-cron';
import { db } from './lib/db.js'; import { refreshAll } from './lib/leaders.js'; import { ogPng } from './lib/og.js'; import { resolveStreet, locate, legalFor } from './lib/resolve.js'; import { seedFromContent } from './lib/content.js';
if (seedFromContent()) console.log('seeded leaders/facts from content/');
const PUB = path.resolve('public'); const PORT = +process.env.PORT || 3300;
const BASE = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD not set: admin disabled');
const { provinces, stats } = JSON.parse(fs.readFileSync(path.join(PUB, 'data/provinces.json')));
const M = JSON.parse(fs.readFileSync(path.join(PUB, 'data/mapping.json')));
const bySlug = Object.fromEntries(provinces.map(p => [p.slug, p])); const byCode = Object.fromEntries(provinces.map(p => [p.code, p]));
const wardsOf = c => JSON.parse(fs.readFileSync(path.join(PUB, `data/wards/${c}.json`)));
const fold = s => (s || '').normalize('NFC').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const strip = s => fold(s).replace(/^(tinh|thanh pho|quan|huyen|thi xa|phuong|xa|thi tran|dac khu) /, '');
// indexes
const legacy = M.rows.map(([id, w, d, p, t]) => ({ id, w, d, p, t, k: fold(`${w} ${d} ${p}`) }));
const legById = Object.fromEntries(legacy.map(r => [r.id, r]));
const rev = {}; for (const r of legacy) for (const [c, def] of r.t) (rev[c] ||= []).push({ id: r.id, w: r.w, d: r.d, p: r.p, split: r.t.length > 1, def: !!def });
const newW = Object.entries(M.wards).map(([c, v]) => ({ c, n: v.name, p: v.p, pn: byCode[v.p].full, k: fold(`${v.name} ${byCode[v.p].full}`) }));
const newBy = Object.fromEntries(newW.map(w => [w.c, w]));
const alias = q => ' ' + fold(q).replace(/\btp ?hcm\b|\bhcm\b|\bsai gon\b|\bsg\b/g, 'ho chi minh').replace(/\btp\b/g, 'thanh pho').replace(/\bq ?(\d+)\b/g, 'quan $1').replace(/\bp ?(\d+)\b/g, 'phuong $1').replace(/\bh\b/g, 'huyen').replace(/\btx\b/g, 'thi xa').replace(/\btt\b/g, 'thi tran') + ' ';
function search(list, q, n = 12) {
  const toks = alias(q).split(' ').filter(Boolean); if (!toks.length) return [];
  const Q = ' ' + toks.join(' ') + ' ';
  const out = []; for (const r of list) { if (toks.every(t => r.k.includes(t))) {
    const f = [r.w || r.n, r.d].filter(Boolean).map(x => ' ' + fold(x) + ' '); const ph = f.reduce((a, x) => a + (Q.includes(x) ? 0 : 2), 0);
    out.push([r, ph + (r.k.startsWith(toks.join(' ')) ? 0 : 1) + r.k.length / 1000]); } }
  return out.sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]);
}
const leadersOf = code => db.prepare('SELECT * FROM leaders WHERE province=?').all(code).map(l => {
  const pub = l.name && ['approved'].includes(l.status);
  return { role: l.role, name: pub ? l.name : l.cand_name, status: pub ? 'approved' : l.cand_status, source_url: pub ? l.source_url : l.cand_source_url,
    date: pub ? l.verified_at : l.cand_fetched_at, evidence: pub ? null : JSON.parse(l.evidence || 'null'), flag: l.flag };
});
const factsOf = code => db.prepare("SELECT id,kind,text,source_url,verified_at,status FROM facts WHERE province=? AND status IN ('auto','approved') ORDER BY kind='summary' DESC, id").all(code);
const detail = p => ({ ...p, leaders: leadersOf(p.code), facts: factsOf(p.code) });

const app = express(); app.disable('x-powered-by'); app.use(compression()); app.use(express.json()); app.use(cookieParser());
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' }); next(); });
app.use('/vendor/maplibre', express.static('node_modules/maplibre-gl/dist', { maxAge: '30d', immutable: true }));
app.use(['/geo', '/data'], (req, res, next) => { res.set('Cache-Control', 'public, max-age=86400'); next(); });
app.use(express.static(PUB, { index: false, maxAge: '1h' }));

// ---- API ----
app.get('/api/stats', (req, res) => res.json({ ...stats, leaders: db.prepare("SELECT COUNT(*) n, SUM(cand_status='verified' OR status='approved') v FROM leaders").get() }));
app.get('/api/provinces', (req, res) => res.json(provinces));
app.get('/api/province/:code', (req, res) => { const p = byCode[req.params.code] || bySlug[req.params.code]; if (!p) return res.status(404).json({ error: 'not found' }); res.json({ ...detail(p), wards: wardsOf(p.code) }); });
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').slice(0, 100);
  if (req.query.mode === 'new') return res.json(search(newW, q).map(({ k, ...r }) => r));
  // free-form full address: "60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM" -> street part + admin part
  let items = search(legacy, q), street = null; const segs = q.split(',');
  for (let i = 1; !items.length && i < segs.length; i++) { items = search(legacy, segs.slice(i).join(' ')); if (items.length) street = segs.slice(0, i).join(',').trim(); }
  res.json(items.map(({ k, t, ...r }) => ({ ...r, n: t.length, street })));
});
const convOld = (id, street) => { const r = legById[id]; if (!r) return null;
  const to = r.t.map(([c, def]) => ({ code: c, name: newBy[c].n, province: newBy[c].pn, provinceCode: newBy[c].p, slug: byCode[newBy[c].p].slug, default: !!def, legal: r.t.length > 1 ? legalFor(newBy[c].p, newBy[c].n) : null })).sort((a, b) => b.default - a.default);
  const out = { from: { id: r.id, w: r.w, d: r.d, p: r.p }, split: r.t.length > 1, to };
  if (out.split && street) out.resolve = resolveStreet(r.id, String(street).slice(0, 120), to.map(t => t.code));
  return out; };
const convNew = c => { const w = newBy[c]; if (!w) return null; return { to: { code: c, name: w.n, province: w.pn, provinceCode: w.p, slug: byCode[w.p].slug }, from: rev[c] || [] }; };
app.get('/api/convert', (req, res) => { const r = req.query.old ? convOld(String(req.query.old), req.query.street) : convNew(String(req.query.new || '')); r ? res.json(r) : res.status(404).json({ error: 'not found' }); });

app.get('/api/locate', (req, res) => {
  const lat = +req.query.lat, lon = +req.query.lon; if (!(lat > 7 && lat < 24 && lon > 102 && lon < 118)) return res.status(400).json({ error: 'Toạ độ ngoài Việt Nam' });
  const r = req.query.old && legById[String(req.query.old)]; const only = r ? r.t.map(x => x[0]) : null;
  const provs = only ? [...new Set(only.map(c => newBy[c].p))] : provinces.map(p => p.code);
  const c = locate(lon, lat, provs, only);
  if (!c) return res.json({ code: null, note: only ? 'Điểm này không thuộc các đơn vị mới hình thành từ xã cũ. Kiểm tra lại vị trí.' : 'Không xác định được.' });
  res.json({ code: c, name: newBy[c].n, province: newBy[c].pn, provinceCode: newBy[c].p, slug: byCode[newBy[c].p].slug, method: 'point', label: 'Xác định theo toạ độ', confidence: 'cao' });
});
// ---- OG ----
const ogCache = new Map();
app.get('/og/:code.png', async (req, res) => {
  const k = req.params.code; const p = byCode[k];
  if (!ogCache.has(k)) ogCache.set(k, await ogPng(p, provinces));
  res.type('png').set('Cache-Control', 'public, max-age=604800').send(ogCache.get(k));
});

// ---- HTML (SSR meta + SEO body) ----
const shell = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n == null ? '—' : Number(n).toLocaleString('vi-VN');
function page(res, { title, desc, url, og, seo = '', boot = {} }) {
  res.type('html').send(shell.replace('<!--META-->', `<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${BASE}${url}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${BASE}${url}">
<meta property="og:image" content="${BASE}/og/${og}.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">`)
    .replace('<!--SEO-->', seo).replace('/*BOOT*/', `window.__BOOT=${JSON.stringify(boot).replace(/</g, '\\u003c')};`));
}
const roleName = { chu_tich: 'Chủ tịch UBND', bi_thu: 'Bí thư Tỉnh ủy/Thành ủy' };
app.get('/', (req, res) => page(res, { title: 'Atlas 34 — Bản đồ hành chính Việt Nam sau sắp xếp 2025', desc: `34 tỉnh, thành phố và ${stats.wards.toLocaleString('vi-VN')} xã, phường, đặc khu từ 1/7/2025. Tra cứu và đổi địa chỉ cũ ↔ mới.`, url: '/', og: 'vn',
  seo: `<h1>Bản đồ hành chính Việt Nam sau sắp xếp 2025</h1><ul>${provinces.map(p => `<li><a href="/tinh/${p.slug}">${esc(p.full)}</a></li>`).join('')}</ul>` }));
app.get('/doi-dia-chi', (req, res) => {
  let r = req.query.cu ? convOld(String(req.query.cu), req.query.dc) : req.query.moi ? convNew(String(req.query.moi)) : null;
  const title = r ? (req.query.cu ? `${r.from.w}, ${r.from.d}, ${r.from.p} → địa chỉ mới` : `${r.to.name}, ${r.to.province} — gồm những xã cũ nào?`) : 'Đổi địa chỉ cũ ↔ mới sau sắp xếp 2025';
  const desc = r ? (req.query.cu ? (r.resolve?.code ? [r.to.find(t => t.code === r.resolve.code)] : r.to).map(t => `${t.name}, ${t.province}`).join(' · ') : `${r.from.length} đơn vị cũ`) : 'Chuyển địa chỉ trước 1/7/2025 sang địa chỉ mới (và ngược lại), xử lý cả trường hợp xã bị chia tách.';
  page(res, { title: title + ' · Atlas 34', desc, url: req.originalUrl, og: 'vn', boot: { view: 'convert' } });
});
app.get('/chi-muc', (req, res) => page(res, { title: 'Chỉ mục 34 tỉnh, thành · Atlas 34', desc: 'Danh sách 34 đơn vị hành chính cấp tỉnh sau sắp xếp 2025.', url: '/chi-muc', og: 'vn', boot: { view: 'index' } }));
app.get('/tinh/:slug', (req, res) => {
  const p = bySlug[req.params.slug]; if (!p) return res.status(404).type('html').send('<h1>Không tìm thấy</h1><a href="/">Về trang chủ</a>');
  const d = detail(p); const ws = wardsOf(p.code);
  const desc = `${p.full}${p.merged ? ' hợp nhất từ ' + p.oldProvinces.join(', ') : ''}. Diện tích ${fmt(p.area)} km²${p.population ? ', dân số ' + fmt(p.population) + ' người' : ''}; ${p.wardCount} đơn vị cấp xã.`;
  const seo = `<article><h1>${esc(p.full)}</h1><p>${esc(desc)}</p>${d.leaders.map(l => `<p>${roleName[l.role]}: ${esc(l.name)} (nguồn: <a href="${esc(l.source_url)}">${esc(l.source_url)}</a>)</p>`).join('')}
<h2>Danh sách ${p.wardCount} xã, phường, đặc khu</h2><ul>${ws.map(w => `<li>${esc(w.full)}</li>`).join('')}</ul></article>`;
  page(res, { title: `${p.full} sau sắp xếp 2025 — ${p.wardCount} xã, phường · Atlas 34`, desc, url: `/tinh/${p.slug}`, og: p.code, seo, boot: { view: 'province', code: p.code } });
});
app.get('/sitemap.xml', (req, res) => res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/doi-dia-chi', '/chi-muc', ...provinces.map(p => '/tinh/' + p.slug)].map(u => `<url><loc>${BASE}${u}</loc></url>`).join('')}</urlset>`));
app.get('/robots.txt', (req, res) => res.type('text').send(`User-agent: *\nDisallow: /admin\nDisallow: /api/admin\nSitemap: ${BASE}/sitemap.xml\n`));

// ---- Admin ----
const sign = v => v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const authed = req => { const c = req.cookies.adm; if (!c) return false; const [v] = c.split('.'); return sign(v) === c && +v > Date.now(); };
const guard = (req, res, next) => authed(req) ? next() : res.status(401).json({ error: 'unauthorized' });
const tries = new Map();
app.post('/api/admin/login', (req, res) => {
  const ip = req.ip; const t = tries.get(ip) || { n: 0, at: Date.now() }; if (Date.now() - t.at > 9e5) { t.n = 0; t.at = Date.now(); }
  if (t.n >= 10) return res.status(429).json({ error: 'Quá nhiều lần thử, đợi 15 phút' });
  const ok = ADMIN_PASSWORD && crypto.timingSafeEqual(crypto.createHash('sha256').update(String(req.body.password || '')).digest(), crypto.createHash('sha256').update(ADMIN_PASSWORD).digest());
  if (!ok) { t.n++; tries.set(ip, t); return res.status(401).json({ error: 'Sai mật khẩu' }); }
  res.cookie('adm', sign(String(Date.now() + 8 * 3600e3)), { httpOnly: true, sameSite: 'strict', maxAge: 8 * 3600e3 }); res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.clearCookie('adm'); res.json({ ok: true }); });
app.get('/admin', (req, res) => res.sendFile(path.join(PUB, 'admin.html')));
app.get('/api/admin/leaders', guard, (req, res) => res.json(db.prepare('SELECT * FROM leaders ORDER BY (flag IS NOT NULL) DESC, province, role').all().map(l => ({ ...l, pname: byCode[l.province]?.full, evidence: JSON.parse(l.evidence || 'null') }))));
app.post('/api/admin/leaders/:p/:role/approve', guard, (req, res) => {
  const l = db.prepare('SELECT * FROM leaders WHERE province=? AND role=?').get(req.params.p, req.params.role); if (!l) return res.status(404).end();
  const name = (req.body.name || l.cand_name || '').trim(); const url = (req.body.source_url || l.cand_source_url || '').trim();
  if (!name || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Cần tên và URL nguồn' });
  db.prepare("UPDATE leaders SET name=?, source_url=?, verified_at=?, status='approved', flag=NULL WHERE province=? AND role=?").run(name, url, new Date().toISOString(), req.params.p, req.params.role);
  res.json({ ok: true });
});
app.post('/api/admin/leaders/:p/:role/reject', guard, (req, res) => { db.prepare("UPDATE leaders SET flag='rejected', cand_status='rejected' WHERE province=? AND role=?").run(req.params.p, req.params.role); res.json({ ok: true }); });
app.get('/api/admin/facts', guard, (req, res) => res.json(db.prepare('SELECT * FROM facts ORDER BY province, id').all()));
app.post('/api/admin/facts', guard, (req, res) => {
  const { id, province, kind = 'fact', text, source_url, status = 'approved' } = req.body;
  if (!byCode[province] || !text?.trim() || !/^https?:\/\//.test(source_url || '')) return res.status(400).json({ error: 'Cần tỉnh, nội dung và URL nguồn' });
  const now = new Date().toISOString();
  if (id) db.prepare('UPDATE facts SET kind=?, text=?, source_url=?, status=?, verified_at=? WHERE id=?').run(kind, text.trim(), source_url, status, now, id);
  else db.prepare('INSERT INTO facts(province,kind,text,source_url,verified_at,status) VALUES (?,?,?,?,?,?)').run(province, kind, text.trim(), source_url, now, status);
  res.json({ ok: true });
});
app.delete('/api/admin/facts/:id', guard, (req, res) => { db.prepare('DELETE FROM facts WHERE id=?').run(req.params.id); res.json({ ok: true }); });
let running = false;
async function doRefresh() { if (running) return; running = true; try { console.log('refresh', JSON.stringify(await refreshAll(() => {}))); } finally { running = false; } }
app.post('/api/admin/refresh', guard, (req, res) => { doRefresh(); res.json({ started: true }); });
app.get('/api/admin/runs', guard, (req, res) => res.json({ running, runs: db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 10').all() }));

cron.schedule(process.env.REFRESH_CRON || '0 3 * * 1', doRefresh, { timezone: 'Asia/Ho_Chi_Minh' });
if (!db.prepare('SELECT COUNT(*) n FROM runs').get().n && !db.prepare('SELECT COUNT(*) n FROM leaders').get().n && process.env.REFRESH_ON_START !== '0') setTimeout(doRefresh, 5000);
app.listen(PORT, () => console.log(`Atlas 34 on :${PORT}`));

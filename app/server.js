import express from 'express'; import compression from 'compression'; import cookieParser from 'cookie-parser';
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import cron from 'node-cron';
import { db } from './lib/db.js'; import { refreshAll } from './lib/leaders.js'; import { ogPng } from './lib/og.js'; import { resolveStreet, locate, legalFor } from './lib/resolve.js'; import './public/addr-parse.js'; import { seedFromContent, syncNewsFromContent } from './lib/content.js';
if (seedFromContent()) console.log('seeded leaders/facts from content/'); else { const n = syncNewsFromContent(); if (n) console.log('news sources synced from content/:', n); }
const PUB = path.resolve('public'); const PORT = +process.env.PORT || 3300;
const BASE = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD not set: admin disabled');
const { provinces, stats } = JSON.parse(fs.readFileSync(path.join(PUB, 'data/provinces.json')));
const M = JSON.parse(fs.readFileSync(path.join(PUB, 'data/mapping.json')));
const bySlug = Object.fromEntries(provinces.map(p => [p.slug, p])); const byCode = Object.fromEntries(provinces.map(p => [p.code, p]));
const wardsOf = c => JSON.parse(fs.readFileSync(path.join(PUB, `data/wards/${c}.json`)));
const wardSlug = n => fold(n).replace(/ /g, '-');
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
// news source is shown only when the article names the person currently displayed
const nfold = s => (s || "").normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
const newsFor = (l, name) => { const n = JSON.parse(l.news || 'null'); if (!n) return null; if (['verified', 'updated'].includes(n.status) && n.url && nfold(n.name) === nfold(name)) return { status: n.status, title: n.title, url: n.url, date: n.date, site: n.site, prev_name: n.prev_name || null };
  if (n.status === 'conflict' && n.other) return { status: 'conflict', other: n.other, title: n.title || null, url: n.url || null, date: n.date || null, site: n.site }; return null; };
const leadersOf = code => db.prepare('SELECT * FROM leaders WHERE province=?').all(code).map(l => {
  const pub = l.name && ['approved'].includes(l.status);
  return { role: l.role, name: pub ? l.name : l.cand_name, status: pub ? 'approved' : l.cand_status, source_url: pub ? l.source_url : l.cand_source_url,
    date: pub ? l.verified_at : l.cand_fetched_at, evidence: pub ? null : JSON.parse(l.evidence || 'null'), flag: l.flag, news: newsFor(l, pub ? l.name : l.cand_name) };
});
const factsOf = code => db.prepare("SELECT id,kind,text,source_url,verified_at,status FROM facts WHERE province=? AND status IN ('auto','approved') ORDER BY kind='summary' DESC, id").all(code);
const detail = p => ({ ...p, leaders: leadersOf(p.code), facts: factsOf(p.code) });

const app = express(); app.disable('x-powered-by'); app.use(compression()); app.use(express.json({ limit: '1mb' })); app.use(cookieParser());
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' }); next(); });
const TILES = process.env.TILES_DIR || path.resolve('tiles');
app.use('/tiles', (req, res, next) => { res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag', 'Cache-Control': 'public, max-age=604800' }); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); }, express.static(TILES, { acceptRanges: true, maxAge: '7d' }));
app.use('/vendor/pmtiles', express.static('node_modules/pmtiles/dist', { maxAge: '30d' }));
app.use('/vendor/maplibre', express.static('node_modules/maplibre-gl/dist', { maxAge: '30d', immutable: true }));
app.use(['/geo', '/data'], (req, res, next) => { res.set('Cache-Control', 'public, max-age=86400'); next(); });
for (const d of ['fonts', 'glyphs', 'img']) app.use('/' + d, express.static(path.join(PUB, d), { maxAge: '30d' }));
app.use(express.static(PUB, { index: false, maxAge: '1h' }));

// ---- API ----
app.get('/api/stats', (req, res) => res.json({ ...stats, leaders: db.prepare("SELECT COUNT(*) n, SUM(cand_status='verified' OR status='approved') v FROM leaders").get() }));
app.get('/api/provinces', (req, res) => res.json(provinces));
app.get('/api/province/:code', (req, res) => { const p = byCode[req.params.code] || bySlug[req.params.code]; if (!p) return res.status(404).json({ error: 'not found' }); res.json({ ...detail(p), wards: wardsOf(p.code) }); });
const AP = globalThis.A34Parse.make({ legacy, newW, provinces });
const findOld = q => AP.parseOld(q).map(({ item: { k, t, ...r }, street, score, partial }) => ({ ...r, n: t.length, street, score, partial }));
const findNew = q => AP.parseNew(q).map(({ item: { k, ...r }, street, score }) => ({ ...r, street, score }));
app.get('/api/search', (req, res) => { const q = String(req.query.q || '').slice(0, 200); res.json(req.query.mode === 'new' ? findNew(q) : findOld(q)); });
const convOld = (id, street) => { const r = legById[id]; if (!r) return null;
  const to = r.t.map(([c, def]) => ({ code: c, name: newBy[c].n, province: newBy[c].pn, provinceCode: newBy[c].p, slug: byCode[newBy[c].p].slug, default: !!def, legal: r.t.length > 1 ? legalFor(newBy[c].p, newBy[c].n) : null })).sort((a, b) => b.default - a.default);
  const out = { from: { id: r.id, w: r.w, d: r.d, p: r.p }, split: r.t.length > 1, to };
  if (out.split && street) out.resolve = resolveStreet(r.id, String(street).slice(0, 120), to.map(t => t.code));
  return out; };
const convNew = c => { const w = newBy[c]; if (!w) return null; return { to: { code: c, name: w.n, province: w.pn, provinceCode: w.p, slug: byCode[w.p].slug }, from: rev[c] || [] }; };
// cascading old-unit picker: no params -> old provinces; ?p= -> districts; ?p=&d= -> wards
const vi = (a, b) => a.localeCompare(b, 'vi'); const uniq = a => [...new Set(a)].sort(vi);
const oldUnits = (p, d) => !p ? uniq(legacy.map(r => r.p)) : !d ? uniq(legacy.filter(r => r.p === p).map(r => r.d))
  : legacy.filter(r => r.p === p && r.d === d).map(r => ({ id: r.id, w: r.w, n: r.t.length })).sort((x, y) => vi(x.w, y.w));
app.get('/api/old-units', (req, res) => res.set('Cache-Control', 'public, max-age=86400').json(oldUnits(req.query.p && String(req.query.p), req.query.d && String(req.query.d))));
app.get('/api/convert', (req, res) => { const r = req.query.old ? convOld(String(req.query.old), req.query.street) : convNew(String(req.query.new || '')); r ? res.json(r) : res.status(404).json({ error: 'not found' }); });

app.get('/api/locate', (req, res) => {
  const lat = +req.query.lat, lon = +req.query.lon; if (!(lat > 7 && lat < 24 && lon > 102 && lon < 118)) return res.status(400).json({ error: 'Toạ độ ngoài Việt Nam' });
  const r = req.query.old && legById[String(req.query.old)]; const only = r ? r.t.map(x => x[0]) : null;
  const provs = only ? [...new Set(only.map(c => newBy[c].p))] : provinces.map(p => p.code);
  const c = locate(lon, lat, provs, only);
  if (!c) return res.json({ code: null, note: only ? 'Điểm này không thuộc các đơn vị mới hình thành từ xã cũ. Kiểm tra lại vị trí.' : 'Không xác định được.' });
  res.json({ code: c, name: newBy[c].n, province: newBy[c].pn, provinceCode: newBy[c].p, slug: byCode[newBy[c].p].slug, method: 'point', label: 'Xác định theo toạ độ', confidence: 'cao' });
});
// ---- Bulk conversion API (free tier per IP, API keys for more) ----
const FREE_LIMIT = +process.env.BULK_FREE_LIMIT || 200, BULK_MAX = 500;
const keyHash = k => crypto.createHash('sha256').update(k).digest('hex');
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
function quotaFor(req) { const raw = req.get('x-api-key'); if (raw) { const k = db.prepare('SELECT * FROM api_keys WHERE key_hash=? AND revoked_at IS NULL').get(keyHash(raw)); if (!k) return { error: 'Khoá API không hợp lệ hoặc đã thu hồi' }; return { who: 'key:' + k.id, limit: k.daily_limit, key: k }; }
  return { who: 'ip:' + req.ip, limit: FREE_LIMIT }; }
function convertAddress(q) {
  q = String(q || '').trim().slice(0, 300); if (!q) return { old: q, new: '', status: 'bad', note: 'Dòng trống' };
  const its = findOld(q); const street = its[0]?.street || null;
  const it = its[0]; if (!it) return { old: q, new: '', status: 'bad', note: 'Không nhận ra xã/phường cũ' };
  const r = convOld(it.id, street); const pre = street ? street + ', ' : ''; const R = r.resolve; const hit = R?.code && r.to.find(t => t.code === R.code);
  const same = its.filter(x => fold(x.w) === fold(it.w)); const dup = same.length > 1 ? 'có ' + same.length + ' xã cũ cùng tên (' + same.slice(0, 3).map(x => x.d).join(', ') + '), đã lấy xã khớp nhất' : '';
  const base = { old: q, oldId: it.id, oldName: `${it.w}, ${it.d}, ${it.p}` };
  if (hit) return { ...base, new: `${pre}${hit.name}, ${hit.province}`, code: hit.code, status: R.confidence === 'cao' && !dup ? 'ok' : 'warn', note: [R.label, dup].filter(Boolean).join(' · ') };
  if (r.split) return { ...base, new: r.to.map(t => `${t.name}, ${t.province}`).join(' | '), code: r.to.map(t => t.code).join('|'), status: 'warn', note: `Xã cũ chia cho ${r.to.length} đơn vị mới; cần số nhà/đường hoặc toạ độ` };
  return { ...base, new: `${pre}${r.to[0].name}, ${r.to[0].province}`, code: r.to[0].code, status: dup ? 'warn' : 'ok', note: dup };
}
app.post('/api/bulk', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*'); const list = Array.isArray(req.body?.addresses) ? req.body.addresses : null;
  if (!list) return res.status(400).json({ error: 'Cần body {"addresses": [...]}' }); if (list.length > BULK_MAX) return res.status(413).json({ error: `Tối đa ${BULK_MAX} địa chỉ mỗi lần` });
  const Q = quotaFor(req); if (Q.error) return res.status(401).json({ error: Q.error });
  const used = db.prepare('SELECT n FROM api_usage WHERE day=? AND who=?').get(today(), Q.who)?.n || 0;
  if (used + list.length > Q.limit) return res.status(429).json({ error: `Vượt hạn mức ${Q.limit} địa chỉ/ngày (đã dùng ${used}). ${Q.key ? '' : 'Dùng khoá API để nâng hạn mức.'}`.trim(), quota: { used, limit: Q.limit } });
  const results = list.map(convertAddress);
  db.prepare('INSERT INTO api_usage(day,who,n) VALUES (?,?,?) ON CONFLICT(day,who) DO UPDATE SET n=n+excluded.n').run(today(), Q.who, list.length);
  if (Q.key) db.prepare('UPDATE api_keys SET last_used_at=?, total=total+? WHERE id=?').run(new Date().toISOString(), list.length, Q.key.id);
  res.json({ results, quota: { used: used + list.length, limit: Q.limit } });
});
app.options('/api/bulk', (req, res) => res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key', 'Access-Control-Allow-Methods': 'POST' }).sendStatus(204));
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
const short = s => s.replace(/^(Tỉnh|Thành phố) /, '');
const roleName = { chu_tich: 'Chủ tịch UBND', bi_thu: 'Bí thư Tỉnh ủy/Thành ủy' };
app.get('/', (req, res) => page(res, { title: 'Atlas 34 — Bản đồ hành chính Việt Nam sau sắp xếp 2025', desc: `34 tỉnh, thành phố và ${stats.wards.toLocaleString('vi-VN')} xã, phường, đặc khu từ 1/7/2025. Tra cứu và đổi địa chỉ cũ ↔ mới.`, url: '/', og: 'vn',
  seo: `<h1>Bản đồ hành chính Việt Nam sau sắp xếp 2025</h1><ul>${provinces.map(p => `<li><a href="/tinh/${p.slug}">${esc(p.full)}</a></li>`).join('')}</ul>` }));
app.get('/doi-dia-chi', (req, res) => {
  let r = req.query.cu ? convOld(String(req.query.cu), req.query.dc) : req.query.moi ? convNew(String(req.query.moi)) : null;
  const title = r ? (req.query.cu ? `${r.from.w}, ${r.from.d}, ${r.from.p} → địa chỉ mới` : `${r.to.name}, ${r.to.province} — gồm những xã cũ nào?`) : 'Đổi địa chỉ cũ ↔ mới sau sắp xếp 2025';
  const desc = r ? (req.query.cu ? (r.resolve?.code ? [r.to.find(t => t.code === r.resolve.code)] : r.to).map(t => `${t.name}, ${t.province}`).join(' · ') : `${r.from.length} đơn vị cũ`) : 'Chuyển địa chỉ trước 1/7/2025 sang địa chỉ mới (và ngược lại), xử lý cả trường hợp xã bị chia tách.';
  page(res, { title: title + ' · Atlas 34', desc, url: req.originalUrl, og: 'vn', boot: { view: 'convert' } });
});
app.get('/hang-loat', (req, res) => page(res, { title: 'Đổi địa chỉ hàng loạt · Atlas 34', desc: 'Dán danh sách địa chỉ cũ hoặc tải CSV, nhận lại địa chỉ mới theo 34 tỉnh và 3.321 xã, phường. Có API cho doanh nghiệp.', url: '/hang-loat', og: 'vn', boot: { view: 'bulk' } }));
app.get('/xa/:slug', (req, res) => {
  const code = (req.params.slug.match(/(\d{5})$/) || [])[1]; const w = code && newBy[code]; if (!w) return res.status(404).type('html').send('<h1>Không tìm thấy</h1><a href="/">Về trang chủ</a>');
  const p = byCode[w.p]; const canon = `/xa/${wardSlug(w.n)}-${code}`; if (req.path !== canon) return res.redirect(301, canon);
  const from = rev[code] || []; const wd = wardsOf(p.code).find(x => x.code === code) || {};
  const desc = `${w.n} thuộc ${p.full} sau sắp xếp 1/7/2025${from.length ? ', hình thành từ ' + from.length + ' đơn vị cũ: ' + from.slice(0, 5).map(o => o.w + (o.split ? ' (một phần)' : '')).join(', ') + (from.length > 5 ? '…' : '') : ''}.${wd.area ? ' Diện tích ' + fmt(wd.area) + ' km².' : ''}`;
  const seo = `<article><h1>${esc(w.n)}, ${esc(p.full)}</h1><p>${esc(desc)}</p><h2>${esc(w.n)} được hình thành từ những xã, phường nào?</h2><ul>${from.map(o => `<li>${esc(o.w)}, ${esc(o.d)}, ${esc(o.p)}${o.split ? ' (một phần)' : ''}</li>`).join('')}</ul><p><a href="/tinh/${p.slug}">${esc(p.full)}</a> · <a href="/doi-dia-chi?moi=${code}">Đổi địa chỉ</a></p></article>`;
  page(res, { title: `${w.n}, ${short(p.full)} — thuộc tỉnh nào, gồm xã cũ nào · Atlas 34`, desc, url: canon, og: p.code, seo, boot: { view: 'ward', code, province: p.code } });
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
const sitemapUrls = () => ['/', '/doi-dia-chi', '/hang-loat', '/chi-muc', ...provinces.map(p => '/tinh/' + p.slug), ...newW.map(w => `/xa/${wardSlug(w.n)}-${w.c}`)];
app.get('/sitemap.xml', (req, res) => res.type('xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls().map(u => `<url><loc>${BASE}${u}</loc></url>`).join('')}</urlset>`));
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
app.get('/api/admin/keys', guard, (req, res) => res.json(db.prepare('SELECT id,prefix,owner,daily_limit,created_at,revoked_at,last_used_at,total FROM api_keys ORDER BY id DESC').all()));
app.post('/api/admin/keys', guard, (req, res) => { const owner = String(req.body.owner || '').trim().slice(0, 100); const limit = Math.max(1, +req.body.daily_limit || 10000); if (!owner) return res.status(400).json({ error: 'Cần tên chủ khoá' });
  const raw = 'a34_' + crypto.randomBytes(24).toString('base64url'); db.prepare('INSERT INTO api_keys(key_hash,prefix,owner,daily_limit) VALUES (?,?,?,?)').run(keyHash(raw), raw.slice(0, 10), owner, limit); res.json({ key: raw, note: 'Khoá chỉ hiện một lần, hãy lưu lại.' }); });
app.post('/api/admin/keys/:id/revoke', guard, (req, res) => { db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=?').run(new Date().toISOString(), req.params.id); res.json({ ok: true }); });
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

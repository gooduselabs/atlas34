// Client-side replacement of the server API for the static (GitHub Pages) build. Same responses as server.js.
(() => {
const B = window.__BASE || '';
const get = u => fetch(B + u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const fold = s => (s || '').normalize('NFC').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
const foldS = s => fold(s).replace(/\//g, ' ').replace(/\s+/g, ' ');
const memo = {}; const once = (k, f) => memo[k] ||= f();
const core = () => once('core', async () => {
  const [{ provinces }, M, legal, leaders, facts] = await Promise.all([get('/data/provinces.json'), get('/data/mapping.json'), get('/data/legal.json'), get('/data/leaders.json'), get('/data/facts.json')]);
  const byCode = Object.fromEntries(provinces.map(p => [p.code, p]));
  const legacy = M.rows.map(([id, w, d, p, t]) => ({ id, w, d, p, t, k: foldS(`${w} ${d} ${p}`) }));
  const legById = Object.fromEntries(legacy.map(r => [r.id, r]));
  const rev = {}; for (const r of legacy) for (const [c, def] of r.t) (rev[c] ||= []).push({ id: r.id, w: r.w, d: r.d, p: r.p, split: r.t.length > 1, def: !!def });
  const newW = Object.entries(M.wards).map(([c, v]) => ({ c, n: v.name, p: v.p, pn: byCode[v.p].full, k: foldS(`${v.name} ${byCode[v.p].full}`) }));
  return { provinces, byCode, legacy, legById, rev, newW, newBy: Object.fromEntries(newW.map(w => [w.c, w])), legal, leaders, facts };
});
const alias = q => ' ' + foldS(q).replace(/\btp ?hcm\b|\bhcm\b|\bsai gon\b|\bsg\b/g, 'ho chi minh').replace(/\btp\b/g, 'thanh pho').replace(/\bq ?(\d+)\b/g, 'quan $1').replace(/\bp ?(\d+)\b/g, 'phuong $1').replace(/\bh\b/g, 'huyen').replace(/\btx\b/g, 'thi xa').replace(/\btt\b/g, 'thi tran') + ' ';
function search(list, q, n = 12) {
  const toks = alias(q).split(' ').filter(Boolean); if (!toks.length) return []; const Q = ' ' + toks.join(' ') + ' '; const out = [];
  for (const r of list) if (toks.every(t => r.k.includes(t))) { const f = [r.w || r.n, r.d].filter(Boolean).map(x => ' ' + foldS(x) + ' ');
    out.push([r, f.reduce((a, x) => a + (Q.includes(x) ? 0 : 2), 0) + (r.k.startsWith(toks.join(' ')) ? 0 : 1) + r.k.length / 1000]); }
  return out.sort((a, b) => a[1] - b[1]).slice(0, n).map(x => x[0]);
}
const legalFor = (C, p, name) => { const L = C.legal[p]; const c = L?.clauses[fold(name).replace(/\//g, ' ')]; return c ? { nq: L.nq, date: L.date, url: L.url, textUrl: L.textUrl, k: c.k, text: c.text } : null; };
const skey = s => { s = fold(s); const m = s.match(/(?:^| )(?:duong|pho) (.+)$/); if (m && /^(hem|hxh|kiet|ngo|ngach|ki) /.test(s)) s = m[1]; return s.replace(/^(duong|pho|hem|hxh|kiet|ngo|ngach) /, '').replace(/\b0+(\d)/g, '$1'); };
function parseStreet(s) { s = (s || '').trim(); const m = s.match(/^(?:số\s*)?(\d+[a-zA-Z]?(?:[\/\-]\d+[a-zA-Z]?)*)\s*[, ]\s*(.+)$/i); return m ? { house: fold(m[1]), street: m[2] } : { house: null, street: s }; }
function resolveStreet(o, input, cands) {
  if (!o || !input) return null; const { house, street } = parseStreet(input); const k = skey(street); if (!k) return null;
  const addrs = o.addrs.filter(a => a[0] === k);
  if (house) { const a = addrs.find(a => a[1] === house); if (a) return { method: 'house', label: 'Xác định theo số nhà (OpenStreetMap)', confidence: 'cao', code: a[4], point: [a[2], a[3]], street: a[5], note: `Số nhà ${a[6]} ${a[5]} có toạ độ trên OSM.` }; }
  let st = o.streets[k]; if (!st) { const ks = Object.keys(o.streets).filter(x => x === k || x.endsWith(' ' + k) || (k.length > 4 && x.includes(k))); if (ks.length === 1) st = o.streets[ks[0]]; }
  if (!st) return { method: 'none', label: 'Không tìm thấy đường trong phạm vi xã cũ', confidence: 'thấp', note: 'Không có tên đường này trong dữ liệu OSM quanh xã cũ. Hãy chọn vị trí trên bản đồ.' };
  const tot = Object.values(st.parts).reduce((a, b) => a + b, 0);
  const parts = Object.entries(st.parts).filter(([c]) => cands.includes(c)).map(([c, l]) => ({ code: c, meters: l, share: l / tot })).sort((a, b) => b.share - a.share);
  if (parts.length && parts[0].share >= 0.97) return { method: 'street', label: 'Xác định theo vị trí đường', confidence: parts[0].share > 0.999 ? 'cao' : 'khá cao', code: parts[0].code, street: st.name, geom: st.geom, parts, note: `Toàn bộ đoạn ${st.name} trong phạm vi xã cũ (${Math.round(tot)} m theo OSM) nằm trong một đơn vị mới.` };
  const n = parseInt(house); if (house && !isNaN(n)) { const near = addrs.map(a => [a, parseInt(a[1])]).filter(([, x]) => !isNaN(x) && x % 2 === n % 2).sort((a, b) => Math.abs(a[1] - n) - Math.abs(b[1] - n));
    if (near.length >= 2 && Math.abs(near[0][1] - n) <= 10 && near[0][0][4] === near[1][0][4] && (near[0][1] - n) * (near[1][1] - n) <= 0) return { method: 'interp', label: 'Nội suy theo số nhà lân cận', confidence: 'trung bình', code: near[0][0][4], street: st.name, geom: st.geom, parts, note: `Số ${near[0][0][6]} và ${near[1][0][6]} cùng dãy đều thuộc đơn vị này.` }; }
  return { method: 'ambiguous', label: 'Đường đi qua nhiều đơn vị mới', confidence: 'cần chọn', street: st.name, geom: st.geom, parts, note: `${st.name} chạy qua ${parts.length} đơn vị mới. Nhập số nhà hoặc chọn đúng vị trí nhà trên bản đồ.` };
}
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
const inGeom = (x, y, g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
const routes = [
  [/^\/api\/province\/([^/?]+)/, async (C, m) => { const p = C.byCode[m[1]] || C.provinces.find(x => x.slug === m[1]); if (!p) throw new Error(404);
    return { ...p, leaders: C.leaders[p.code] || [], facts: C.facts[p.code] || [], wards: await get(`/data/wards/${p.code}.json`) }; }],
  [/^\/api\/search/, async (C, m, q) => { const s = String(q.get('q') || '').slice(0, 200);
    if (!globalThis.A34Parse) await import(B + '/addr-parse.js'); const AP = C.AP ||= globalThis.A34Parse.make({ legacy: C.legacy, newW: C.newW, provinces: C.provinces });
    if (q.get('mode') === 'new') return AP.parseNew(s).map(({ item: { k, ...r }, street, score }) => ({ ...r, street, score }));
    return AP.parseOld(s).map(({ item: { k, t, ...r }, street, score, partial }) => ({ ...r, n: t.length, street, score, partial })); }],
  [/^\/api\/convert/, async (C, m, q) => {
    if (q.get('old')) { const r = C.legById[q.get('old')]; if (!r) throw new Error(404); const nb = C.newBy, sp = r.t.length > 1;
      const to = r.t.map(([c, def]) => ({ code: c, name: nb[c].n, province: nb[c].pn, provinceCode: nb[c].p, slug: C.byCode[nb[c].p].slug, default: !!def, legal: sp ? legalFor(C, nb[c].p, nb[c].n) : null })).sort((a, b) => b.default - a.default);
      const out = { from: { id: r.id, w: r.w, d: r.d, p: r.p }, split: sp, to }; const st = q.get('street');
      if (sp && st) { const o = await get(`/osm/${r.id}.json`).catch(() => null); out.resolve = resolveStreet(o, st.slice(0, 120), to.map(t => t.code)); }
      return out; }
    const w = C.newBy[q.get('new')]; if (!w) throw new Error(404); return { to: { code: w.c, name: w.n, province: w.pn, provinceCode: w.p, slug: C.byCode[w.p].slug }, from: C.rev[w.c] || [] }; }],
  [/^\/api\/old-units/, async (C, m, q) => { const vi = (a, b) => a.localeCompare(b, 'vi'), uniq = a => [...new Set(a)].sort(vi), p = q.get('p'), d = q.get('d');
    return !p ? uniq(C.legacy.map(r => r.p)) : !d ? uniq(C.legacy.filter(r => r.p === p).map(r => r.d)) : C.legacy.filter(r => r.p === p && r.d === d).map(r => ({ id: r.id, w: r.w, n: r.t.length })).sort((x, y) => vi(x.w, y.w)); }],
  [/^\/api\/locate/, async (C, m, q) => { const lat = +q.get('lat'), lon = +q.get('lon'); if (!(lat > 7 && lat < 24 && lon > 102 && lon < 118)) throw new Error(400);
    const r = q.get('old') && C.legById[q.get('old')]; const only = r ? r.t.map(x => x[0]) : null;
    const provs = only ? [...new Set(only.map(c => C.newBy[c].p))] : C.provinces.map(p => p.code);
    for (const p of provs) { const fs = (await get(`/pip/${p}.json`)).features;
      for (const f of fs) { const c = String(f.properties.code); if (only && !only.includes(c)) continue;
        if (inGeom(lon, lat, f.geometry)) { const w = C.newBy[c]; return { code: c, name: w.n, province: w.pn, provinceCode: w.p, slug: C.byCode[w.p].slug, method: 'point', label: 'Xác định theo toạ độ', confidence: 'cao' }; } } }
    return { code: null, note: only ? 'Điểm này không thuộc các đơn vị mới hình thành từ xã cũ. Kiểm tra lại vị trí.' : 'Không xác định được.' }; }],
];
window.__api = async u => { const url = new URL(u, location.origin); const C = await core();
  for (const [re, h] of routes) { const m = url.pathname.match(re); if (m) return h(C, m, url.searchParams); } throw new Error('404 ' + u); };
})();

// Exact resolution of split communes: OSM house numbers / street geometry (precomputed) and point-in-polygon.
import fs from 'node:fs'; import path from 'node:path';
const D = path.resolve('data-private');
const OSM = fs.existsSync(path.join(D, 'osm_split.json')) ? JSON.parse(fs.readFileSync(path.join(D, 'osm_split.json'))) : {};
export const LEGAL = fs.existsSync(path.join(D, 'legal.json')) ? JSON.parse(fs.readFileSync(path.join(D, 'legal.json'))) : {};
const pipCache = new Map();
const pip = p => { if (!pipCache.has(p)) { const f = path.join(D, 'pip', p + '.json'); pipCache.set(p, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)).features : []); } return pipCache.get(p); };
export const fold = s => (s || '').normalize('NFC').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
const skey = s => { s = fold(s); const m = s.match(/(?:^| )(?:duong|pho) (.+)$/); if (m && /^(hem|hxh|kiet|ngo|ngach|ki) /.test(s)) s = m[1]; return s.replace(/^(duong|pho|hem|hxh|kiet|ngo|ngach) /, '').replace(/\b0+(\d)/g, '$1'); };
function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function inGeom(x, y, g) { const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return ps.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h))); }
export function locate(lon, lat, provinces, only) {
  for (const p of provinces) for (const f of pip(p)) { const c = String(f.properties.code); if (only && !only.includes(c)) continue; if (inGeom(lon, lat, f.geometry)) return c; }
  return null;
}
export function parseStreet(s) {
  s = (s || '').trim(); const m = s.match(/^(?:số\s*)?(\d+[a-zA-Z]?(?:[\/\-]\d+[a-zA-Z]?)*)\s*[, ]\s*(.+)$/i);
  return m ? { house: fold(m[1]), street: m[2] } : { house: null, street: s };
}
// returns { method, confidence, code?, parts?, geom?, note }
export function resolveStreet(oldId, input, cands) {
  const o = OSM[oldId]; if (!o || !input) return null;
  const { house, street } = parseStreet(input); const k = skey(street); if (!k) return null;
  const addrs = o.addrs.filter(a => a[0] === k);
  if (house) { const a = addrs.find(a => a[1] === house);
    if (a) return { method: 'house', label: 'Xác định theo số nhà (OpenStreetMap)', confidence: 'cao', code: a[4], point: [a[2], a[3]], street: a[5], note: `Số nhà ${a[6]} ${a[5]} có toạ độ trên OSM.` }; }
  let st = o.streets[k]; if (!st) { const ks = Object.keys(o.streets).filter(x => x === k || x.endsWith(' ' + k) || (k.length > 4 && x.includes(k))); if (ks.length === 1) st = o.streets[ks[0]]; }
  if (!st) return { method: 'none', label: 'Không tìm thấy đường trong phạm vi xã cũ', confidence: 'thấp', note: 'Không có tên đường này trong dữ liệu OSM quanh xã cũ. Hãy chọn vị trí trên bản đồ.' };
  const tot = Object.values(st.parts).reduce((a, b) => a + b, 0);
  const parts = Object.entries(st.parts).filter(([c]) => cands.includes(c)).map(([c, l]) => ({ code: c, meters: l, share: l / tot })).sort((a, b) => b.share - a.share);
  if (parts.length && parts[0].share >= 0.97) return { method: 'street', label: 'Xác định theo vị trí đường', confidence: parts[0].share > 0.999 ? 'cao' : 'khá cao', code: parts[0].code, street: st.name, geom: st.geom, parts,
    note: `Toàn bộ đoạn ${st.name} trong phạm vi xã cũ (${Math.round(tot)} m theo OSM) nằm trong một đơn vị mới.` };
  // street crosses units: try nearest known house number on the same street with same parity
  const n = parseInt(house); if (house && !isNaN(n)) {
    const near = addrs.map(a => [a, parseInt(a[1])]).filter(([, x]) => !isNaN(x) && x % 2 === n % 2).sort((a, b) => Math.abs(a[1] - n) - Math.abs(b[1] - n));
    if (near.length >= 2 && Math.abs(near[0][1] - n) <= 10 && near[0][0][4] === near[1][0][4] && (near[0][1] - n) * (near[1][1] - n) <= 0)
      return { method: 'interp', label: 'Nội suy theo số nhà lân cận', confidence: 'trung bình', code: near[0][0][4], street: st.name, geom: st.geom, parts, note: `Số ${near[0][0][6]} và ${near[1][0][6]} cùng dãy đều thuộc đơn vị này.` };
  }
  return { method: 'ambiguous', label: 'Đường đi qua nhiều đơn vị mới', confidence: 'cần chọn', street: st.name, geom: st.geom, parts, note: `${st.name} chạy qua ${parts.length} đơn vị mới. Nhập số nhà hoặc chọn đúng vị trí nhà trên bản đồ.` };
}
export function legalFor(province, newName) { const L = LEGAL[province]; if (!L) return null; const c = L.clauses[fold(newName)]; return c ? { nq: L.nq, date: L.date, url: L.url, textUrl: L.textUrl, k: c.k, text: c.text } : null; }

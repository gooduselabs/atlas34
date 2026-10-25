import { Resvg } from '@resvg/resvg-js'; import fs from 'node:fs'; import path from 'node:path';
const geo = JSON.parse(fs.readFileSync(path.resolve('public/geo/provinces.json')));
const fonts = ['BeVietnamPro-Bold.ttf', 'BeVietnamPro-Regular.ttf', 'BeVietnamPro-ExtraBold.ttf'].map(f => path.resolve('fonts', f));
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function pathFor(features, box, W, H, ox, oy) {
  const [x0, y0, x1, y1] = box; const k = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.92; const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const pr = ([x, y]) => `${(ox + W / 2 + (x - cx) * k).toFixed(1)},${(oy + H / 2 - (y - cy) * k * 1.04).toFixed(1)}`;
  return f => { const g = f.geometry; const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.map(p => p.map(r => 'M' + r.map(pr).join('L') + 'Z').join('')).join(''); };
}
function bbox(fs) { let b = [180, 90, -180, -90]; for (const f of fs) { const g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).flat(2).forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }); } return b; }
export async function ogPng(p, provinces) {
  const all = geo.features; const me = p ? all.filter(f => f.properties.code === p.code) : [];
  // mainland only for Khánh Hòa/Đà Nẵng framing; full VN incl. islands for overview
  const vnBox = [102.1, 8.3, 117.9, 23.4];
  const big = pathFor(all, vnBox, 520, 590, 660, 20);
  const fmt = n => n == null ? '—' : Number(n).toLocaleString('vi-VN');
  const title = p ? p.name : 'Việt Nam · 34';
  const sub = p ? (p.merged ? 'Hợp nhất: ' + p.oldProvinces.map(s => s.replace(/^(Tỉnh|Thành phố) /, '')).join(' + ') : 'Giữ nguyên địa giới cấp tỉnh') : '34 tỉnh, thành · 3.321 xã, phường, đặc khu';
  const st = p ? `${fmt(p.area)} km²  ·  ${p.population ? fmt(p.population) + ' người  ·  ' : ''}${p.wardCount} đơn vị cấp xã` : 'Có hiệu lực từ 01·07·2025 — NQ 202/2025/QH15';
  const fs_ = title.length > 12 ? 92 : 120;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#EFE8DA"/><rect x="0" y="0" width="1200" height="630" fill="none" stroke="#1B1A17" stroke-width="28"/>
<rect x="640" y="14" width="546" height="602" fill="#DCE3DE"/>
${all.map(f => `<path d="${big(f)}" fill="${p && f.properties.code === p.code ? '#C8341E' : '#F7F2E7'}" stroke="#1B1A17" stroke-width="0.7"/>`).join('')}
<text x="1160" y="560" text-anchor="end" font-family="Be Vietnam Pro" font-weight="700" font-size="15" letter-spacing="2" fill="#1B1A17">QĐ. HOÀNG SA · QĐ. TRƯỜNG SA (VIỆT NAM)</text>
<text x="64" y="96" font-family="Be Vietnam Pro" font-weight="700" font-size="20" letter-spacing="5" fill="#C8341E">ATLAS 34 · ${p ? 'MÃ ' + p.code : 'BẢN ĐỒ HÀNH CHÍNH'}</text>
<line x1="64" y1="122" x2="600" y2="122" stroke="#1B1A17" stroke-width="2"/>
<text x="60" y="${p ? 260 : 250}" font-family="Be Vietnam Pro" font-weight="800" font-size="${fs_}" fill="#1B1A17">${esc(title)}</text>
<text x="64" y="330" font-family="Be Vietnam Pro" font-size="26" fill="#1B1A17">${esc(sub.length > 44 ? sub.slice(0, 43) + '…' : sub)}</text>
<line x1="64" y1="500" x2="600" y2="500" stroke="#1B1A17" stroke-width="1"/>
<text x="64" y="545" font-family="Be Vietnam Pro" font-weight="700" font-size="24" fill="#1B1A17">${esc(st)}</text>
<text x="64" y="585" font-family="Be Vietnam Pro" font-size="18" fill="#6B655A">Sau sắp xếp đơn vị hành chính 2025</text></svg>`;
  return new Resvg(svg, { font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: 'Be Vietnam Pro' } }).render().asPng();
}

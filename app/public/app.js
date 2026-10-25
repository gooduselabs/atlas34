(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => n == null ? '—' : Number(n).toLocaleString('vi-VN');
const fold = s => (s || '').normalize('NFC').toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const short = s => s.replace(/^(Tỉnh|Thành phố) /, '');
const dt = s => s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const folio = $('#folio'); const boot = window.__BOOT || {};
const S = { provinces: [], byCode: {}, stats: null, cur: null, wardsGeo: {}, detail: {} };
const NQ = 'https://congbao.chinhphu.vn/van-ban/nghi-quyet-so-202-2025-qh15-45050.htm';
const VN_BOUNDS = [[102.1, 8.2], [117.95, 23.45]];
const ROLE = { chu_tich: 'Chủ tịch UBND', bi_thu: 'Bí thư Tỉnh ủy / Thành ủy' };
const B = window.__BASE || '';
const j = u => fetch(B + u).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
const api = u => window.__api ? window.__api(u) : j(u);

// ---------- MAP ----------
let map, hoverId = null, selId = null, wardHover = null, labels = [], fallbackLabels = [];
function initMap(geo) {
  map = new maplibregl.Map({ container: 'map', attributionControl: false, dragRotate: false, pitchWithRotate: false, maxBounds: [[95, 2], [125, 28]],
    style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#DCE3DE' } }] },
    bounds: VN_BOUNDS, fitBoundsOptions: { padding: 24 } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Ranh giới: sapnhap.bando.com.vn qua thanglequoc/vietnamese-provinces-database (MIT) · Không dùng nền bản đồ nước ngoài' }));
  map.touchZoomRotate.disableRotation();
  map.on('load', () => {
    geo.features.forEach(f => { f.id = +f.properties.code; const p = S.byCode[f.properties.code]; f.properties.merged = p?.merged ? 1 : 0; f.properties.olds = p?.oldProvinces.length || 1; });
    map.addSource('prov', { type: 'geojson', data: geo, promoteId: undefined });
    map.addSource('borders', { type: 'geojson', data: B + '/geo/borders.json' });
    map.addLayer({ id: 'prov-shadow', type: 'line', source: 'prov', paint: { 'line-color': '#1B1A17', 'line-width': 5, 'line-opacity': .12, 'line-translate': [3, 3] } });
    map.addLayer({ id: 'prov-fill', type: 'fill', source: 'prov', paint: {
      'fill-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#C8341E',
        ['boolean', ['feature-state', 'hover'], false], '#E9C46A', ['==', ['get', 'merged'], 1], ['interpolate', ['linear'], ['get', 'olds'], 2, '#E2BE7A', 3, '#D9A441'], '#F7F2E7'],
      'fill-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], .35, 1] } });
    map.addLayer({ id: 'prov-line', type: 'line', source: 'borders', paint: { 'line-color': '#1B1A17', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, .5, 9, 1.4] } });
    map.addLayer({ id: 'prov-outline', type: 'line', source: 'prov', paint: { 'line-color': '#1B1A17', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2] } });
    map.addSource('wards', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'ward-fill', type: 'fill', source: 'wards', paint: { 'fill-color': ['case', ['boolean', ['feature-state', 'sel'], false], '#C8341E', ['boolean', ['feature-state', 'hover'], false], '#E9C46A', ['==', ['get', 't'], 'p'], '#F3E3C0', '#F7F2E7'], 'fill-opacity': .95 } });
    map.addLayer({ id: 'ward-line', type: 'line', source: 'wards', paint: { 'line-color': '#1B1A17', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, .25, 12, 1], 'line-opacity': .7 } });
    map.addLayer({ id: 'ward-sel', type: 'line', source: 'wards', filter: ['==', ['id'], -1], paint: { 'line-color': '#1B1A17', 'line-width': 2.5 } });
    addFixedLabels(); addProvLabels(geo);
    const tip = $('.tip');
    map.on('mousemove', 'prov-fill', e => { if (S.cur) return; const f = e.features[0]; setHover('prov', f.id);
      const p = S.byCode[f.properties.code]; tip.hidden = false; tip.style.left = e.point.x + 'px'; tip.style.top = e.point.y + 'px';
      tip.innerHTML = `${esc(p.full)}<small>${p.merged ? 'Hợp nhất ' + p.oldProvinces.map(short).join(' + ') : 'Giữ nguyên'} · ${p.wardCount} xã/phường</small>`; map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'prov-fill', () => { setHover('prov', null); tip.hidden = true; map.getCanvas().style.cursor = ''; });
    map.on('click', 'prov-fill', e => { if (S.picking) return; const c = e.features[0].properties.code; if (S.cur !== c) go(B + `/tinh/${S.byCode[c].slug}`); });
    map.on('mousemove', 'ward-fill', e => { const f = e.features[0]; setHover('wards', f.id); tip.hidden = false; tip.style.left = e.point.x + 'px'; tip.style.top = e.point.y + 'px';
      tip.innerHTML = `${esc(f.properties.fullName)}<small>${f.properties.areaKm2 ? fmt(f.properties.areaKm2) + ' km² · ' : ''}bấm để xem các đơn vị cũ</small>`; map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'ward-fill', () => { setHover('wards', null); tip.hidden = true; });
    map.on('click', 'ward-fill', e => { if (S.picking) return; e.preventDefault(); showWard(e.features[0].properties.code); });
    map.on('zoom', () => { const z = map.getZoom(); labels.forEach(l => l.getElement().style.opacity = S.cur ? 0 : (z < 4.6 && l._small ? 0 : 1)); });
    route();
  });
}
const hov = {};
function setHover(src, id) { if (hov[src] != null) map.setFeatureState({ source: src, id: hov[src] }, { hover: false }); hov[src] = id; if (id != null) map.setFeatureState({ source: src, id }, { hover: true }); }
function mk(html, lnglat, cls, anchor = 'center') { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; return new maplibregl.Marker({ element: el, anchor }).setLngLat(lnglat).addTo(map); }
function addFixedLabels() {
  // Sovereignty: archipelagos are always labelled as part of Viet Nam with their administering unit.
  mk('<b>Quần đảo Hoàng Sa</b>Đặc khu Hoàng Sa · TP Đà Nẵng · Việt Nam', [111.0, 17.25], 'lbl lbl-isl', 'bottom-left');
  mk('<b>Quần đảo Trường Sa</b>Đặc khu Trường Sa · tỉnh Khánh Hòa<br>Việt Nam', [113.6, 11.9], 'lbl lbl-isl', 'bottom-left');
  mk('B I Ể N &nbsp; Đ Ô N G', [110.6, 14.4], 'lbl lbl-sea');
  mk('V Ị N H &nbsp; B Ắ C &nbsp; B Ộ', [107.75, 19.45], 'lbl lbl-sea').getElement().style.fontSize = '11px';
}
function centroid(f) { // largest ring bbox center
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates; let best = null, ba = 0;
  for (const p of polys) { const r = p[0]; let a = 0, x = 0, y = 0; for (let i = 0, k = r.length - 1; i < r.length; k = i++) { const c = r[k][0] * r[i][1] - r[i][0] * r[k][1]; a += c; x += (r[k][0] + r[i][0]) * c; y += (r[k][1] + r[i][1]) * c; }
    if (Math.abs(a) > ba) { ba = Math.abs(a); best = [x / (3 * a), y / (3 * a)]; } }
  return best;
}
function addProvLabels(geo) { for (const f of geo.features) { const p = S.byCode[f.properties.code]; const big = (p.area || 0) > 5000 || p.population > 3e6;
  const m = mk(esc(short(p.full)), centroid(f), 'lbl' + (big ? '' : ' sm')); m._small = !big; labels.push(m); } }
let wardMarkers = [];
async function enterProvince(code) {
  const p = S.byCode[code]; if (selId != null) map.setFeatureState({ source: 'prov', id: selId }, { sel: false });
  selId = +code; $('.map-wrap').classList.add('in'); $('.map-back').hidden = false; labels.forEach(l => l.getElement().style.opacity = 0);
  S.provinces.forEach(q => map.setFeatureState({ source: 'prov', id: +q.code }, { dim: q.code !== code }));
  let g = S.wardsGeo[code]; if (!g) { g = await j(`/geo/wards/${code}.json`); g.features.forEach(f => { f.id = +f.properties.code; f.properties.t = /^Phường/.test(f.properties.fullName) ? 'p' : 'x'; }); S.wardsGeo[code] = g; }
  if (S.cur !== code) return; map.getSource('wards').setData(g);
  const b = bboxOf(g, code); map.fitBounds(b, { padding: innerWidth < 860 ? 20 : 50, duration: 900, essential: true });
}
function bboxOf(g, code) { let b = [180, 90, -180, -90];
  for (const f of g.features) { if ((code === '48' || code === '56') && /Hoàng Sa|Trường Sa/.test(f.properties.name)) continue; // frame mainland, islands labelled separately
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).flat(2).forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }); }
  return [[b[0], b[1]], [b[2], b[3]]]; }
function leaveProvince() { if (!map) return; if (selId != null) map.setFeatureState({ source: 'prov', id: selId }, { sel: false }); selId = null;
  S.provinces.forEach(q => map.setFeatureState({ source: 'prov', id: +q.code }, { dim: false })); map.getSource('wards')?.setData({ type: 'FeatureCollection', features: [] });
  $('.map-wrap').classList.remove('in'); $('.map-back').hidden = true; map.fitBounds(VN_BOUNDS, { padding: 24, duration: 900 }); setTimeout(() => map.fire('zoom'), 950); }
let wardSel = null;
function highlightWard(code, fly) { if (wardSel != null) map.setFeatureState({ source: 'wards', id: wardSel }, { sel: false }); wardSel = +code;
  map.setFeatureState({ source: 'wards', id: wardSel }, { sel: true }); map.setFilter('ward-sel', ['==', ['id'], wardSel]);
  const g = S.wardsGeo[S.cur]; const f = g?.features.find(x => x.id === wardSel); if (f && fly) { const b = bboxOf({ features: [f] }); map.fitBounds(b, { padding: 80, maxZoom: 12, duration: 800 }); }
  $$('.wards li').forEach(li => li.classList.toggle('on', li.dataset.c === code)); }

// ---------- ROUTER ----------
function go(url, replace) { history[replace ? 'replaceState' : 'pushState']({}, '', url); route(); }
addEventListener('popstate', route);
document.addEventListener('click', e => { const a = e.target.closest('a[href^="/"]'); if (!a || a.target || e.metaKey || e.ctrlKey || a.hasAttribute('download') || a.pathname.startsWith(B + '/admin') || a.pathname.startsWith(B + '/og')) return; e.preventDefault(); go(a.getAttribute('href')); });
$('.map-back').onclick = () => go(B + '/');
function setTab(v) { $$('.tabs a').forEach(a => a.setAttribute('aria-selected', a.dataset.view === v)); }
async function route() {
  const path = location.pathname.slice(B.length) || '/'; folio.scrollTop = 0; if (innerWidth < 860 && S.routed) scrollTo({ top: 0, behavior: 'smooth' }); S.routed = true;
  const m = path.match(/^\/tinh\/([a-z0-9-]+)/);
  if (m) { const p = S.provinces.find(x => x.slug === m[1]); if (p) return showProvince(p.code); }
  if (S.cur || S.dirty) { S.cur = null; S.dirty = false; leaveProvince(); }
  if (path.startsWith('/doi-dia-chi')) return showConvert();
  if (path.startsWith('/chi-muc')) return showIndex();
  showHome();
}
function setTitle(t) { document.title = t + ' · Atlas 34'; }

// ---------- VIEWS ----------
function foot() { const s = S.stats; return `<div class="foot">Nguồn: <a href="${NQ}" target="_blank" rel="noopener">NQ 202/2025/QH15</a> (diện tích, dân số các tỉnh hợp nhất) ·
  danh mục và ranh giới <a href="https://github.com/thanglequoc/vietnamese-provinces-database" target="_blank" rel="noopener">thanglequoc/vietnamese-provinces-database</a> ${esc(s.dataset.DatasetVersion)} (theo ${esc(s.dataset.LatestDecree)}, MIT; hình học từ sapnhap.bando.com.vn) ·
  bảng đổi địa chỉ <a href="https://github.com/tranngocminhhieu/vietnamadminunits" target="_blank" rel="noopener">vietnamadminunits</a> (MIT) · lãnh đạo &amp; tóm tắt: Wikipedia tiếng Việt, Wikidata, cổng TTĐT tỉnh.
  Dữ liệu không chính thức, vui lòng đối chiếu văn bản gốc. Hoàng Sa, Trường Sa là lãnh thổ Việt Nam.</div>`; }
function showHome() {
  setTab('map'); setTitle('Bản đồ hành chính Việt Nam sau sắp xếp 2025'); const s = S.stats;
  const merged = S.provinces.filter(p => p.merged).length;
  folio.innerHTML = `
  <div class="sec"><div class="kicker"><span>Ấn bản 2025</span><span>NQ 202/2025/QH15</span></div>
    <h1 class="h-xl">Ba mươi tư.</h1>
    <p class="lede">Từ 1/7/2025, Việt Nam còn 34 tỉnh, thành phố. Cấp huyện không còn; ${fmt(s.wards)} xã, phường, đặc khu trực thuộc thẳng cấp tỉnh.</p></div>
  <div class="stats"><div class="stat"><div class="v">63<small>→</small>34</div><div class="k">Cấp tỉnh</div></div>
    <div class="stat"><div class="v">${fmt(s.legacyTotal)}</div><div class="k">Xã cũ trước 7/2025</div></div>
    <div class="stat"><div class="v">${fmt(s.wards)}</div><div class="k">Xã · phường · đặc khu</div></div></div>
  <div class="sec"><div class="h-s">Bắt đầu</div>
    <div class="hero-grid"><div class="big-n">${merged}</div><p>tỉnh, thành mới được hình thành do hợp nhất. ${34 - merged} đơn vị giữ nguyên tên và địa giới cấp tỉnh. Bấm vào một tỉnh trên bản đồ để xem bên trong.</p></div>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><a class="btn" href="${B}/doi-dia-chi" style="text-decoration:none">Đổi địa chỉ cũ → mới</a><a class="btn" href="${B}/chi-muc" style="text-decoration:none;background:var(--paper);color:var(--ink);outline:1.5px solid var(--ink);outline-offset:-1.5px">Chỉ mục 34 tỉnh</a></div></div>
  <div class="sec"><div class="h-s">Tìm nhanh tỉnh, thành</div><div class="search"><input id="qp" placeholder="Gõ tên tỉnh mới hoặc cũ, ví dụ: Quảng Nam" autocomplete="off"><span class="n" id="qpn"></span></div><ul class="idx" id="qpl"></ul></div>${foot()}`;
  const inp = $('#qp'), ul = $('#qpl');
  inp.oninput = () => { const q = fold(inp.value); if (!q) { ul.innerHTML = ''; return; }
    const r = S.provinces.filter(p => fold(p.full + ' ' + p.oldProvinces.join(' ')).includes(q)).slice(0, 6);
    ul.innerHTML = r.map(rowIdx).join(''); $('#qpn').textContent = r.length + ' kết quả'; };
}
const rowIdx = p => `<li><a href="${B}/tinh/${p.slug}"><span class="no">${p.code}</span><span><span class="nm">${p.merged ? '<i class="mk"></i>' : ''}${esc(short(p.full))}</span><span class="ol">${p.merged ? 'Từ ' + p.oldProvinces.map(short).join(' + ') : 'Giữ nguyên'}</span></span><span class="ct">${p.wardCount}<small>xã/phường</small></span></a></li>`;
function showIndex() {
  setTab('index'); setTitle('Chỉ mục 34 tỉnh, thành');
  folio.innerHTML = `<div class="sec"><div class="kicker"><span>Chỉ mục</span><span>Theo mã hành chính</span></div><h1 class="h-l">34 tỉnh, thành phố</h1>
   <div class="filt" id="srt"><button aria-pressed="true" data-k="code">Mã</button><button data-k="area">Diện tích</button><button data-k="population">Dân số</button><button data-k="wardCount">Số xã</button></div></div>
   <ul class="idx" id="il"></ul>${foot()}`;
  const draw = k => { const l = [...S.provinces].sort((a, b) => k === 'code' ? a.code.localeCompare(b.code) : (b[k] || 0) - (a[k] || 0)); $('#il').innerHTML = l.map(rowIdx).join(''); };
  $('#srt').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#srt button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(b.dataset.k); };
  draw('code');
}
function leaderHTML(l) {
  if (!l) return '<div class="meta">Chưa có dữ liệu từ nguồn.</div>';
  const st = l.status === 'approved' ? '<span class="stamp ok">✓ Đã duyệt</span>' : l.status === 'verified' ? '<span class="stamp ok">Đối chiếu cổng TTĐT</span>' : '<span class="stamp warn">Chưa kiểm chứng</span>';
  const ev = l.evidence; const extra = [];
  if (ev?.portal?.found) extra.push(`tên xuất hiện trên <a href="${esc(ev.portal.url)}" target="_blank" rel="noopener nofollow">cổng TTĐT</a>`);
  if (l.flag === 'conflict' && ev?.wikidata) extra.push(`<span style="color:var(--red)">Wikidata ghi khác: ${esc(ev.wikidata.value)}</span>`);
  return `<div class="nm">${esc(l.name)}</div>${st}<div class="meta">Nguồn: <a class="srcl" href="${esc(l.source_url)}" target="_blank" rel="noopener nofollow">${esc(new URL(l.source_url).hostname)}</a> · ${l.status === 'approved' ? 'duyệt' : 'lấy'} ngày ${dt(l.date)}${extra.length ? '<br>' + extra.join(' · ') : ''}</div>`;
}
async function showProvince(code) {
  setTab('map'); const p = S.byCode[code]; const first = S.cur !== code; S.cur = code; setTitle(`${p.full} sau sắp xếp`);
  if (first) { map && enterProvince(code); }
  let d = S.detail[code]; if (!d) { folio.innerHTML = `<div class="sec"><div class="kicker"><span>Mã ${p.code}</span></div><h1 class="h-xl">${esc(short(p.full))}</h1></div>`; d = S.detail[code] = await api('/api/province/' + code); }
  if (S.cur !== code) return;
  const L = Object.fromEntries(d.leaders.map(l => [l.role, l]));
  const sum = d.facts.find(f => f.kind === 'summary'); const facts = d.facts.filter(f => f.kind !== 'summary');
  folio.innerHTML = `
  <div class="sec"><div class="kicker"><span>Mã ${p.code} · ${p.full.startsWith('Thành phố') ? 'Thành phố trực thuộc TW' : 'Tỉnh'}</span><span>${p.merged ? 'Hợp nhất' : 'Giữ nguyên'}</span></div>
    <h1 class="h-xl">${esc(short(p.full))}</h1>
    <div class="merge">${p.merged ? p.oldProvinces.map((o, i) => `${i ? '<span class="op">+</span>' : ''}<span class="old">${esc(o)}</span>`).join('') + `<span class="eq">=</span><span class="new">${esc(p.full)}</span>` : `<span class="old">${esc(p.full)}</span><span class="meta" style="margin:0 0 0 6px">không sắp xếp theo NQ 202</span>`}</div></div>
  <div class="stats">
    <div class="stat"><div class="v">${fmt(Math.round(p.area))}<small>km²</small></div><div class="k">Diện tích</div><div class="src">${p.areaSource === 'NQ202' ? `<a href="${NQ}" target="_blank" rel="noopener">NQ 202</a>` : 'tính từ ranh giới GIS'}</div></div>
    <div class="stat"><div class="v">${p.population ? (p.population / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + '<small>triệu</small>' : '—'}</div><div class="k">Dân số</div><div class="src">${p.population ? `<a href="${NQ}" target="_blank" rel="noopener">NQ 202</a>` : 'NQ 202 không nêu'}</div></div>
    <div class="stat"><div class="v">${p.wardCount}</div><div class="k">Đơn vị cấp xã</div><div class="src">${p.counts['Phường']} phường · ${p.counts['Xã']} xã${p.counts['Đặc khu'] ? ' · ' + p.counts['Đặc khu'] + ' đặc khu' : ''}</div></div></div>
  <div class="sec"><div class="h-s">Lãnh đạo</div><div class="leaders">
    <div class="leader"><div class="role">${ROLE.bi_thu}</div>${leaderHTML(L.bi_thu)}</div>
    <div class="leader"><div class="role">${ROLE.chu_tich}</div>${leaderHTML(L.chu_tich)}</div></div></div>
  ${sum || facts.length ? `<div class="sec"><div class="h-s">Đôi nét</div>
    ${sum ? `<div class="fact sum"><p>${esc(sum.text)}</p><div class="meta">Nguồn: <a class="srcl" href="${esc(sum.source_url)}" target="_blank" rel="noopener">Wikipedia tiếng Việt</a> · cập nhật ${dt(sum.verified_at)} · tự động</div></div>` : ''}
    ${facts.map(f => `<div class="fact"><p>${f.kind === 'specialty' ? '<b>Đặc sản · </b>' : ''}${esc(f.text)}</p><div class="meta">Nguồn: <a class="srcl" href="${esc(f.source_url)}" target="_blank" rel="noopener nofollow">${esc(new URL(f.source_url).hostname)}</a> · duyệt ${dt(f.verified_at)}</div></div>`).join('')}</div>` : ''}
  <div class="sec" id="wsec"><div class="h-s">Xã · phường · đặc khu</div>
    <div class="search"><input id="wq" placeholder="Lọc ${p.wardCount} đơn vị…" autocomplete="off"><span class="n" id="wn">${p.wardCount}</span></div>
    <div class="filt" id="wf"><button aria-pressed="true" data-t="">Tất cả</button><button data-t="Phường">Phường</button><button data-t="Xã">Xã</button>${p.counts['Đặc khu'] ? '<button data-t="Đặc khu">Đặc khu</button>' : ''}</div>
    <div id="wdet"></div><ul class="wards" id="wl"></ul></div>${foot()}`;
  let t = ''; const draw = () => { const q = fold($('#wq').value); const r = d.wards.filter(w => (!t || w.type === t) && (!q || fold(w.full).includes(q)));
    $('#wn').textContent = r.length; $('#wl').innerHTML = r.map(w => `<li data-c="${w.code}"><span class="t">${w.type === 'Phường' ? 'P' : w.type === 'Xã' ? 'X' : 'ĐK'}</span>${esc(w.name)}<span class="c">${w.code}</span></li>`).join(''); };
  $('#wq').oninput = draw; $('#wf').onclick = e => { const b = e.target.closest('button'); if (!b) return; t = b.dataset.t; $$('#wf button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); };
  $('#wl').onclick = e => { const li = e.target.closest('li'); if (li) showWard(li.dataset.c, true); }; draw();
  const wq = new URLSearchParams(location.search).get('xa'); if (wq) setTimeout(() => showWard(wq, true), 900);
}
async function showWard(code, fly) {
  if (!S.cur) return; highlightWard(code, fly !== false);
  const r = await api('/api/convert?new=' + code); const box = $('#wdet'); if (!box) return;
  box.innerHTML = `<div class="cand def" style="margin:12px 0"><div class="kicker"><span>Mã ${code}</span><span>${r.from.length} đơn vị cũ</span></div><div class="nm" style="margin-top:6px">${esc(r.to.name)}</div>
   <div class="meta">Hình thành từ:</div><ul class="olds">${r.from.map(o => `<li><span>${esc(o.w)}<br><small>${esc(o.d)}, ${esc(short(o.p))}</small></span>${o.split ? '<span class="stamp mid">một phần</span>' : ''}</li>`).join('')}</ul>
   <div class="acts"><a href="${B}/doi-dia-chi?moi=${code}">Mở trong bộ đổi địa chỉ →</a></div></div>`;
  if (innerWidth >= 860) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
// ---------- CONVERTER ----------
function showConvert() {
  setTab('convert'); setTitle('Đổi địa chỉ cũ ↔ mới');
  const qs = new URLSearchParams(location.search); const mode = qs.has('moi') ? 'new' : 'old';
  folio.innerHTML = `<div class="sec"><div class="kicker"><span>Công cụ</span><span>${fmt(S.stats.legacyWards)} xã cũ · ${fmt(S.stats.wards)} xã mới</span></div>
    <h1 class="h-l">Đổi địa chỉ</h1><p class="lede" style="font-size:16px">Gõ tên xã/phường cũ (kèm huyện, tỉnh để chính xác hơn). Nếu xã cũ bị chia cho nhiều xã mới, mọi phương án đều hiện ra.</p>
    <div class="seg" id="seg"><button data-m="old" aria-pressed="${mode === 'old'}">Cũ → Mới</button><button data-m="new" aria-pressed="${mode === 'new'}">Mới → Cũ</button></div>
    <div class="ac"><div class="search"><input id="cq" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="cl" autocomplete="off"></div><ul id="cl" role="listbox" hidden></ul></div>
    <div class="search street"><input id="st" placeholder="Số nhà, đường, thôn/xóm (tuỳ chọn, giữ nguyên)" autocomplete="off"></div>
    <div class="result" id="res"></div></div>
  <div class="sec"><div class="h-s">Lưu ý</div><p class="meta" style="font-size:13px">Bảng đổi địa chỉ lấy từ thư viện mở vietnamadminunits, dựng theo các nghị quyết của UBTVQH về sắp xếp đơn vị hành chính cấp xã năm 2025. Với xã bị chia tách, địa chỉ mới phụ thuộc vào vị trí thật của nhà bạn (thôn/ấp). Hãy đối chiếu với nghị quyết của tỉnh hoặc hỏi UBND xã. Ô “mặc định” là phương án thư viện đề xuất, thường là nơi có phần diện tích lớn nhất hoặc trụ sở.</p></div>${foot()}`;
  let m = mode; const inp = $('#cq'), ul = $('#cl'); let items = [], ai = -1, tm;
  const ph = () => inp.placeholder = m === 'old' ? 'VD: Điện Bàn, Quảng Nam' : 'VD: Phường Hội An, Đà Nẵng';
  ph(); $('#seg').onclick = e => { const b = e.target.closest('button'); if (!b) return; m = b.dataset.m; $$('#seg button').forEach(x => x.setAttribute('aria-pressed', x === b)); ph(); inp.value = ''; ul.hidden = true; $('#res').innerHTML = ''; inp.focus(); };
  const close = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  const pick = it => { close(); if (it.street) $('#st').value = it.street; inp.value = m === 'old' ? `${it.w}, ${it.d}, ${it.p}` : `${it.n}, ${it.pn}`; load(m, m === 'old' ? it.id : it.c, true); };
  inp.oninput = () => { clearTimeout(tm); const q = inp.value.trim(); if (q.length < 2) return close();
    tm = setTimeout(async () => { items = await api(`/api/search?mode=${m}&q=${encodeURIComponent(q)}`); ai = -1;
      ul.innerHTML = items.length ? items.map((it, i) => `<li role="option" data-i="${i}">${m === 'old' ? `${it.n > 1 ? `<span class="sp">chia ${it.n}</span>` : ''}${esc(it.w)}<small>${esc(it.d)}, ${esc(it.p)}</small>` : `${esc(it.n)}<small>${esc(it.pn)}</small>`}</li>`).join('') : '<li aria-disabled="true">Không tìm thấy. Thử bỏ dấu hoặc gõ ngắn hơn.</li>';
      ul.hidden = false; inp.setAttribute('aria-expanded', 'true'); }, 120); };
  inp.onkeydown = e => { if (ul.hidden) return; const lis = $$('li[data-i]', ul);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ai = (ai + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length; lis.forEach((l, i) => l.setAttribute('aria-selected', i === ai)); lis[ai]?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(items[ai < 0 ? 0 : ai]); } else if (e.key === 'Escape') close(); };
  ul.onmousedown = e => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pick(items[+li.dataset.i]); } };
  inp.onblur = () => setTimeout(close, 150); let tst;
  $('#st').oninput = () => { if (!S.lastRes) return; render(S.lastRes); clearTimeout(tst); if (S.lastRes.mode === 'old' && S.lastRes.split) tst = setTimeout(() => load('old', S.lastRes.from.id, true), 450); };
  if (qs.get('dc')) $('#st').value = qs.get('dc');
  if (qs.has('cu')) load('old', qs.get('cu')); else if (qs.has('moi')) load('new', qs.get('moi'));
  async function load(mm, id, push) {
    try { const stv = $('#st').value.trim(); const r = await api(`/api/convert?${mm === 'old' ? 'old' : 'new'}=${encodeURIComponent(id)}${mm === 'old' && stv ? '&street=' + encodeURIComponent(stv) : ''}`); r.mode = mm; S.lastRes = r; render(r); S.dirty = true;
      const u = `/doi-dia-chi?${mm === 'old' ? 'cu' : 'moi'}=${encodeURIComponent(id)}${mm === 'old' && stv ? '&dc=' + encodeURIComponent(stv) : ''}`; if (push) history.replaceState({}, '', B + u);
      if (!inp.value) inp.value = mm === 'old' ? `${r.from.w}, ${r.from.d}, ${r.from.p}` : `${r.to.name}, ${r.to.province}`;
      const pc = mm === 'old' ? r.to[0].provinceCode : r.to.provinceCode; if (map) { const g = S.wardsGeo[pc] || await j(`/geo/wards/${pc}.json`); S.wardsGeo[pc] = g; g.features.forEach(f => { f.id = +f.properties.code; f.properties.t ??= /^Phường/.test(f.properties.fullName) ? 'p' : 'x'; });
        const codes = (mm === 'old' ? (r.resolve?.code ? [r.resolve.code] : r.to.map(t => t.code)) : [r.to.code]).map(Number); drawStreet(r.resolve); map.getSource('wards').setData(g); S.provinces.forEach(q => map.setFeatureState({ source: 'prov', id: +q.code }, { dim: q.code !== pc }));
        if (wardSel != null) map.setFeatureState({ source: 'wards', id: wardSel }, { sel: false }); codes.forEach(c => map.setFeatureState({ source: 'wards', id: c }, { sel: true })); wardSel = null;
        map.setFilter('ward-sel', ['in', ['id'], ['literal', codes]]); const fs = g.features.filter(f => codes.includes(f.id)); const R = r.resolve; const pts = R?.geom ? R.geom.flat() : R?.point ? [R.point] : null;
        if (pts) { const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]); map.fitBounds([[Math.min(...xs) - .006, Math.min(...ys) - .006], [Math.max(...xs) + .006, Math.max(...ys) + .006]], { padding: 40, maxZoom: 14.5, duration: 900 }); }
        else if (fs.length) map.fitBounds(bboxOf({ features: fs }), { padding: 70, maxZoom: 11.5, duration: 900 }); }
    } catch { $('#res').innerHTML = '<div class="warnbox">Không tìm thấy mã này.</div>'; }
  }
  renderHook = rr => render(rr);
  function render(r) {
    const st = $('#st').value.trim(); const pre = st ? esc(st) + ', ' : ''; const share = location.origin + location.pathname + location.search;
    if (r.mode === 'old') {
      const R = r.resolve, hit = R?.code && r.to.find(t => t.code === R.code), conf = c => `<span class="stamp ${c === 'cao' ? 'ok' : c === 'cần chọn' || c === 'thấp' ? 'warn' : 'mid'}">${esc(c)}</span>`;
      const legal = t => t.legal ? `<details class="legal"><summary>Căn cứ: khoản ${t.legal.k} Điều 1 NQ ${esc(t.legal.nq)}</summary><p>${esc(t.legal.text)}</p><a class="srcl" href="${esc(t.legal.url)}" target="_blank" rel="noopener">Toàn văn nghị quyết</a></details>` : (r.split ? '<div class="meta">Chưa có trích dẫn nghị quyết của tỉnh này trong dữ liệu.</div>' : '');
      const card = (t, tag) => `<div class="cand ${tag === 'hit' || (!hit && t.default) ? 'def' : ''}"><div class="chead"><span class="kick">${tag === 'hit' ? 'Kết quả' : t.default ? 'Mặc định (thư viện)' : 'Phương án'}</span>${tag === 'hit' ? conf(R.confidence) : ''}</div>
        <div class="nm">${esc(t.name)}</div><div class="pv">${pre}${esc(t.name)}, ${esc(t.province)}</div>${R?.parts && !hit ? (p => p ? `<div class="meta">${esc(R.street)}: ${Math.round(p.share * 100)}% chiều dài (${fmt(p.meters)} m) nằm trong đơn vị này</div>` : '')(R.parts.find(p => p.code === t.code)) : ''}
        ${legal(t)}<div class="acts"><button data-copy="${esc(st ? st + ', ' : '')}${esc(t.name)}, ${esc(t.province)}">Sao chép</button><a href="${B}/tinh/${t.slug}?xa=${t.code}">Xem trên bản đồ</a><a href="${B}/doi-dia-chi?moi=${t.code}">Gồm những xã cũ nào</a></div></div>`;
      const tools = r.split ? `<div class="pickers"><button class="btn" id="pk">Chọn trên bản đồ</button><button class="btn ghost" id="gl">Dùng vị trí của tôi</button></div>` : '';
      let body;
      if (hit) body = `<div class="method"><b>${esc(R.label)}</b> · ${esc(R.note)}</div>${card(hit, 'hit')}<details class="others"><summary>Các đơn vị mới khác nhận một phần xã cũ (${r.to.length - 1})</summary>${r.to.filter(t => t !== hit).map(t => card(t)).join('')}</details>`;
      else if (r.split) body = `<div class="warnbox"><b>Xã cũ được chia cho ${r.to.length} đơn vị mới.</b><br>${R ? esc(R.note) : 'Nhập số nhà và tên đường ở ô trên, hoặc chọn vị trí nhà trên bản đồ, để ra đúng một kết quả.'}</div>${r.to.map(t => card(t)).join('')}`;
      else body = r.to.map(t => card(t)).join('');
      $('#res').innerHTML = `<div class="addr-old">${pre}${esc(r.from.w)}, ${esc(r.from.d)}, ${esc(r.from.p)}</div><div class="arrow">↓</div>${tools}${body}
      <div class="acts" style="margin-top:14px;display:flex;gap:10px"><button class="btn" data-copy="${esc(share)}">Sao chép liên kết chia sẻ</button></div>`;
      if (r.split) { $('#pk').onclick = () => startPick(r); $('#gl').onclick = () => geoLoc(r); }
    } else {
      $('#res').innerHTML = `<div class="cand def"><div class="nm">${esc(r.to.name)}</div><div class="pv">${pre}${esc(r.to.name)}, ${esc(r.to.province)}</div></div>
      <div class="h-s" style="margin-top:18px">Hình thành từ ${r.from.length} đơn vị cũ</div>
      <ul class="olds">${r.from.map(o => `<li><span>${esc(o.w)}<br><small>${esc(o.d)}, ${esc(o.p)}</small></span><span style="text-align:right">${o.split ? '<span class="stamp mid">một phần</span>' : '<small>toàn bộ</small>'}<br><a class="srcl" style="font-size:11px" href="${B}/doi-dia-chi?cu=${o.id}">chi tiết</a></span></li>`).join('')}</ul>
      <div class="acts" style="margin-top:14px"><button class="btn" data-copy="${esc(share)}">Sao chép liên kết chia sẻ</button> <a class="btn" style="text-decoration:none;margin-left:6px" href="${B}/tinh/${r.to.slug}?xa=${r.to.code}">Xem trên bản đồ</a></div>`;
    }
    $$('[data-copy]', $('#res')).forEach(b => b.onclick = () => { navigator.clipboard?.writeText(b.dataset.copy); const o = b.textContent; b.textContent = 'Đã chép ✓'; setTimeout(() => b.textContent = o, 1400); });
  }
}
function drawStreet(R) {
  if (!map) return; const fc = { type: 'FeatureCollection', features: [] };
  if (R?.geom) fc.features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: R.geom } });
  if (R?.point) fc.features.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: R.point } });
  if (!map.getSource('street')) { map.addSource('street', { type: 'geojson', data: fc });
    map.addLayer({ id: 'street-line', type: 'line', source: 'street', paint: { 'line-color': '#1B1A17', 'line-width': 5, 'line-dasharray': [1, .6] } });
    map.addLayer({ id: 'street-pt', type: 'circle', source: 'street', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 7, 'circle-color': '#C8341E', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#F7F2E7' } }); }
  else map.getSource('street').setData(fc);
}
function showPoint(lon, lat) { drawStreet({ point: [lon, lat] }); map.flyTo({ center: [lon, lat], zoom: Math.max(map.getZoom(), 14), duration: 700 }); }
async function resolvePoint(r, lon, lat, how) {
  const x = await api(`/api/locate?lat=${lat}&lon=${lon}&old=${r.from.id}`); showPoint(lon, lat);
  if (!x.code) { $('#res .method')?.remove(); $('#res').insertAdjacentHTML('afterbegin', `<div class="warnbox">${esc(x.note)}</div>`); return; }
  r.resolve = { code: x.code, label: how, confidence: 'cao', note: `Điểm ${lat.toFixed(5)}, ${lon.toFixed(5)} nằm trong ranh giới ${x.name}.`, point: [lon, lat] };
  S.lastRes = r; renderHook(r);
  map.setFilter('ward-sel', ['in', ['id'], ['literal', [+x.code]]]);
}
let renderHook = () => {};
function startPick(r) {
  if (!map) return; const w = $('.map-wrap'); w.classList.add('picking'); if (innerWidth < 860) scrollTo({ top: 0, behavior: 'smooth' });
  const hint = document.createElement('div'); hint.className = 'pickhint'; hint.textContent = 'Chạm vào đúng vị trí nhà trên bản đồ'; w.appendChild(hint); S.picking = true;
  map.once('click', e => { setTimeout(() => S.picking = false, 50); w.classList.remove('picking'); hint.remove(); resolvePoint(r, e.lngLat.lng, e.lngLat.lat, 'Xác định theo điểm chọn trên bản đồ'); });
}
function geoLoc(r) {
  if (!navigator.geolocation) return alert('Trình duyệt không hỗ trợ định vị');
  navigator.geolocation.getCurrentPosition(p => resolvePoint(r, p.coords.longitude, p.coords.latitude, `Xác định theo vị trí GPS (±${Math.round(p.coords.accuracy)} m)`), e => alert('Không lấy được vị trí: ' + e.message), { enableHighAccuracy: true, timeout: 15000 });
}
// ---------- BOOT ----------
Promise.all([j('/data/provinces.json'), j('/geo/provinces.json')]).then(([d, geo]) => {
  S.provinces = d.provinces; S.stats = d.stats; d.provinces.forEach(p => S.byCode[p.code] = p);
  const start = () => window.maplibregl ? initMap(geo) : setTimeout(start, 30); start();
});
})();

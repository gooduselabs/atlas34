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
// ---------- THEME ----------
const PAL = { light: { ink: '#1B1A17', paper2: '#F7F2E7', red: '#C8341E', hov: '#E9C46A', m2: '#E2BE7A', m3: '#D9A441', ph: '#F3E3C0', sea: '#DCE3DE', land: '#E2DED6', mask: '#BFD3D0', wall: '#7A3B2E', halo: 'rgba(247,242,231,.9)', white: '#FFFFFF' },
  dark: { ink: '#EDE6D6', paper2: '#2A2720', red: '#F0613F', hov: '#8C6A1E', m2: '#5A4A28', m3: '#7A5E24', ph: '#2E2A1E', sea: '#1C2A2B', land: '#1E1D17', mask: '#121D1E', wall: '#D9A98C', halo: 'rgba(23,22,15,.9)', white: '#17160F' } };
const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; // default LIGHT; dark only when the user toggled it
const T = () => PAL[theme()];
function setTheme(t) { try { t ? localStorage.setItem('a34-theme', t) : localStorage.removeItem('a34-theme'); } catch {} if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; applyTheme(); }
function applyTheme() { window.atlasTheme = theme(); $('#themeb')?.setAttribute('aria-pressed', theme() === 'dark'); if (map?.isStyleLoaded?.() && map.getLayer('prov-fill')) applyMapTheme(); }
$('#themeb').onclick = () => setTheme(theme() === 'dark' ? 'light' : 'dark');

window.atlasTheme = theme();
// ---------- UI HELPERS ----------
let toastEl, toastTm;
function toast(msg, err) { if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.toggle('err', !!err); toastEl.classList.add('on'); clearTimeout(toastTm); toastTm = setTimeout(() => toastEl.classList.remove('on'), err ? 4500 : 2600); }
const skeleton = (h = '') => `<div class="sec">${h}<div class="skel h"></div><div class="skel l" style="width:70%"></div><div class="skel l" style="width:45%"></div></div><div class="skel b" style="margin:0 28px"></div><div class="sec"><div class="skel l"></div><div class="skel l" style="width:85%"></div><div class="skel l" style="width:60%"></div></div>`;
const errbox = (msg, retry) => `<div class="errbox"><b>Không tải được dữ liệu</b>${esc(msg || 'Kiểm tra kết nối mạng rồi thử lại.')}<br><button class="btn" onclick="${retry || 'location.reload()'}">Thử lại</button></div>`;
const RECENT_KEY = 'a34-recent';
const recents = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
function addRecent(label, url) { try { const r = recents().filter(x => x.url !== url); r.unshift({ label, url, at: Date.now() }); localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 8))); } catch {} }
function recentHTML() { const r = recents(); if (!r.length) return ''; return `<div class="h-s" style="margin-top:22px">Tra cứu gần đây <button class="clr" id="clr-recent" style="margin-left:auto">Xoá</button></div><ul class="recent">${r.map(x => `<li><a href="${B}${esc(x.url)}">${esc(x.label)}</a><small>${new Date(x.at).toLocaleDateString('vi-VN')}</small></li>`).join('')}</ul>`; }
function bindRecent() { const b = $('#clr-recent'); if (b) b.onclick = () => { try { localStorage.removeItem(RECENT_KEY); } catch {} b.closest('.h-s').nextElementSibling?.remove(); b.closest('.h-s').remove(); }; }

// ---------- MAP ----------
let map, hoverId = null, selId = null, wardHover = null, labels = [], fallbackLabels = [];
function initMap(geo) {
  window.__map = map = new maplibregl.Map({ container: 'map', attributionControl: false, dragRotate: false, pitchWithRotate: false, maxBounds: [[95, 2], [125, 28]],
    style: baseStyle(), maxZoom: 19, bounds: VN_BOUNDS, fitBoundsOptions: { padding: 24 } });
  window.__map = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.addControl(new maplibregl.FullscreenControl({ container: document.querySelector('.map-wrap') }), 'top-right');
  map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showAccuracyCircle: true }), 'top-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: (S.tiles ? atlasBasemapAttribution + ' · ' : '') + 'Ranh giới: sapnhap.bando.com.vn qua thanglequoc/vietnamese-provinces-database (MIT)' }));
  map.touchZoomRotate.disableRotation();
  const attrOk = () => { const a = document.querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show'); if (a) { a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); } $('.map-wrap').classList.add('attr-ok'); };
  map.once('load', () => requestAnimationFrame(attrOk)); map.once('idle', () => $('.map-wrap').classList.add('live')); setTimeout(attrOk, 4000);
  map.on('load', () => {
    geo.features.forEach(f => { f.id = +f.properties.code; const p = S.byCode[f.properties.code]; f.properties.merged = p?.merged ? 1 : 0; f.properties.olds = p?.oldProvinces.length || 1; });
    map.addSource('prov', { type: 'geojson', data: geo, promoteId: undefined });
    map.addSource('borders', { type: 'geojson', data: B + '/geo/borders.json' });
    const P = overlayPaints(); map.addLayer({ id: 'prov-shadow', type: 'line', source: 'prov', paint: P['prov-shadow'] });
    map.addLayer({ id: 'prov-fill', type: 'fill', source: 'prov', paint: P['prov-fill'] });
    map.addLayer({ id: 'prov-line', type: 'line', source: 'borders', paint: P['prov-line'] });
    map.addLayer({ id: 'prov-outline', type: 'line', source: 'prov', paint: P['prov-outline'] });
    map.addSource('wards', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'ward-fill', type: 'fill', source: 'wards', paint: P['ward-fill'] });
    map.addLayer({ id: 'ward-line', type: 'line', source: 'wards', paint: P['ward-line'] });
    map.addLayer({ id: 'ward-sel', type: 'line', source: 'wards', filter: ['==', ['id'], -1], paint: P['ward-sel'] });
    addFixedLabels(); addProvLabels(geo); setupBasemap(); applyTheme(); clearTimeout(S.loadTm);
    const tip = $('.tip');
    map.on('mousemove', 'prov-fill', e => { if (S.cur) return; const f = e.features[0]; setHover('prov', f.id);
      const p = S.byCode[f.properties.code]; tip.hidden = false; tip.style.left = e.point.x + 'px'; tip.style.top = e.point.y + 'px';
      tip.innerHTML = `${esc(p.full)}<small>${p.merged ? 'Hợp nhất ' + p.oldProvinces.map(short).join(' + ') : 'Giữ nguyên'} · ${p.wardCount} xã/phường</small>`; map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'prov-fill', () => { setHover('prov', null); tip.hidden = true; map.getCanvas().style.cursor = ''; });
    map.on('click', 'prov-fill', e => { if (S.picking) return; if (map.getZoom() >= 9 && !map.queryRenderedFeatures(e.point, { layers: ['ward-fill'] }).length) return pointInfo(e.lngLat); const c = e.features[0].properties.code; if (S.cur !== c) go(B + `/tinh/${S.byCode[c].slug}`); });
    map.on('mousemove', 'ward-fill', e => { const f = e.features[0]; setHover('wards', f.id); tip.hidden = false; tip.style.left = e.point.x + 'px'; tip.style.top = e.point.y + 'px';
      tip.innerHTML = `${esc(f.properties.fullName)}<small>${f.properties.areaKm2 ? fmt(f.properties.areaKm2) + ' km² · ' : ''}bấm để xem các đơn vị cũ</small>`; map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'ward-fill', () => { setHover('wards', null); tip.hidden = true; });
    map.on('click', 'ward-fill', e => { if (S.picking) return; e.preventDefault(); showWard(e.features[0].properties.code); pointInfo(e.lngLat); });
    map.on('dragstart', () => { if (innerWidth < 860 && sheetState === 'full') sheet('half'); });
    map.on('zoom', () => { const z = map.getZoom(); labels.forEach(l => l.getElement().style.opacity = S.cur ? 0 : (z < 4.6 && l._small ? 0 : 1)); });
    route();
  });
}
const hov = {};
function overlayPaints() { const c = T(); const dim = (a, b) => ['case', ['boolean', ['feature-state', 'dim'], false], a, b]; return {
  'prov-shadow': { 'line-color': c.ink, 'line-width': 5, 'line-opacity': .12, 'line-translate': [3, 3] },
  'prov-fill': { 'fill-color': ['case', ['boolean', ['feature-state', 'sel'], false], c.red, ['boolean', ['feature-state', 'hover'], false], c.hov, ['==', ['get', 'merged'], 1], ['interpolate', ['linear'], ['get', 'olds'], 2, c.m2, 3, c.m3], c.paper2],
    'fill-opacity': S.tiles ? ['interpolate', ['linear'], ['zoom'], 5, dim(.3, .92), 8, dim(.18, .5), 10, dim(.08, .14), 13, dim(0, .04)] : dim(.35, 1) },
  'prov-line': { 'line-color': c.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, .5, 9, 1.4] },
  'prov-outline': { 'line-color': c.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1, 9, 2] },
  'ward-fill': { 'fill-color': ['case', ['boolean', ['feature-state', 'sel'], false], c.red, ['boolean', ['feature-state', 'hover'], false], c.hov, ['==', ['get', 't'], 'p'], c.ph, c.paper2], 'fill-opacity': S.tiles ? ['interpolate', ['linear'], ['zoom'], 7, .7, 11, .12, 14, .02] : .95 },
  'ward-line': { 'line-color': c.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 7, .25, 12, 1], 'line-opacity': .7 },
  'ward-sel': { 'line-color': c.ink, 'line-width': 2.5 },
  'wall-line': { 'line-color': c.wall, 'line-width': ['interpolate', ['linear'], ['zoom'], 9, .4, 14, 1.6], 'line-dasharray': [3, 2], 'line-opacity': .75 },
  'wall-label': { 'text-color': c.wall, 'text-halo-color': c.halo, 'text-halo-width': 1.8 },
  'hq-pt': { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 2.5, 14, 6], 'circle-color': c.red, 'circle-stroke-color': c.white, 'circle-stroke-width': 1.5 },
  'hq-label': { 'text-color': c.red, 'text-halo-color': c.white, 'text-halo-width': 1.5 },
  'street-line': { 'line-color': c.ink, 'line-width': 5, 'line-dasharray': [1, .6] },
  'street-pt': { 'circle-radius': 7, 'circle-color': c.red, 'circle-stroke-width': 2.5, 'circle-stroke-color': c.paper2 },
  'seamask': { 'fill-color': c.mask, 'fill-antialias': false },
  'bg': { 'background-color': lstate.base || lstate.sat ? c.land : c.sea } }; }
function applyMapTheme() { const P = overlayPaints(); for (const [id, paint] of Object.entries(P)) if (map.getLayer(id)) for (const [k, v] of Object.entries(paint)) map.setPaintProperty(id, k, v);
  if (S.tiles) for (const t of S.tiles.sources) for (const l of atlasBasemap(t.id, t.minzoom, t.maxzoom >= 14 ? 24 : t.maxzoom + 1)) if (l.paint && map.getLayer(l.id)) for (const [k, v] of Object.entries(l.paint)) if (/color/.test(k)) map.setPaintProperty(l.id, k, v); }
function setHover(src, id) { if (hov[src] != null) map.setFeatureState({ source: src, id: hov[src] }, { hover: false }); hov[src] = id; if (id != null) map.setFeatureState({ source: src, id }, { hover: true }); }
function mk(html, lnglat, cls, anchor = 'center') { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; const m = new maplibregl.Marker({ element: el, anchor }).setLngLat(lnglat).addTo(map); el.removeAttribute('role'); el.removeAttribute('tabindex'); el.setAttribute('aria-label', el.textContent); return m; }
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
  if (S.cur !== code) return; map.getSource('wards').setData(g); if (wardSel != null) setTimeout(() => highlightWard(String(wardSel).padStart(5, '0'), true), 950);
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
  const path = location.pathname.slice(B.length) || '/'; folio.scrollTop = 0; S.routed = true;
  sheet('half');
  const m = path.match(/^\/tinh\/([a-z0-9-]+)/);
  if (m) { const p = S.provinces.find(x => x.slug === m[1]); if (p) return showProvince(p.code).catch(e => { folio.innerHTML = errbox(e.message); }); }
  const mw = path.match(/^\/xa\/(?:[a-z0-9-]+-)?(\d{5})/);
  if (mw) { const pc = S.wardProv?.[mw[1]]; if (pc) return showProvince(pc).then(() => showWard(mw[1], true)).then(() => focusWardCard()).catch(e => { folio.innerHTML = errbox(e.message); }); }
  if (S.cur || S.dirty) { S.cur = null; S.dirty = false; leaveProvince(); }
  if (path.startsWith('/doi-dia-chi')) return showConvert();
  if (path.startsWith('/hang-loat')) return showBulk();
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
  const html = `
  <div class="sec"><div class="kicker"><span>Ấn bản 2025</span><span>NQ 202/2025/QH15</span></div>
    <h1 class="h-xl">Ba mươi tư.</h1>
    <p class="lede">Từ 1/7/2025, Việt Nam còn 34 tỉnh, thành phố. Cấp huyện không còn; ${fmt(s.wards)} xã, phường, đặc khu trực thuộc thẳng cấp tỉnh.</p></div>
  <div class="stats"><div class="stat"><div class="v">63<small>→</small>34</div><div class="k">Cấp tỉnh</div></div>
    <div class="stat"><div class="v">${fmt(s.legacyTotal)}</div><div class="k">Xã cũ trước 7/2025</div></div>
    <div class="stat"><div class="v">${fmt(s.wards)}</div><div class="k">Xã · phường · đặc khu</div></div></div>
  <div class="sec"><div class="h-s">Bắt đầu</div>
    <div class="hero-grid"><div class="big-n">${merged}</div><p>tỉnh, thành mới được hình thành do hợp nhất. ${34 - merged} đơn vị giữ nguyên tên và địa giới cấp tỉnh. Bấm vào một tỉnh trên bản đồ để xem bên trong.</p></div>
    <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap"><a class="btn" href="${B}/doi-dia-chi" style="text-decoration:none">Đổi địa chỉ cũ → mới</a><a class="btn" href="${B}/chi-muc" style="text-decoration:none;background:var(--paper);color:var(--ink);outline:1.5px solid var(--ink);outline-offset:-1.5px">Chỉ mục 34 tỉnh</a></div></div>
  <div class="sec"><div class="h-s">Địa chỉ của tôi sau sắp xếp</div>
    <div class="quick"><div class="search"><textarea id="qa" placeholder="Dán địa chỉ cũ, ví dụ: 60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM" rows="2"></textarea></div>
      <div class="row"><button class="btn" id="qa-go">Đổi sang địa chỉ mới</button><button class="btn ghost" id="qa-gps">Dùng vị trí của tôi</button></div>
      <div class="hint">Vị trí GPS chỉ dùng một lần để tra ranh giới, không được lưu lại.</div><div id="qa-res"></div></div>${recentHTML()}</div>
  <div class="sec"><div class="h-s">Tìm nhanh tỉnh, thành</div><div class="search"><input id="qp" placeholder="Gõ tên tỉnh mới hoặc cũ, ví dụ: Quảng Nam" autocomplete="off"><span class="n" id="qpn"></span></div><ul class="idx" id="qpl"></ul></div>${foot()}`;
  if (!(S.homeNode?.isConnected && S.lastHome === html)) { folio.innerHTML = html; S.lastHome = html; S.homeNode = folio.firstElementChild; }
  const inp = $('#qp'), ul = $('#qpl');
  inp.oninput = () => { const q = fold(inp.value); if (!q) { ul.innerHTML = ''; return; }
    const r = S.provinces.filter(p => fold(p.full + ' ' + p.oldProvinces.join(' ')).includes(q)).slice(0, 6);
    ul.innerHTML = r.map(rowIdx).join(''); $('#qpn').textContent = r.length + ' kết quả'; };
  bindRecent(); const qa = $('#qa'), qr = $('#qa-res');
  const goQa = async () => { const q = qa.value.trim(); if (q.length < 3) return qa.focus(); qr.innerHTML = '<div class="meta"><span class="spin"></span>Đang tra…</div>';
    try { const it = (await api(`/api/search?mode=old&q=${encodeURIComponent(q)}`))[0]; if (!it) { qr.innerHTML = '<div class="warnbox">Không nhận ra xã/phường cũ trong địa chỉ. Hãy ghi rõ xã, huyện, tỉnh.</div>'; return; }
      go(B + `/doi-dia-chi?cu=${encodeURIComponent(it.id)}${it.street ? '&dc=' + encodeURIComponent(it.street) : ''}`); } catch { qr.innerHTML = '<div class="warnbox">Không tải được. Thử lại sau.</div>'; } };
  $('#qa-go').onclick = goQa; qa.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goQa(); } };
  $('#qa-gps').onclick = () => { if (!navigator.geolocation) return toast('Trình duyệt không hỗ trợ định vị', true); qr.innerHTML = '<div class="meta"><span class="spin"></span>Đang lấy vị trí…</div>';
    navigator.geolocation.getCurrentPosition(async p => { const { latitude: lat, longitude: lon, accuracy } = p.coords;
      try { const r = await api(`/api/locate?lat=${lat}&lon=${lon}`); if (!r.code) { qr.innerHTML = `<div class="warnbox">${esc(r.note)}</div>`; return; } const o = await api('/api/convert?new=' + r.code);
        qr.innerHTML = `<div class="cand def" style="margin-top:12px"><div class="chead"><span class="kick">Bạn đang ở (±${Math.round(accuracy)} m)</span><span class="stamp ok">GPS</span></div><div class="nm">${esc(r.name)}</div><div class="pv">${esc(r.province)}</div>
          <div class="meta">Hình thành từ ${o.from.length} đơn vị cũ: ${o.from.slice(0, 4).map(f => esc(f.w)).join(', ')}${o.from.length > 4 ? '…' : ''}</div><div class="acts"><a href="${B}/tinh/${r.slug}?xa=${r.code}">Xem trên bản đồ</a><a href="${B}/doi-dia-chi?moi=${r.code}">Chi tiết</a></div></div>`;
        addRecent(`${r.name}, ${short(r.province)}`, `/xa/${wardSlug(r.name)}-${r.code}`); if (map) { showPoint(lon, lat); } } catch { qr.innerHTML = '<div class="warnbox">Không xác định được. Thử lại sau.</div>'; }
    }, e => { qr.innerHTML = ''; toast('Không lấy được vị trí: ' + geoErr(e), true); }, { enableHighAccuracy: true, timeout: 15000 }); };
}
function focusWardCard() { if (innerWidth < 860) { sheet('full'); setTimeout(() => $('#wdet')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 400); } }
const geoErr = e => e.code === 1 ? 'bạn chưa cho phép truy cập vị trí.' : e.code === 2 ? 'không có tín hiệu định vị.' : 'hết thời gian chờ.';
const wardSlug = n => fold(n).replace(/ /g, '-');
// ---------- MOBILE SHEET ----------
let sheetState = 'half';
function sheet(st) { if (innerWidth >= 860) return; sheetState = st; folio.classList.remove('half', 'full'); if (st !== 'peek') folio.classList.add(st); $('.sheet-hint').hidden = st !== 'peek'; if (st !== 'full') folio.scrollTop = 0; }
(() => { let y0 = null, h0 = 0, moved = false;
  folio.addEventListener('touchstart', e => { if (innerWidth >= 860) return; const t = e.touches[0]; const top = folio.getBoundingClientRect().top; if (t.clientY - top > 30 && (sheetState === 'full' && folio.scrollTop > 0)) return; y0 = t.clientY; h0 = top; moved = false; }, { passive: true });
  folio.addEventListener('touchmove', e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (Math.abs(dy) < 6) return; if (sheetState === 'full' && dy < 0) { y0 = null; return; } moved = true; folio.classList.add('drag'); const st = folio.parentElement.getBoundingClientRect().top; folio.style.transform = `translateY(${Math.max(0, h0 - st + dy)}px)`; }, { passive: true });
  folio.addEventListener('touchend', e => { if (y0 == null) return; folio.classList.remove('drag'); folio.style.transform = ''; if (moved) { const dy = e.changedTouches[0].clientY - y0; const order = ['peek', 'half', 'full']; let i = order.indexOf(sheetState); if (dy < -40) i = Math.min(2, i + 1); else if (dy > 40) i = Math.max(0, i - 1); sheet(order[i]); } y0 = null; });
  folio.addEventListener('click', e => { if (innerWidth < 860 && sheetState !== 'full' && e.clientY - folio.getBoundingClientRect().top < 26) sheet(sheetState === 'peek' ? 'half' : 'full'); });
})();
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
  const nw = l.news; const ddmm = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
  const srcN = nw?.url && nw.status !== 'conflict' ? `<div class="meta news-src">Nguồn: <a class="newsl" href="${esc(nw.url)}" target="_blank" rel="noopener">${esc(nw.title)}</a> — ${esc(nw.site || 'Xây dựng Chính sách, Pháp luật')} (${ddmm(nw.date)})</div>` : '';
  const cfN = nw?.status === 'conflict' ? `<div class="meta" style="color:var(--red)">Cần duyệt: bài mới hơn nêu ${esc(nw.other.name)} — <a href="${esc(nw.other.url)}" target="_blank" rel="noopener">${esc(nw.other.title)}</a> (${ddmm(nw.other.date)})</div>` : '';
  const st0 = l.status === 'approved' ? '<span class="stamp ok">✓ Đã duyệt</span>' : srcN ? '<span class="stamp ok">✓ Đối chiếu báo Chính phủ</span>' : l.status === 'verified' ? '<span class="stamp ok">Đối chiếu cổng TTĐT</span>' : '<span class="stamp warn">Chưa kiểm chứng</span>';
  const ev = l.evidence; const extra = [];
  if (ev?.portal?.found) extra.push(`tên xuất hiện trên <a href="${esc(ev.portal.url)}" target="_blank" rel="noopener nofollow">cổng TTĐT</a>`);
  if (l.flag === 'conflict' && ev?.wikidata) extra.push(`<span style="color:var(--red)">Wikidata ghi khác: ${esc(ev.wikidata.value)}</span>`);
  const st = st0;
  if (srcN) return `<div class="nm">${esc(l.name)}</div>${st}${srcN}`;
  return `<div class="nm">${esc(l.name)}</div>${st}<div class="meta">Nguồn: <a class="srcl" href="${esc(l.source_url)}" target="_blank" rel="noopener nofollow">${esc(new URL(l.source_url).hostname)}</a> · ${l.status === 'approved' ? 'duyệt' : 'lấy'} ngày ${dt(l.date)}${extra.length ? '<br>' + extra.join(' · ') : ''}</div>${srcN}${cfN}`;
}
async function showProvince(code) {
  setTab('map'); const p = S.byCode[code]; const first = S.cur !== code; S.cur = code; setTitle(`${p.full} sau sắp xếp`);
  if (first) { map && enterProvince(code); }
  let d = S.detail[code]; if (!d) { folio.innerHTML = `<div class="sec"><div class="kicker"><span>Mã ${p.code}</span></div><h1 class="h-xl">${esc(short(p.full))}</h1></div>` + skeleton();
    try { d = S.detail[code] = await api('/api/province/' + code); } catch (e) { if (S.cur === code) folio.innerHTML = `<div class="sec"><h1 class="h-xl">${esc(short(p.full))}</h1></div>` + errbox(); throw e; } }
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
  const wq = new URLSearchParams(location.search).get('xa'); if (wq) setTimeout(() => showWard(wq, true).then(focusWardCard), 900);
}
async function showWard(code, fly) {
  if (!S.cur) return; highlightWard(code, fly !== false);
  const box0 = $('#wdet'); if (box0) box0.innerHTML = '<div class="meta"><span class="spin"></span>Đang tải…</div>';
  let r; try { r = await api('/api/convert?new=' + code); } catch { if ($('#wdet')) $('#wdet').innerHTML = '<div class="warnbox">Không tải được dữ liệu xã này.</div>'; return; } const box = $('#wdet'); if (!box) return;
  addRecent(`${r.to.name}, ${short(r.to.province)}`, `/xa/${wardSlug(r.to.name)}-${code}`); if (S.cur && !/\/doi-dia-chi/.test(location.pathname)) history.replaceState({}, '', B + `/xa/${wardSlug(r.to.name)}-${code}`); setTitle(`${r.to.name}, ${r.to.province}`);
  box.innerHTML = `<div class="cand def" style="margin:12px 0"><div class="kicker"><span>Mã ${code}</span><span>${r.from.length} đơn vị cũ</span></div><div class="nm" style="margin-top:6px">${esc(r.to.name)}</div>
   <div class="meta">Hình thành từ:</div><ul class="olds">${r.from.map(o => `<li><span>${esc(o.w)}<br><small>${esc(o.d)}, ${esc(short(o.p))}</small></span>${o.split ? '<span class="stamp mid">một phần</span>' : ''}</li>`).join('')}</ul>
   <div class="acts"><a href="${B}/doi-dia-chi?moi=${code}">Mở trong bộ đổi địa chỉ →</a></div></div>`;
  if (innerWidth >= 860) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); else sheet('half');
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
    <div class="result" id="res"></div>${recentHTML()}</div>
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
  // paste a whole address ("12 Lê Lợi, P. Bến Nghé, Q.1, TP.HCM"): pick the best match straight away
  inp.onpaste = () => setTimeout(async () => { const q = inp.value.trim(); if (m !== 'old' || !q.includes(',')) return; try { const it = (await api(`/api/search?mode=old&q=${encodeURIComponent(q)}`))[0]; if (it) pick(it); else toast('Không nhận ra xã/phường trong địa chỉ này. Thử gõ tên xã cũ.', true); } catch {} }, 30);
  bindRecent();
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
      addRecent(mm === 'old' ? `${r.from.w}, ${r.from.d}, ${short(r.from.p)}` : `${r.to.name}, ${short(r.to.province)}`, u);
    } catch (e) { $('#res').innerHTML = `<div class="warnbox">${/404/.test(e.message) ? 'Không tìm thấy mã này.' : 'Không tải được dữ liệu. Kiểm tra mạng rồi thử lại.'}</div>`; }
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
    const P = overlayPaints(); map.addLayer({ id: 'street-line', type: 'line', source: 'street', paint: P['street-line'] });
    map.addLayer({ id: 'street-pt', type: 'circle', source: 'street', filter: ['==', ['geometry-type'], 'Point'], paint: P['street-pt'] }); }
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
  if (!map) return; const w = $('.map-wrap'); w.classList.add('picking'); if (innerWidth < 860) sheet('peek');
  const hint = document.createElement('div'); hint.className = 'pickhint'; hint.textContent = 'Chạm vào đúng vị trí nhà trên bản đồ'; w.appendChild(hint); S.picking = true;
  map.once('click', e => { setTimeout(() => S.picking = false, 50); w.classList.remove('picking'); hint.remove(); sheet('half'); resolvePoint(r, e.lngLat.lng, e.lngLat.lat, 'Xác định theo điểm chọn trên bản đồ'); });
}
function geoLoc(r) {
  if (!navigator.geolocation) return toast('Trình duyệt không hỗ trợ định vị', true);
  navigator.geolocation.getCurrentPosition(p => resolvePoint(r, p.coords.longitude, p.coords.latitude, `Xác định theo vị trí GPS (±${Math.round(p.coords.accuracy)} m)`), e => toast('Không lấy được vị trí: ' + geoErr(e), true), { enableHighAccuracy: true, timeout: 15000 });
}
// ---------- BASE MAP ----------
function absUrl(u) { return /^https?:/.test(u) ? u : location.origin + B + '/tiles/' + u; }
function baseStyle() {
  const st = { version: 8, glyphs: location.origin + B + '/glyphs/{fontstack}/{range}.pbf', sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': S.tiles ? T().land : T().sea } }] };
  if (!S.tiles) return st;
  if (!S.pm) { S.pm = new pmtiles.Protocol(); maplibregl.addProtocol('pmtiles', S.pm.tile); }
  st.sources.sat = window.atlasSatellite;
  st.layers.push({ id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } });
  for (const t of S.tiles.sources) { st.sources[t.id] = { type: 'vector', url: 'pmtiles://' + absUrl(t.url) }; st.layers.push(...atlasBasemap(t.id, t.minzoom, t.maxzoom >= 14 ? 24 : t.maxzoom + 1)); }
  // sovereignty: open-sea mask east of the OSM extract (Biển Đông always rendered as water, no foreign land/labels)
  st.sources.seamask = { type: 'geojson', data: { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[114.4, 4.5], [117.8, 4.5], [117.8, 12.6], [114.4, 12.6], [114.4, 4.5]]], [[[114.4, 12.6], [119.6, 12.6], [119.6, 21.2], [114.4, 21.2], [114.4, 12.6]]]] } } };
  st.layers.splice(1, 0, { id: 'seamask', type: 'fill', source: 'seamask', paint: overlayPaints()['seamask'] });
  return st;
}
const LAYERS = { base: 'Nền bản đồ (OSM)', sat: 'Ảnh vệ tinh (2016)', prov: 'Ranh giới tỉnh', ward: 'Ranh giới xã', hq: 'Trụ sở UBND xã' };
const lstate = { base: true, sat: false, prov: true, ward: true, hq: false };
function setupBasemap() {
  const firstRoad = map.getStyle().layers.find(l => /-(building|road-|path)/.test(l.id));
  if (firstRoad) { map.moveLayer('prov-shadow', firstRoad.id); map.moveLayer('prov-fill', firstRoad.id); map.moveLayer('ward-fill', firstRoad.id); }
  map.addSource('wards-all', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const P = overlayPaints(); map.addLayer({ id: 'wall-line', type: 'line', source: 'wards-all', minzoom: 9, paint: P['wall-line'] }, 'prov-line');
  map.addLayer({ id: 'wall-label', type: 'symbol', source: 'wards-all', minzoom: 11, layout: { 'text-field': ['get', 'fullName'], 'text-font': ['Be Vietnam Pro Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 14], 'text-transform': 'uppercase', 'text-letter-spacing': .1, 'text-max-width': 9, 'text-padding': 20 },
    paint: P['wall-label'] });
  map.addSource('hq', { type: 'geojson', data: B + '/data/hq.geojson' });
  map.addLayer({ id: 'hq-pt', type: 'circle', source: 'hq', minzoom: 8, layout: { visibility: 'none' }, paint: P['hq-pt'] });
  map.addLayer({ id: 'hq-label', type: 'symbol', source: 'hq', minzoom: 12, layout: { visibility: 'none', 'text-field': ['concat', 'UBND ', ['get', 'name']], 'text-font': ['Be Vietnam Pro Bold'], 'text-size': 11, 'text-offset': [0, 1], 'text-anchor': 'top' }, paint: P['hq-label'] });
  // layer panel
  const pan = document.createElement('div'); pan.className = 'lyr';
  pan.innerHTML = `<button class="lyr-b" aria-expanded="false" title="Lớp bản đồ">Lớp</button><div class="lyr-p" hidden>${Object.entries(LAYERS).filter(([k]) => S.tiles || !['base', 'sat'].includes(k)).map(([k, t]) => `<label><input type="checkbox" data-k="${k}" ${lstate[k] ? 'checked' : ''}> ${t}</label>`).join('')}</div>`;
  $('.map-wrap').appendChild(pan);
  pan.querySelector('.lyr-b').onclick = () => { const p = pan.querySelector('.lyr-p'); p.hidden = !p.hidden; pan.querySelector('.lyr-b').setAttribute('aria-expanded', !p.hidden); };
  pan.onchange = e => { const k = e.target.dataset.k; lstate[k] = e.target.checked; applyLayers(); };
  // place search
  const sb = document.createElement('div'); sb.className = 'msearch'; sb.innerHTML = '<input placeholder="Tìm đường, địa điểm, xã…" aria-label="Tìm trên bản đồ" autocomplete="off"><ul hidden></ul>';
  $('.map-wrap').appendChild(sb); placeSearch(sb);
  map.on('moveend', loadWardsAll); applyLayers();
}
function vis(ids, on) { ids.forEach(id => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')); }
function applyLayers() {
  const all = map.getStyle().layers.map(l => l.id); const baseIds = S.tiles ? all.filter(id => S.tiles.sources.some(t => id.startsWith(t.id + '-'))) : [];
  vis(baseIds, lstate.base); vis(['sat'], lstate.sat); vis(['prov-line', 'prov-outline', 'prov-shadow'], lstate.prov); vis(['wall-line', 'wall-label'], lstate.ward); vis(['hq-pt', 'hq-label'], lstate.hq);
  map.setPaintProperty('bg', 'background-color', lstate.base || lstate.sat ? T().land : T().sea); loadWardsAll();
}
const pbbox = {};
async function loadWardsAll() {
  if (!lstate.ward || map.getZoom() < 9) return; const b = map.getBounds();
  if (!Object.keys(pbbox).length) map.querySourceFeatures('prov').forEach(f => { const c = f.properties.code; const bb = bboxOf({ features: [f] }); const o = pbbox[c]; pbbox[c] = o ? [[Math.min(o[0][0], bb[0][0]), Math.min(o[0][1], bb[0][1])], [Math.max(o[1][0], bb[1][0]), Math.max(o[1][1], bb[1][1])]] : bb; });
  const need = Object.entries(pbbox).filter(([, bb]) => !(bb[1][0] < b.getWest() || bb[0][0] > b.getEast() || bb[1][1] < b.getSouth() || bb[0][1] > b.getNorth())).map(([c]) => c).slice(0, 4);
  const key = need.sort().join(','); if (key === S.wallKey) return; S.wallKey = key;
  const gs = await Promise.all(need.map(c => S.wardsGeo[c] ? S.wardsGeo[c] : j(`/geo/wards/${c}.json`).then(g => { g.features.forEach(f => { f.id = +f.properties.code; f.properties.t = /^Phường/.test(f.properties.fullName) ? 'p' : 'x'; }); return S.wardsGeo[c] = g; })));
  if (S.wallKey === key) map.getSource('wards-all').setData({ type: 'FeatureCollection', features: gs.flatMap(g => g.features) });
}
let popup;
async function pointInfo(ll) {
  popup?.remove(); popup = new maplibregl.Popup({ maxWidth: '300px', className: 'pinfo' }).setLngLat(ll).setHTML('<div class="meta">Đang xác định…</div>').addTo(map);
  try { const r = await api(`/api/locate?lat=${ll.lat}&lon=${ll.lng}`);
    if (!r.code) return popup.setHTML('<div class="meta">Ngoài ranh giới các xã của Việt Nam trong dữ liệu.</div>');
    const o = await api('/api/convert?new=' + r.code);
    popup.setHTML(`<div class="kick">Đơn vị mới · mã ${r.code}</div><div class="pn">${esc(r.name)}</div><div class="pp"><a href="${B}/tinh/${r.slug}?xa=${r.code}">${esc(r.province)}</a></div>
      <div class="meta">Hình thành từ ${o.from.length} đơn vị cũ:</div><ul>${o.from.slice(0, 6).map(f => `<li>${esc(f.w)}, ${esc(f.d)}${f.split ? ' <i>(một phần)</i>' : ''}</li>`).join('')}${o.from.length > 6 ? `<li>…</li>` : ''}</ul>
      <div class="meta">${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} · <a href="${B}/doi-dia-chi?moi=${r.code}">Chi tiết</a></div>`);
  } catch { popup.setHTML('<div class="meta">Không xác định được.</div>'); }
}
function placeSearch(sb) {
  const inp = sb.querySelector('input'), ul = sb.querySelector('ul'); const shards = {}; let tm, res = [];
  const provOf = q => S.provinces.find(p => q.includes(fold(short(p.full)))) ;
  inp.oninput = () => { clearTimeout(tm); tm = setTimeout(async () => {
    const q = fold(inp.value); if (q.length < 2) { ul.hidden = true; return; }
    let p = provOf(q); if (!p) { const c = map.getCenter(); const r = await api(`/api/locate?lat=${c.lat}&lon=${c.lng}`).catch(() => ({})); p = S.byCode[r.provinceCode] || S.byCode['01']; }
    const qq = q.replace(fold(short(p.full)), '').trim() || q; const toks = qq.split(' ');
    const data = shards[p.code] ||= await j(`/search/${p.code}.json`).then(rows => rows.map(r => [...r, fold(r[0])]));
    const KO = { s: 0, p: 1, a: 2, t: 2, o: 2, h: 3, l: 3, b: 4, r: 2 };
    res = data.filter(r => toks.every(t => r[5].includes(t))).sort((a, b) => (a[5].startsWith(qq) ? 0 : 1) - (b[5].startsWith(qq) ? 0 : 1) || KO[a[3]] - KO[b[3]] || a[0].length - b[0].length).slice(0, 8);
    const KN = { s: 'Đường', p: 'Địa danh', a: 'Tiện ích', h: 'Cửa hàng', t: 'Du lịch', l: 'Giải trí', o: 'Cơ quan', b: 'Toà nhà', r: 'Giao thông' };
    ul.innerHTML = res.length ? res.map((r, i) => `<li data-i="${i}">${esc(r[0])}<small>${KN[r[3]] || ''} · ${esc(S.wardName?.[r[4]] || '')} ${esc(short(p.full))}</small></li>`).join('') : `<li>Không thấy trong ${esc(short(p.full))}. Thử thêm tên tỉnh.</li>`; ul.hidden = false;
  }, 200); };
  ul.onmousedown = e => { const li = e.target.closest('li[data-i]'); if (!li) return; e.preventDefault(); const r = res[+li.dataset.i]; ul.hidden = true; inp.value = r[0]; inp.blur();
    map.flyTo({ center: [r[1], r[2]], zoom: r[3] === 's' ? 16 : 17, duration: 1200 }); map.once('moveend', () => pointInfo({ lng: r[1], lat: r[2] })); };
  inp.onblur = () => setTimeout(() => ul.hidden = true, 150);
}
// ---------- BULK ----------
function csvEsc(v) { v = String(v ?? ''); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function parseLines(txt) { // one address per line; CSV with header "address" column also accepted
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean); if (!lines.length) return [];
  const head = fold(lines[0]); if (/^(dia chi|address)\b/.test(head) && lines.length > 1) return lines.slice(1).map(l => l.replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
  return lines; }
async function convertOne(q) {
  const its = await api(`/api/search?mode=old&q=${encodeURIComponent(q.slice(0, 200))}`); const it = its[0];
  if (!it) return { old: q, new: '', status: 'bad', note: 'Không nhận ra xã/phường cũ' };
  const r = await api(`/api/convert?old=${encodeURIComponent(it.id)}${it.street ? '&street=' + encodeURIComponent(it.street) : ''}`);
  const pre = it.street ? it.street + ', ' : ''; const R = r.resolve; const hit = R?.code && r.to.find(t => t.code === R.code); const same = its.filter(x => fold(x.w) === fold(it.w)); const dup = same.length > 1 ? ' · có ' + same.length + ' xã cũ cùng tên (' + same.slice(0, 3).map(x => x.d).join(', ') + '), đã lấy xã khớp nhất' : '';
  if (hit) return { old: q, new: `${pre}${hit.name}, ${hit.province}`, code: hit.code, status: R.confidence === 'cao' && !dup ? 'ok' : 'warn', note: R.label + dup };
  if (r.split) return { old: q, new: r.to.map(t => `${t.name}, ${t.province}`).join(' | '), code: r.to.map(t => t.code).join('|'), status: 'warn', note: `Xã cũ chia cho ${r.to.length} đơn vị mới; cần số nhà/đường hoặc chọn trên bản đồ` };
  return { old: q, new: `${pre}${r.to[0].name}, ${r.to[0].province}`, code: r.to[0].code, status: dup ? 'warn' : 'ok', note: dup.replace(/^ · /, '') };
}
function showBulk() {
  setTab('bulk'); setTitle('Đổi địa chỉ hàng loạt'); sheet('full');
  folio.innerHTML = `<div class="sec bulk"><div class="kicker"><span>Công cụ</span><span>Tối đa 500 dòng / lần</span></div><h1 class="h-l">Đổi địa chỉ hàng loạt</h1>
    <p class="lede" style="font-size:16px">Dán danh sách địa chỉ cũ, mỗi dòng một địa chỉ (hoặc tải lên file CSV/TXT). Kết quả tải về dạng CSV mở được bằng Excel.</p>
    <textarea id="bt" placeholder="60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM&#10;Phường Phúc Xá, Quận Ba Đình, Hà Nội&#10;…"></textarea>
    <label class="drop" id="bdrop">Kéo thả hoặc bấm để chọn file .csv / .txt<input type="file" id="bf" accept=".csv,.txt,text/csv,text/plain"></label>
    <div class="pickers" style="margin-top:14px"><button class="btn" id="brun">Chuyển đổi</button><button class="btn ghost" id="bdl" hidden>Tải CSV kết quả</button><button class="btn ghost" id="bcp" hidden>Sao chép bảng</button></div>
    <div class="prog" id="bprog" hidden><i style="width:0"></i></div><div id="bsum" class="meta"></div><div class="btbl-wrap" id="bout"></div></div>
  <div class="sec"><div class="h-s">Dùng qua API</div><p class="meta" style="font-size:13.5px;margin-bottom:10px">Doanh nghiệp cần chuẩn hoá địa chỉ khách hàng có thể gọi trực tiếp. Không cần khoá cho tới 200 địa chỉ/ngày mỗi IP; cần nhiều hơn thì dùng khoá API (header <code>X-Api-Key</code>).</p>
    <div class="code">POST ${location.origin}${B}/api/bulk
Content-Type: application/json
X-Api-Key: &lt;khoá, tuỳ chọn&gt;

{"addresses": ["60 đường số 1, Phường Tân Thành, Quận Tân Phú, TP.HCM"]}

→ {"results": [{"old": "…", "new": "60 đường số 1, Phường Phú Thọ Hoà, Thành phố Hồ Chí Minh",
                 "code": "27022", "status": "ok", "note": "…"}],
   "quota": {"used": 1, "limit": 200}}</div>
    <p class="meta" style="margin-top:10px">Liên hệ qua <a href="https://gooduselabs.com" target="_blank" rel="noopener">gooduselabs.com</a> để nhận khoá API.</p></div>${foot()}`;
  const ta = $('#bt'), drop = $('#bdrop'), fi = $('#bf'); let rows = [];
  const readFile = f => { if (!f) return; f.text().then(t => { ta.value = t; toast(`Đã nạp ${parseLines(t).length} dòng từ ${f.name}`); }); };
  fi.onchange = () => readFile(fi.files[0]);
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); if (ev === 'drop') readFile(e.dataTransfer.files[0]); }));
  const draw = () => { const ok = rows.filter(r => r.status === 'ok').length, warn = rows.filter(r => r.status === 'warn').length, bad = rows.length - ok - warn;
    $('#bsum').innerHTML = `<b>${rows.length}</b> dòng · <span style="color:var(--jade)">${ok} chắc chắn</span> · <span style="color:var(--amber)">${warn} cần kiểm tra</span> · <span style="color:var(--red)">${bad} không nhận ra</span>`;
    $('#bout').innerHTML = `<table class="btbl"><thead><tr><th>#</th><th>Địa chỉ cũ</th><th>Địa chỉ mới</th><th>Ghi chú</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.status}"><td>${i + 1}</td><td class="old">${esc(r.old)}</td><td class="new">${esc(r.new) || '—'}</td><td class="meta" style="margin:0">${esc(r.note)}</td></tr>`).join('')}</tbody></table>`;
    $('#bdl').hidden = $('#bcp').hidden = !rows.length; };
  $('#brun').onclick = async () => { const list = parseLines(ta.value).slice(0, 500); if (!list.length) return toast('Chưa có địa chỉ nào.', true);
    rows = []; $('#bprog').hidden = false; $('#brun').disabled = true; const bar = $('#bprog i');
    for (let i = 0; i < list.length; i++) { try { rows.push(await convertOne(list[i])); } catch { rows.push({ old: list[i], new: '', status: 'bad', note: 'Lỗi tải dữ liệu' }); } bar.style.width = (100 * (i + 1) / list.length) + '%'; if (i % 10 === 9 || i === list.length - 1) draw(); }
    $('#brun').disabled = false; toast(`Xong ${rows.length} dòng`); };
  const csv = () => '\uFEFF' + ['dia_chi_cu,dia_chi_moi,ma_xa_moi,trang_thai,ghi_chu', ...rows.map(r => [r.old, r.new, r.code || '', r.status, r.note].map(csvEsc).join(','))].join('\n');
  $('#bdl').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv()], { type: 'text/csv;charset=utf-8' })); a.download = `atlas34-doi-dia-chi-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  $('#bcp').onclick = () => { navigator.clipboard?.writeText(rows.map(r => `${r.old}\t${r.new}\t${r.note}`).join('\n')).then(() => toast('Đã chép bảng (dán vào Excel)')); };
}
// ---------- BOOT ----------
// tiles manifest is only trusted if the first archive is actually reachable (Range request); otherwise fall back to the plain atlas style
const tilesOk = async t => { if (!t?.sources?.length) return null; try { const r = await fetch(absUrl(t.sources[0].url), { headers: { Range: 'bytes=0-15' } }); return r.ok ? t : null; } catch { return null; } };
folio.innerHTML = skeleton('<div class="skel l" style="width:40%"></div>');
// perf: paint the folio (hero/stats) from the 13 KB provinces.json first; map engine + big JSON load afterwards
const P0 = location.pathname.slice(B.length) || '/'; const needMap = /^\/xa\//.test(P0);
const loadMapping = () => j('/data/mapping.json').then(m => { S.wardName = {}; S.wardProv = {}; for (const [c, v] of Object.entries(m.wards)) { S.wardName[c] = v.name; S.wardProv[c] = v.p; } }).catch(() => null);
const pProv = j('/data/provinces.json').then(d => { S.provinces = d.provinces; S.stats = d.stats; d.provinces.forEach(p => S.byCode[p.code] = p); if (P0 === '/') { try { sheet('half'); showHome(); S.pre = true; } catch (e) {} } return d; });
// start the heavy map engine only after the first content has painted (2 frames + a short pause, then idle)
const idle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => (window.requestIdleCallback || setTimeout)(() => r(), { timeout: 800 }), 250))));
const loadScript = src => new Promise((r, x) => { const e = document.createElement('script'); e.src = B + src; e.onload = r; e.onerror = x; document.head.appendChild(e); });
// mobile home: a static preview image (same view, sovereignty labels baked in) stands in for the map until the first
// interaction or a few idle seconds, so the ~1 s of MapLibre start-up work never competes with first paint
const facade = !needMap && P0 === '/';
const wake = () => new Promise(r => { if (!facade) return r(); const ev = ['pointerdown', 'touchstart', 'wheel', 'keydown', 'scroll']; let done = false; const go = () => { if (done) return; done = true; ev.forEach(e => removeEventListener(e, go, true)); clearTimeout(t); r(); }; ev.forEach(e => addEventListener(e, go, { capture: true, passive: true })); document.querySelector('.map-wrap')?.addEventListener('pointerenter', go, { once: true }); const t = setTimeout(go, 6000); });
const pEngine = pProv.then(() => needMap ? 0 : idle()).then(wake).then(() => { if (!document.querySelector('link[href$="maplibre-gl.css"]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = B + '/vendor/maplibre/maplibre-gl.css'; document.head.appendChild(l); } return Promise.all([loadScript('/vendor/maplibre/maplibre-gl.js'), loadScript('/vendor/pmtiles/pmtiles.js'), loadScript('/basemap.js')]); });
Promise.all([pProv, j('/geo/provinces.json'), j('/tiles/tiles.json').then(tilesOk).catch(() => null), needMap ? loadMapping() : null, pEngine]).then(([d, geo, tiles]) => { S.tiles = tiles && window.atlasBasemap ? tiles : null; if (!needMap) loadMapping();
  const start = () => window.maplibregl ? initMap(geo) : setTimeout(start, 30); start();
  // if the style never finishes loading (broken tiles), retry once without the basemap so the site stays usable
  S.loadTm = setTimeout(() => { if (map && !map.getLayer('prov-fill')) { console.warn('basemap timeout, retrying without tiles'); map.remove(); S.tiles = null; initMap(geo); toast('Không tải được nền đường phố; hiển thị bản đồ hành chính.', true); } }, 12000);
}).catch(e => { folio.innerHTML = errbox(e.message); });
})();

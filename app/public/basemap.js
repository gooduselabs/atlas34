// Atlas 34 base map style for OpenMapTiles-schema vector tiles (OpenStreetMap, built with Planetiler).
// SOVEREIGNTY: no OSM maritime/disputed boundaries, no OSM sea/ocean names, no OSM labels inside the Hoàng Sa / Trường Sa
// areas (our own Vietnamese labels are drawn instead), no country/state labels. Neighbouring land is rendered neutral.
(() => {
const F = ['Be Vietnam Pro Regular'], FB = ['Be Vietnam Pro Bold'];
const ISL = { type: 'Polygon', coordinates: [[[110.6, 15.2], [113.3, 15.2], [113.3, 17.6], [110.6, 17.6], [110.6, 15.2]]] };
const SPR = { type: 'Polygon', coordinates: [[[110.8, 5.5], [118.2, 5.5], [118.2, 12.3], [110.8, 12.3], [110.8, 5.5]]] };
const notIslands = ['all', ['!', ['within', ISL]], ['!', ['within', SPR]]];
const name = ['coalesce', ['get', 'name:vi'], ['get', 'name']];
const C = { land: '#ECE6DA', water: '#BFD3D0', wood: '#DCE3CF', grass: '#E3E6D2', park: '#D6E2C8', res: '#E8E0D2', ind: '#E2DCD6', bld: '#DCD3C4', bldO: '#CBBFAD',
  ink: '#1B1A17', mute: '#6B655A', mot: '#E3A35B', trunk: '#EBBE77', pri: '#F3D79A', sec: '#FAF2DA', road: '#FFFFFF', casing: '#BDB3A2', rail: '#9C9284' };
const W = (a, b) => ['interpolate', ['exponential', 1.6], ['zoom'], 6, a, 18, b];
const Wc = w => ['interpolate', ['exponential', 1.6], ['zoom'], 6, w[4] + 1.2, 18, w[6] + 3];
// Dark theme: explicit mapping for the light palette, generic lightness inversion for anything else.
const DARK = { '#ECE6DA': '#1E1D17', '#BFD3D0': '#121D1E', '#DCE3CF': '#1C2219', '#E3E6D2': '#20231A', '#D6E2C8': '#1B2618', '#E8E0D2': '#26231C', '#E2DCD6': '#2A2722', '#DCD3C4': '#302C24', '#CBBFAD': '#3E3830',
  '#1B1A17': '#EDE6D6', '#6B655A': '#A39C8B', '#E3A35B': '#8C5E2E', '#EBBE77': '#7E6336', '#F3D79A': '#5E5033', '#FAF2DA': '#3C382C', '#FFFFFF': '#3A372E', '#BDB3A2': '#15140F', '#9C9284': '#6E675B',
  '#5E574B': '#B8B0A0', '#4A453C': '#CFC7B5', '#4E7470': '#7FB3AD', '#6B5E4A': '#BFAF95', '#7D7466': '#A8A092', '#8D8577': '#9D9587', '#A0886A': '#B9A382', '#B5AA98': '#4A463E', '#E0DACE': '#2A2823',
  'rgba(255,255,255,.85)': 'rgba(23,22,15,.85)', 'rgba(255,255,255,.9)': 'rgba(23,22,15,.9)' };
const tone = v => { if (typeof v === 'string') { if (DARK[v]) return DARK[v]; const m = v.match(/^#([0-9a-f]{6})$/i); if (!m) return v;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; const nl = 1 - l; const k = l ? nl / l : 0;
    return '#' + [r, g, b].map(x => Math.round(Math.min(1, x * k) * 255).toString(16).padStart(2, '0')).join(''); }
  if (Array.isArray(v)) return v.map(tone); return v; };
window.atlasBasemap = function (src, minzoom = 0, maxzoom = 24, theme = window.atlasTheme || 'light') {
  const L = []; const dark = theme === 'dark'; const fix = l => { if (dark && l.paint) l.paint = Object.fromEntries(Object.entries(l.paint).map(([k, v]) => [k, /color/.test(k) ? tone(v) : v])); return l; }; const add = l => L.push({ ...l, id: `${src}-${l.id}`, source: src, minzoom: Math.max(minzoom, l.minzoom || 0), maxzoom: Math.min(maxzoom, l.maxzoom || 24) });
  add({ id: 'landcover-wood', type: 'fill', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['wood', 'forest']]], paint: { 'fill-color': C.wood, 'fill-opacity': .8 } });
  add({ id: 'landcover-grass', type: 'fill', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'farmland', 'wetland']]], paint: { 'fill-color': C.grass, 'fill-opacity': .6 } });
  add({ id: 'landuse-res', type: 'fill', 'source-layer': 'landuse', minzoom: 10, filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]], paint: { 'fill-color': C.res, 'fill-opacity': .7 } });
  add({ id: 'landuse-ind', type: 'fill', 'source-layer': 'landuse', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['industrial', 'commercial', 'retail', 'railway']]], paint: { 'fill-color': C.ind } });
  add({ id: 'park', type: 'fill', 'source-layer': 'park', paint: { 'fill-color': C.park, 'fill-opacity': .8 } });
  add({ id: 'water', type: 'fill', 'source-layer': 'water', paint: { 'fill-color': C.water } });
  add({ id: 'waterway', type: 'line', 'source-layer': 'waterway', minzoom: 8, paint: { 'line-color': C.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, .5, 16, 4] } });
  add({ id: 'aeroway', type: 'fill', 'source-layer': 'aeroway', minzoom: 11, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#E0DACE' } });
  add({ id: 'building', type: 'fill', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': C.bld, 'fill-outline-color': C.bldO, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, .4, 16, 1] } });
  const R = (cls) => ['in', ['get', 'class'], ['literal', cls]];
  const roads = [['minor', R(['minor', 'service']), C.road, 12, W(.4, 16)], ['tertiary', R(['tertiary']), C.road, 10, W(.6, 20)], ['secondary', R(['secondary']), C.sec, 9, W(.8, 22)],
    ['primary', R(['primary']), C.pri, 7, W(1, 24)], ['trunk', R(['trunk']), C.trunk, 6, W(1.2, 26)], ['motorway', R(['motorway']), C.mot, 5, W(1.4, 28)]];
  add({ id: 'path', type: 'line', 'source-layer': 'transportation', minzoom: 14, filter: R(['path', 'track']), paint: { 'line-color': '#B5AA98', 'line-width': 1, 'line-dasharray': [2, 1.5] } });
  for (const [id, f, col, mz, w] of roads) add({ id: `road-${id}-casing`, type: 'line', 'source-layer': 'transportation', minzoom: Math.max(mz, 11), filter: ['all', f, ['!=', ['get', 'brunnel'], 'tunnel']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': C.casing, 'line-width': Wc(w) } });
  for (const [id, f, col, mz, w] of roads) add({ id: `road-${id}`, type: 'line', 'source-layer': 'transportation', minzoom: mz, filter: f, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': col, 'line-width': w } });
  add({ id: 'rail', type: 'line', 'source-layer': 'transportation', minzoom: 9, filter: R(['rail', 'transit']), paint: { 'line-color': C.rail, 'line-width': 1.2, 'line-dasharray': [3, 2] } });
  // only land borders between countries (never maritime / disputed)
  add({ id: 'border', type: 'line', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!=', ['get', 'disputed'], 1]], paint: { 'line-color': '#8D8577', 'line-width': 1.2, 'line-dasharray': [4, 2] } });
  add({ id: 'road-label', type: 'symbol', 'source-layer': 'transportation_name', minzoom: 13, filter: notIslands,
    layout: { 'symbol-placement': 'line', 'text-field': name, 'text-font': F, 'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 14], 'text-max-angle': 30, 'symbol-spacing': 300 },
    paint: { 'text-color': '#4A453C', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.6 } });
  add({ id: 'water-label', type: 'symbol', 'source-layer': 'water_name', minzoom: 11, filter: ['all', notIslands, ['in', ['get', 'class'], ['literal', ['lake', 'river']]]],
    layout: { 'text-field': name, 'text-font': F, 'text-size': 12 }, paint: { 'text-color': '#4E7470', 'text-halo-color': C.water, 'text-halo-width': 1 } });
  add({ id: 'poi', type: 'symbol', 'source-layer': 'poi', minzoom: 15, filter: ['all', notIslands, ['<=', ['get', 'rank'], 30]],
    layout: { 'text-field': name, 'text-font': F, 'text-size': 11, 'text-max-width': 8, 'text-anchor': 'top', 'text-offset': [0, .4] },
    paint: { 'text-color': '#6B5E4A', 'text-halo-color': '#FFFFFF', 'text-halo-width': 1.2 } });
  add({ id: 'poi-dot', type: 'circle', 'source-layer': 'poi', minzoom: 15, filter: ['all', notIslands, ['<=', ['get', 'rank'], 30]], paint: { 'circle-radius': 2.5, 'circle-color': '#A0886A' } });
  add({ id: 'housenumber', type: 'symbol', 'source-layer': 'housenumber', minzoom: 17, layout: { 'text-field': ['get', 'housenumber'], 'text-font': F, 'text-size': 10 }, paint: { 'text-color': '#7D7466' } });
  add({ id: 'place-minor', type: 'symbol', 'source-layer': 'place', minzoom: 12, filter: ['all', notIslands, ['in', ['get', 'class'], ['literal', ['village', 'suburb', 'neighbourhood', 'quarter', 'hamlet']]]],
    layout: { 'text-field': name, 'text-font': F, 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13], 'text-transform': 'uppercase', 'text-letter-spacing': .08, 'text-max-width': 8 },
    paint: { 'text-color': '#5E574B', 'text-halo-color': 'rgba(255,255,255,.85)', 'text-halo-width': 1.4 } });
  add({ id: 'place-town', type: 'symbol', 'source-layer': 'place', minzoom: 8, filter: ['all', notIslands, ['in', ['get', 'class'], ['literal', ['city', 'town']]]],
    layout: { 'text-field': name, 'text-font': FB, 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 16], 'text-max-width': 8 },
    paint: { 'text-color': C.ink, 'text-halo-color': 'rgba(255,255,255,.9)', 'text-halo-width': 1.6 } });
  return L.map(fix);
};
window.atlasBasemapAttribution = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a> · OpenMapTiles schema';
window.atlasSatellite = { type: 'raster', tileSize: 256, maxzoom: 13, tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'],
  attribution: 'Ảnh vệ tinh: <a href="https://cloudless.eox.at" target="_blank" rel="noopener">EOxCloudless</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016 &amp; 2017), CC BY 4.0' };
})();

#!/usr/bin/env python3
"""Precompute street & house-number geometry (OpenStreetMap, ODbL, Geofabrik extract) inside every SPLIT old commune,
and how each street is divided between the candidate new communes (thanglequoc full-res boundaries).
Output: app/data-private/osm_split.json (server-only)."""
import json, os, re, sqlite3, glob, unicodedata
import osmium, shapely
from shapely.geometry import shape, LineString, Point, box
from shapely.strtree import STRtree
import vietnamadminunits
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); RAW = f'{ROOT}/raw'; OUT = f'{ROOT}/app/data-private'
def fold(s):
    s = unicodedata.normalize('NFC', s or '').lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9/ ]', ' ', s)).strip()
def skey(s):
    s = fold(s); s = re.sub(r'^(duong|pho|hem|hxh|kiet|ngo|ngach)\s+', '', s); return re.sub(r'\b0+(\d)', r'\1', s)
M = json.load(open(f'{ROOT}/app/public/data/mapping.json'))
db = sqlite3.connect(os.path.join(os.path.dirname(vietnamadminunits.__file__), 'data/dataset.db'))
bounds = {r[0]: r[1] for r in db.execute('select wardCode, wardBounds from admin_units_legacy')}
split = []
for oid, w, d, p, t in M['rows']:
    if len(t) < 2 or not bounds.get(oid): continue
    (a, b), (c, e) = [map(float, x.split(',')) for x in bounds[oid].split(' – ')]
    pad = 0.0015
    split.append(dict(id=oid, cands=[x[0] for x in t], box=box(min(b, e) - pad, min(a, c) - pad, max(b, e) + pad, max(a, c) + pad)))
print('split old wards with bbox:', len(split))
need = {c for s in split for c in s['cands']}; poly = {}
for f in glob.glob(f'{RAW}/tl/json/geojson/*/wards/*.geojson'):
    code = os.path.basename(f).split('_')[0]
    if code in need: poly[code] = shapely.make_valid(shape(json.load(open(f))['features'][0]['geometry']))
tree = STRtree([s['box'] for s in split])
class H(osmium.SimpleHandler):
    def __init__(s): super().__init__(); s.streets = {}; s.addrs = []
    def hits(s, g): return [split[i] for i in tree.query(g)]
    def way(s, w):
        t = w.tags
        hw = 'highway' in t and 'name' in t; ad = 'addr:housenumber' in t and 'addr:street' in t
        if not (hw or ad): return
        try: coords = [(n.lon, n.lat) for n in w.nodes]
        except Exception: return
        if len(coords) < 2: return
        g = LineString(coords)
        if hw:
            for sp in s.hits(g): s.streets.setdefault(sp['id'], []).append((t['name'], g))
        if ad:
            pt = g.centroid
            for sp in s.hits(pt): s.addrs.append((sp['id'], t['addr:street'], t['addr:housenumber'], pt))
    def node(s, n):
        t = n.tags
        if 'addr:housenumber' in t and 'addr:street' in t:
            pt = Point(n.location.lon, n.location.lat)
            for sp in s.hits(pt): s.addrs.append((sp['id'], t['addr:street'], t['addr:housenumber'], pt))
h = H(); h.apply_file(f'{RAW}/vietnam.osm.pbf', locations=True, idx='flex_mem')
print('street hits', sum(len(v) for v in h.streets.values()), 'addr hits', len(h.addrs))
byid = {s['id']: s for s in split}; out = {}
MPD = 111320
for oid, items in h.streets.items():
    sp = byid[oid]; streets = {}
    for name, g in items:
        g = g.intersection(sp['box'])
        if g.is_empty: continue
        k = skey(name); e = streets.setdefault(k, dict(name=name, parts={}, geom=[]))
        e['geom'] += [[[round(x, 5), round(y, 5)] for x, y in l.coords] for l in getattr(g, 'geoms', [g]) if l.geom_type == 'LineString']
        for c in sp['cands']:
            ln = g.intersection(poly[c]).length * MPD if c in poly else 0
            if ln > 1: e['parts'][c] = e['parts'].get(c, 0) + ln
    out[oid] = dict(streets={k: dict(name=v['name'], parts={c: round(l) for c, l in v['parts'].items()}, geom=v['geom']) for k, v in streets.items() if v['parts']}, addrs=[])
for oid, st, hn, pt in h.addrs:
    c = next((c for c in byid[oid]['cands'] if c in poly and poly[c].contains(pt)), None)
    if c: out.setdefault(oid, dict(streets={}, addrs=[]))['addrs'].append([skey(st), fold(hn), round(pt.x, 6), round(pt.y, 6), c, st, hn])
json.dump(out, open(f'{OUT}/osm_split.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('old wards with street data:', sum(1 for v in out.values() if v['streets']), 'with addresses:', sum(1 for v in out.values() if v['addrs']))

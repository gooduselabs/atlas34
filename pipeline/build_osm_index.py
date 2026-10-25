#!/usr/bin/env python3
"""From the Geofabrik Vietnam extract (ODbL): (1) commune HQ points (amenity=townhall / UBND), (2) place-search index sharded per new province.
Every feature is assigned to a NEW commune by point-in-polygon on our official boundaries. Output: app/public/data/hq.geojson, app/public/search/{prov}.json"""
import json, os, re, glob, unicodedata
import osmium, shapely
from shapely.geometry import shape, Point, LineString
from shapely.strtree import STRtree
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def fold(s):
    s = unicodedata.normalize('NFC', s or '').lower().replace('đ', 'd')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn'))).strip()
polys, codes = [], []
for f in glob.glob(f'{ROOT}/app/data-private/pip/*.json'):
    for ft in json.load(open(f))['features']:
        polys.append(shapely.make_valid(shape(ft['geometry']))); codes.append(str(ft['properties']['code']))
tree = STRtree(polys); M = json.load(open(f'{ROOT}/app/public/data/mapping.json'))['wards']
def ward(pt):
    for i in tree.query(pt):
        if polys[i].contains(pt): return codes[i]
KIND = {'place': 'p', 'highway': 's', 'amenity': 'a', 'shop': 'h', 'tourism': 't', 'leisure': 'l', 'office': 'o', 'building': 'b', 'historic': 't', 'railway': 'r', 'aeroway': 'r'}
class H(osmium.SimpleHandler):
    def __init__(s): super().__init__(); s.items = {}; s.hq = []
    def add(s, t, pt):
        name = t.get('name:vi') or t.get('name')
        if not name: return
        k = next((KIND[x] for x in KIND if x in t), None)
        if not k: return
        if k == 'b' and not ('addr:housenumber' in t): return
        c = ward(pt)
        if not c: return
        s.items.setdefault((name, k, c) if k == 's' else (name, k, c, round(pt.x, 4), round(pt.y, 4)), (round(pt.x, 5), round(pt.y, 5)))
        if t.get('amenity') == 'townhall' or re.match(r'^(UBND|Ủy ban nhân dân|Uỷ ban nhân dân)', name, re.I):
            if re.search(r'(phường|xã|đặc khu)', name, re.I): s.hq.append((name, pt.x, pt.y, c))
    def node(s, n):
        if len(n.tags): s.add(n.tags, Point(n.location.lon, n.location.lat))
    def way(s, w):
        t = w.tags
        if not ('name' in t): return
        try: cs = [(n.lon, n.lat) for n in w.nodes]
        except Exception: return
        if len(cs) < 2: return
        g = LineString(cs); pt = g.interpolate(0.5, normalized=True) if 'highway' in t else g.centroid
        s.add(t, pt)
h = H(); h.apply_file(f'{ROOT}/raw/vietnam.osm.pbf', locations=True, idx='flex_mem')
shards = {}
for key, (x, y) in h.items.items():
    name, k, c = key[:3]; shards.setdefault(M[c]['p'], []).append([name, x, y, k, c])
os.makedirs(f'{ROOT}/app/public/search', exist_ok=True)
for p, rows in shards.items(): json.dump(rows, open(f'{ROOT}/app/public/search/{p}.json', 'w'), ensure_ascii=False, separators=(',', ':'))
# HQ: keep the one whose name matches the commune it lies in
hq = {}
for name, x, y, c in h.hq:
    wn = fold(re.sub(r'^(Phường|Xã|Đặc khu) ', '', M[c]['name']))
    if wn and wn in fold(name) and c not in hq: hq[c] = (name, x, y)
json.dump({'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'code': c, 'name': M[c]['name'], 'osm': n}, 'geometry': {'type': 'Point', 'coordinates': [round(x, 6), round(y, 6)]}} for c, (n, x, y) in hq.items()]},
          open(f'{ROOT}/app/public/data/hq.geojson', 'w'), ensure_ascii=False)
print('search items', len(h.items), 'shards', len(shards), 'HQ matched', len(hq), '/ 3321')

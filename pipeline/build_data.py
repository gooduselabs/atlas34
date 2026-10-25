#!/usr/bin/env python3
"""Build all static data for the site.
Inputs: raw/tl (thanglequoc/vietnamese-provinces-database clone), vietnamadminunits (pip),
raw/nq202.pdf (Công báo: NQ 202/2025/QH15). Output: app/public/data/*"""
import json, re, sqlite3, os, sys, unicodedata, subprocess, glob
import vietnamadminunits
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'raw'); OUT = os.path.join(ROOT, 'app/public/data')
VAU = os.path.join(os.path.dirname(vietnamadminunits.__file__), 'data')
nfc = lambda s: unicodedata.normalize('NFC', s)

def fold(s):
    s = nfc(s).lower().replace('đ', 'd')
    s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]', ' ', s).strip()

# ---- NQ 202 ----
txt = subprocess.run(['pdftotext', os.path.join(RAW, 'nq202.pdf'), '-'], capture_output=True, text=True).stdout
txt = re.sub(r'\s+', ' ', nfc(txt))
nq = {}
for m in re.finditer(r'Sắp xếp toàn bộ diện tích tự nhiên, quy mô dân số của (.+?) thành (?:tỉnh|thành phố) mới có tên gọi là (?:tỉnh |thành phố )?(.{2,25}?)\. Sau khi sắp ?xếp,.{0,40}?diện tích tự nhiên là ([\d.,]+) ?km ?(?:2|²)?,? quy mô dân số là ([\d.]+)', txt):
    olds = [re.sub(r'^(tỉnh|thành phố) ', '', x.strip()) for x in re.split(r',| và ', m.group(1)) if x.strip()]
    name = m.group(2).replace('Thành phố ', '')
    nq[fold(name)] = dict(old=olds, area=float(m.group(3).replace('.', '').replace(',', '.')), pop=int(m.group(4).replace('.', '')))
print('NQ202 merged provinces parsed:', len(nq))
assert len(nq) == 23, 'expected 23 merged provinces in NQ 202'

# ---- thanglequoc ----
tl = json.load(open(os.path.join(RAW, 'tl/json/full_json_generated_data_vn_units.json')))
meta = json.load(open(os.path.join(RAW, 'tl/json/vn_provinces_metadata.json')))
db = sqlite3.connect(os.path.join(VAU, 'dataset.db')); db.row_factory = sqlite3.Row
newu = {r['wardCode']: dict(r) for r in db.execute('select * from admin_units')}
newkey = {(r['provinceKey'], r['wardKey']): r['wardCode'] for r in newu.values()}
provkey2code = {r['provinceKey']: r['provinceCode'] for r in newu.values()}
leg = {f"{r['provinceKey']}_{r['districtKey']}_{r['wardKey']}": dict(r) for r in db.execute('select * from admin_units_legacy')}
conv = json.load(open(os.path.join(VAU, 'converter_2025.json')))
legprov = {r['provinceKey']: r['province'] for r in leg.values()}

provinces = []; wards_all = {}
for p in tl:
    code = p['Code']; ws = p.get('Wards') or p.get('wards')
    pk = next((k for k, c in provkey2code.items() if c == code), None)
    olds = [legprov[k] for k in conv['DICT_PROVINCE'].get(pk, [])]
    n = nq.get(fold(p['Name']))
    gj = glob.glob(os.path.join(RAW, f"tl/json/geojson/{code}_*/{code}_*.geojson"))[0]
    props = json.load(open(gj))['features'][0]['properties']
    wl = []
    for w in ws:
        u = newu.get(w['Code'], {})
        wl.append(dict(code=w['Code'], name=w['Name'], full=w['FullName'], type=w['FullName'].split(' ')[0] if not w['FullName'].startswith('Đặc khu') else 'Đặc khu',
                       lat=u.get('wardLat'), lon=u.get('wardLon'), area=u.get('wardAreaKm2'), postal=w.get('PostalCode')))
        wards_all[w['Code']] = dict(name=w['FullName'], p=code)
    provinces.append(dict(code=code, name=p['Name'], full=p['FullName'], en=p['NameEn'], slug=p['CodeName'].replace('_', '-'),
        merged=bool(n), oldProvinces=olds or [p['FullName']],
        area=n['area'] if n else props.get('areaKm2'), areaSource='NQ202' if n else 'thanglequoc-gis',
        population=n['pop'] if n else None, postal=p.get('PostalCodePrefix'),
        center=[newu[wl[0]['code']]['provinceLon'], newu[wl[0]['code']]['provinceLat']] if wl and wl[0]['code'] in newu else None,
        wardCount=len(wl), counts={t: sum(1 for w in wl if w['type'] == t) for t in ('Phường', 'Xã', 'Đặc khu')}))
    json.dump(wl, open(os.path.join(OUT, f'wards/{code}.json'), 'w'), ensure_ascii=False)

# ---- old -> new mapping ----
legacy = {}
def L(k):
    r = leg[k]
    return legacy.setdefault(k, dict(id=r['wardCode'] or k, w=r['ward'], d=r['district'], p=r['province'], t=[]))
for npk, m in conv['DICT_PROVINCE_WARD_NO_DIVIDED'].items():
    for nwk, lks in m.items():
        c = newkey.get((npk, nwk))
        for lk in lks:
            if lk in leg and c: L(lk)['t'].append(dict(c=c, def_=True))
for npk, m in conv['DICT_PROVINCE_WARD_DIVIDED'].items():
    for lk, cands in m.items():
        if lk not in leg: continue
        e = L(lk)
        for cd in cands:
            c = newkey.get((npk, cd['newWardKey']))
            if c and all(x['c'] != c for x in e['t']): e['t'].append(dict(c=c, def_=cd['isDefaultNewWard']))
rows = []
for e in legacy.values():
    e['t'] = [[x['c'], 1 if x['def_'] else 0] for x in e['t']]
    rows.append([e['id'], e['w'], e['d'], e['p'], e['t']])
rows.sort(key=lambda r: (r[3], r[2], r[1]))
split = sum(1 for r in rows if len(r[4]) > 1)
json.dump(dict(rows=rows, wards=wards_all), open(os.path.join(OUT, 'mapping.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
stats = dict(provinces=len(provinces), wards=len(wards_all), legacyWards=len(rows), legacyTotal=len(leg), splitLegacyWards=split,
             unmappedLegacy=len(leg) - len(rows), dataset=meta, mappingSource='vietnamadminunits ' + getattr(vietnamadminunits, '__version__', '1.0.4'))
json.dump(dict(provinces=provinces, stats=stats), open(os.path.join(OUT, 'provinces.json'), 'w'), ensure_ascii=False)
print(json.dumps(stats, ensure_ascii=False))
assert len(provinces) == 34 and len(wards_all) == 3321

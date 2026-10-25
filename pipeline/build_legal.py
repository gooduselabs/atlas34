#!/usr/bin/env python3
"""Parse UBTVQH commune-level resolutions into per-new-commune clauses (legal basis) and spot-check the split mapping.
Currently: TP.HCM NQ 1685/NQ-UBTVQH15 (full text mirror atld.vn/law/3731/content; official listing: tphcm.chinhphu.vn)."""
import json, os, re, html, unicodedata
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
nfc = lambda s: unicodedata.normalize('NFC', s)
def fold(s):
    s = nfc(s).lower().replace('đ', 'd'); s = ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]', ' ', s)).strip()
SRC = [dict(p='79', nq='1685/NQ-UBTVQH15', date='16/06/2025', file='raw/nq1685_atld.html', url='https://atld.vn/law/3731/content',
            official='https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-quyet-so-1685-nq-ubtvqh15-sap-xep-cac-dvhc-cap-xa-cua-thanh-pho-ho-chi-minh-nam-2025-119250616211341304.htm')]
M = json.load(open(f'{ROOT}/app/public/data/mapping.json')); out = {}; report = []
for s in SRC:
    t = re.sub(r'<[^>]+>', ' ', open(f"{ROOT}/{s['file']}", encoding='utf-8', errors='ignore').read())
    t = re.sub(r'\s+', ' ', nfc(html.unescape(t)))
    cl = {}
    for k, txt in re.findall(r'(\d{1,3})\. (Sắp xếp .{20,1500}? có tên gọi là (?:phường|xã|đặc khu) .{2,30}?\.)(?= \d{1,3}\. | Điều)', t):
        name = re.search(r'có tên gọi là ((?:phường|xã|đặc khu) .+?) ?\.$', txt).group(1)
        cl[fold(name)] = dict(k=int(k), text=txt.replace(' .', '.'))
    out[s['p']] = dict(nq=s['nq'], date=s['date'], url=s['official'], textUrl=s['url'], clauses=cl)
    # spot-check: for every split old ward in this province, each candidate clause must mention the old ward as "một phần"/"phần còn lại"
    for oid, w, d, p, tg in M['rows']:
        if len(tg) < 2: continue
        news = [M['wards'][c] for c, _ in tg]
        if news[0]['p'] != s['p']: continue
        short = fold(re.sub(r'^(Phường|Xã|Thị trấn) ', '', w))
        for c, _ in tg:
            nm = fold(M['wards'][c]['name']); c_ = cl.get(nm)
            ok = bool(c_) and re.search(r'(mot phan|phan con lai).{0,200}\b' + re.escape(fold(w.split(' ')[0])) + r'.{0,40}' + re.escape(short), fold(c_['text']))
            if not ok: report.append(dict(old=f'{w}, {d}', new=M['wards'][c]['name'], clause=c_ and c_['k']))
json.dump(out, open(f'{ROOT}/app/data-private/legal.json', 'w'), ensure_ascii=False)
print('clauses', {k: len(v['clauses']) for k, v in out.items()}, 'spot-check issues', len(report)); print(json.dumps(report[:15], ensure_ascii=False, indent=0))

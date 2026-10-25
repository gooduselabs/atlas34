#!/usr/bin/env python3
"""Cross-check our built counts against provinces.open-api.vn v2 (independent source). Exit 1 on mismatch."""
import json, os, sys, urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ours = json.load(open(os.path.join(ROOT, 'app/public/data/provinces.json')))
get = lambda u: json.load(urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'vn-map-pipeline'}), timeout=60))
p = get('https://provinces.open-api.vn/api/v2/p/'); w = get('https://provinces.open-api.vn/api/v2/w/')
ourw = {x['code']: None for pr in ours['provinces'] for x in json.load(open(os.path.join(ROOT, f"app/public/data/wards/{pr['code']}.json")))}
theirw = {str(x['code']).zfill(5) for x in w}
r = dict(ours_provinces=len(ours['provinces']), api_provinces=len(p), ours_wards=len(ourw), api_wards=len(w),
         codes_only_ours=sorted(set(ourw) - theirw)[:20], codes_only_api=sorted(theirw - set(ourw))[:20])
print(json.dumps(r, ensure_ascii=False)); json.dump(r, open(os.path.join(ROOT, 'app/public/data/count_check.json'), 'w'))
sys.exit(0 if r['ours_provinces'] == r['api_provinces'] == 34 and r['ours_wards'] == r['api_wards'] == 3321 and not r['codes_only_ours'] else 1)

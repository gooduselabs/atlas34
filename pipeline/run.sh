#!/usr/bin/env bash
# Reproducible data build. Requires: git, python3, pip, poppler-utils (pdftotext), node + mapshaper.
set -euo pipefail; cd "$(dirname "$0")/.."; mkdir -p raw
[ -d raw/tl ] && git -C raw/tl pull -q --depth 1 || git clone -q --depth 1 https://github.com/thanglequoc/vietnamese-provinces-database.git raw/tl
pip install -q --break-system-packages 'vietnamadminunits==1.0.4' 2>/dev/null || pip install -q 'vietnamadminunits==1.0.4'
# NQ 202/2025/QH15 — Công báo Chính phủ (official PDF)
[ -f raw/nq202.pdf ] || curl -sfL -A Mozilla/5.0 -o raw/nq202.pdf "https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2025/6/45050/56708-1-2025773-774202-2025-qh15.pdf"
command -v mapshaper >/dev/null || npm i -g mapshaper
python3 pipeline/build_data.py
pipeline/build_geo.sh
python3 pipeline/count_check.py
# OSM streets/house numbers for split communes (ODbL) + legal clauses
[ -f raw/vietnam.osm.pbf ] || curl -sfL -o raw/vietnam.osm.pbf https://download.geofabrik.de/asia/vietnam-latest.osm.pbf
pip install -q --break-system-packages osmium shapely 2>/dev/null || true
python3 pipeline/build_osm.py
[ -f raw/nq1685_atld.html ] || curl -sfL -A Mozilla/5.0 -o raw/nq1685_atld.html https://atld.vn/law/3731/content
python3 pipeline/build_legal.py

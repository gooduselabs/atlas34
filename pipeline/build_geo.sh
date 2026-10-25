#!/usr/bin/env bash
# Simplify thanglequoc GeoJSON (source: sapnhap.bando.com.vn, island patch for Hoàng Sa/Trường Sa) -> app/public/geo
set -euo pipefail
cd "$(dirname "$0")/.."; T=raw/tl/json/geojson; O=app/public/geo; mkdir -p $O/wards
mapshaper -i $T/*/[0-9][0-9]_*.geojson combine-files -merge-layers force -filter-fields code,name,fullName,nameEn,areaKm2 \
  -simplify 4% keep-shapes weighted -clean -o $O/provinces.json format=geojson precision=0.0001
for d in $T/*/; do c=$(basename $d | cut -d_ -f1)
  mapshaper -i $d/wards/*.geojson combine-files -merge-layers force -filter-fields code,name,fullName,areaKm2 \
    -simplify 4% keep-shapes weighted -o $O/wards/$c.json format=geojson precision=0.00005 2>/dev/null
done
# province borders as lines + label points
mapshaper -i $O/provinces.json -innerlines -o $O/borders.json format=geojson
ls -la $O; du -sh $O/wards
# server-only higher-precision polygons for point-in-polygon (address resolution)
mkdir -p app/data-private/pip
for d in $T/*/; do c=$(basename $d | cut -d_ -f1)
  mapshaper -i $d/wards/*.geojson combine-files -merge-layers force -filter-fields code -simplify 25% keep-shapes -o app/data-private/pip/$c.json format=geojson precision=0.00001 2>/dev/null
done

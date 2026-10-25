# Atlas 34 — Bản đồ hành chính Việt Nam sau sắp xếp 2025

**Web:** https://gooduselabs.github.io/atlas34/

🇻🇳 Bản đồ 34 tỉnh/thành và 3.321 xã/phường/đặc khu (từ 1/7/2025). Có công cụ đổi địa chỉ cũ ↔ mới. Với xã cũ bị chia cho nhiều xã mới, trang xác định đúng đơn vị mới theo số nhà/đường (OpenStreetMap), theo điểm chọn trên bản đồ hoặc theo GPS, kèm trích dẫn nghị quyết. Mỗi tỉnh có trang riêng: các tỉnh cũ đã hợp nhất, diện tích/dân số (NQ 202/2025/QH15), lãnh đạo có ghi nguồn, danh sách xã.

🇬🇧 Interactive atlas of Vietnam's 34 provinces and 3,321 communes after the 2025 reform. It includes an old ↔ new address converter that resolves split communes by house number or street (OSM), by map click or by GPS, with legal citations. Each province page lists the merged old provinces, area and population, sourced leaders and communes.

<img src="docs/screenshots/p3-convert-result.png" width="260"> <img src="docs/screenshots/p5-province.png" width="260"> <img src="docs/screenshots/01-home-desktop.png" width="520">

## Chạy / Run
- **GitHub Pages (tĩnh / static):** `cd app && npm ci && BASE=/atlas34 node scripts/build-static.mjs` → `app/dist`. Mỗi lần push lên `main`, `.github/workflows/pages.yml` tự triển khai.
- **Docker (có trang quản trị / with admin):** `cp .env.example .env` (đặt `ADMIN_PASSWORD`) → `docker compose up -d --build` → `http://host:3300`, `/admin`.

## Dữ liệu / Data
- `pipeline/run.sh` dựng lại toàn bộ dữ liệu (rebuilds all data) và kiểm đếm 34/3.321 với provinces.open-api.vn.
- Lãnh đạo và thông tin tỉnh nằm trong `app/content/leaders.json` và `app/content/facts.json` (sửa trực tiếp / edit directly). Muốn duyệt một mục thì đặt `"status": "approved"`.
- Mỗi thứ Hai, `leaders.yml` chạy lại pipeline lãnh đạo (Wikipedia → Wikidata → cổng TTĐT) và mở Pull Request để bạn duyệt (weekly PR for review).
- Nguồn và giấy phép / Sources & licenses: [ATTRIBUTION.md](ATTRIBUTION.md).

## Bản đồ nền đường phố (OSM vector) / Street basemap
- Planetiler (OpenMapTiles schema) từ Geofabrik Vietnam → `vietnam.pmtiles` (z0–14, ~304 MiB), tách bằng `pmtiles extract` thành 6 file < 100 MB: `vn-lo` (z0–11) + `vn-nw/ne/nc/sc/s` (z12–14, ranh theo lưới tile z12 nên không chồng lấn). Manifest: `app/tiles/tiles.json`.
- Hosting: file `.pmtiles` là asset của GitHub Release `basemap-tiles` (không commit vào git). `pages.yml` tải về `app/tiles/` lúc build → Pages phục vụ cùng site (Range OK). Bản Mac Docker mount `./app/tiles:/app/tiles:ro`, Express phục vụ `/tiles` có Range + CORS.
- Tái tạo: `docker run -v $PWD:/data ghcr.io/onthegomap/planetiler --download --area=vietnam --output=/data/vietnam.pmtiles --maxzoom=14`, rồi tách như trên.
- Chủ quyền: ẩn ranh giới biển/tranh chấp, ẩn tên biển/đảo nước ngoài; mặt nạ biển phía đông; Hoàng Sa (Đà Nẵng), Trường Sa (Khánh Hòa) luôn hiển thị từ lớp hành chính. Nhãn "Biển Đông".
- Ảnh vệ tinh tùy chọn: EOX Sentinel-2 cloudless 2016 (CC BY 4.0), tối đa z13.
- © OpenStreetMap contributors (ODbL) · © OpenMapTiles.

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

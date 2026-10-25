# Changelog

## 2.0.0 — 2026-10-25
- Giao diện sáng/tối cho toàn site và bản đồ (kể cả nền OSM), nút chuyển trên masthead.
- Di động: nội dung thành bottom-sheet 3 mức kéo trên bản đồ; sửa layout masthead.
- Dán nguyên địa chỉ cũ → địa chỉ mới (trang chủ và bộ đổi địa chỉ); nút "Dùng vị trí của tôi" trên trang chủ.
- Trạng thái đang tải (skeleton), hộp lỗi có nút thử lại, toast thay alert; site không còn trắng trơn khi tile nền hỏng.
- Tra cứu gần đây (localStorage).
- 3.321 trang xã `/xa/<slug>-<mã>` có SEO, redirect slug chuẩn, sitemap; build tĩnh crawl theo sitemap.
- Trang "Hàng loạt" (CSV in/out) + `POST /api/bulk` với hạn mức theo IP và khoá API; tab Khoá API trong /admin.
- MapLibre GL 4.7 → 5.24. 24 API test.

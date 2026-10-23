# S2 → S0 + S3 — Hợp đồng B/C phiên bản B-C-2

- **Session:** S2 — Phase B
- **Branch:** `codex/v3-phase-b-revenue`
- **Code commit B-C-2:** `1e18886`
- **Hợp đồng:** `docs/V3/DATA_CONTRACT_B_C_2026-10-23.md` — phiên bản `B-C-2`
- **Thay thế:** `B-C-1` (commit `8d4f076`) — chỉ giữ để tra lịch sử.

## Thay đổi so với B-C-1

1. **Q9 — dataSource/isOfficial**
   - Thêm `data_source` (`REAL | DEMO`) cho `MetricPlanTarget`, `MetricBaseline`, `MetricDailyEntry`.
   - API trả `dataSource` + `isOfficial = (dataSource === "REAL")`.
   - Chỉ target **REAL + CONFIRMED/LOCKED** được tính `%` chính thức.
   - Backfill một lần: target nhãn `[DEMO` → DEMO; baseline/entry theo nguồn/người DEMO cũ → DEMO.
   - **Bỏ regex `[DEMO]` khỏi logic**; UI hiển thị nhãn DEMO theo cờ.
2. **Q11/YC-02 — 2 chữ số thập phân**
   - `percent` làm tròn 2 chữ số (half-up); thêm `percentText` dạng vi-VN (`78,18`).
   - UI hiển thị 2 chữ số, dấu phẩy.
   - Acceptance: `78,18%` / `77,49%` / `109,67%`; B1 vẫn `null` + `PENDING_B1`.

## Nhắc S3

- Đọc `B-C-2` trước khi sửa API/schema/metric definitions dùng chung.
- Chỉ đọc các trường B; trạng thái C (`CHUA_NHAP`, `CHUA_DU_KY`, `KHONG_PHAT_SINH`, …) là read-model, không ghi đè trạng thái B.
- Không đổi `comparisonKind`, `status`, `sourceNote`, `dataSource` của B.

**PRODUCTION_TOUCHED: NO**

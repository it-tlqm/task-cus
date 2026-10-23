# S2 → S0 + S3 — Thông báo hợp đồng dữ liệu B/C

> **ĐÃ THAY THẾ bởi `B-C-2`** — xem `S2_CONTRACT_B_C_2_NOTICE_2026-10-23.md` và commit `1e18886`.


- **Session:** S2 — Phase B
- **Branch:** `codex/v3-phase-b-revenue`
- **Base:** `50daed3` (docs) / `a68d31e` (code)
- **Contract commit:** `8d4f076`
- **Tài liệu:** `docs/V3/DATA_CONTRACT_B_C_2026-10-23.md` (`B-C-1`)
- **Thời điểm:** 23/10/2026

## Nội dung đã gửi

1. Phân biệt `MetricDailyEntry` (FLOW/BALANCE) với `MetricBaseline` (mốc lũy kế MONTH/QUARTER/YEAR/LEDGER) và công thức chống cộng trùng.
2. Quy ước `null` khác `0`; trạng thái B: `PROPOSED → CONFIRMED → LOCKED` cho target/baseline; entry giữ `DRAFT/RECORDED/SUBMITTED/CONFIRMED/NEEDS_FIX`.
3. Hợp đồng API `GET /api/metrics/summary?...&comparison=1` phiên bản `B-C-1`; sử dụng `comparisonKind` tường minh (`BTC_YEAR`, `UBND_YEAR`, `MONTH_PLAN`) thay vì dò nhãn.
4. B1 PENDING: `prevMonth`/`samePeriodLastYear` luôn `percent=null`, `ruleState="PENDING_B1"`; không công bố % khi chưa chốt.
5. Quyền nghiệp vụ `metrics.config` / `metrics.entry_all`; không dùng `system.config`; SYSTEM_ADMIN không mặc nhiên có quyền nghiệp vụ.
6. Audit/revision cho target/baseline; migration additive; dữ liệu cũ để `comparison_kind=NONE`, không suy đoán.

## Đề nghị

- S3 đọc và xác nhận `B-C-1` trước khi sửa API/schema/metric definitions dùng chung.
- S3 chỉ đọc các trường B; phần trạng thái C (`CHUA_NHAP`, `CHUA_DU_KY`, `KHONG_PHAT_SINH`, …) triển khai bằng lớp tính toán/read-model, không ghi đè trạng thái B.
- S0 ghi nhận `B-C-1` là baseline hợp đồng cho thứ tự tích hợp S2 → S3.
- Mọi thay đổi phá vỡ hợp đồng phải được S2 + S0 chấp thuận bằng văn bản.

**PRODUCTION_TOUCHED: NO**

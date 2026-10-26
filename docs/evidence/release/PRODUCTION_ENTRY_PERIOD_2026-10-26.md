# Nhập số liệu theo kỳ — 26/10/2026

## Phạm vi

Bổ sung kỳ nhập riêng cho từng chỉ tiêu giao ban:

- **Thu NSNN**: theo ngày.
- **Chỉ tiêu số dư** (nợ thuế, tờ khai chờ tham vấn…): mặc định theo tháng.
- **Các chỉ tiêu còn lại**: mặc định theo tuần.
- Quản trị có thể đổi kỳ nhập từng chỉ tiêu thành Ngày/Tuần/Tháng/Quý/Năm trong **Cấu hình số liệu → Nhóm & chỉ tiêu**.

Số nhập theo kỳ là **tổng phát sinh trong kỳ**, lưu tại **ngày cuối kỳ**. Cho phép nhập trước khi kỳ kết thúc (kỳ đã bắt đầu).

## Production

- **Code:** `7f927b0`
- **Deployment:** `dpl_7i38juFJYYUKMHTZFbxyWoKyeww2`
- **URL:** `https://task-cus.vercel.app`
- **Health:** `db=up`, `commit=7f927b0`
- **Migration:** không có migration mới.
- **Cấu hình kỳ nhập:** lưu tạm trong `MetricDefinition.derivation.entryPeriod` để tránh migration khi chưa có backup Production. Khi có backup sẽ chuyển thành cột riêng.

## Thay đổi chính

### Trang Nhập số liệu

- Thêm 5 tab: **Ngày / Tuần / Tháng / Quý / Năm**.
- Mỗi tab chỉ hiện các chỉ tiêu có kỳ nhập tương ứng.
- Hiển thị rõ kỳ đang nhập, khoảng ngày và ngày lưu.
- Nút chuyển kỳ trước/sau đi theo tuần/tháng/quý/năm, không chỉ theo ngày.
- Ẩn công cụ “Tính từ lũy kế” ở chế độ theo kỳ (chỉ dùng cho Thu NSNN theo ngày).

### API

- `GET /api/metrics/entries?date=...&entryPeriod=WEEK|MONTH|QUARTER|YEAR`
  - Lọc chỉ tiêu theo kỳ nhập.
  - Trả giá trị đã lưu tại ngày cuối kỳ.
- `POST /api/metrics/entries` nhận thêm `entryPeriod` và `periodDate`.
  - Tự tính ngày cuối kỳ.
  - Chặn nhập kỳ chưa bắt đầu.
  - Cho phép nhập kỳ hiện tại trước ngày kết thúc.
  - Chặn nhập chồng nếu trong kỳ đã có bản ghi ngày khác.
- `MetricSummaryRow` trả thêm `entryPeriod`.

### Báo cáo giao ban

- Chỉ tiêu nhập theo tháng không hiện ở cột Tuần.
- Chỉ tiêu nhập theo quý chỉ hiện ở cột Quý/Năm.
- Chỉ tiêu nhập theo năm chỉ hiện ở cột Năm.
- Chỉ tiêu tuần/ngày vẫn cộng lên tháng/quý/năm.

### Cấu hình

- API admin trả và nhận `entryPeriod`.
- UI admin có chọn **Kỳ nhập** khi tạo/sửa chỉ tiêu.
- Thu NSNN bị khóa ở kỳ Ngày.
- Chỉ tiêu khác mặc định Tuần; số dư mặc định Tháng.

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-entry-period.ts` | 19/19 PASS |
| `scripts/test-ux-phase3b-routine-declaration.ts` | 35/35 PASS |
| `scripts/test-cumulative-helper.ts` | 9/9 PASS |
| `scripts/test-ux-phase4-polish.ts` | 7/7 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Local API `entryPeriod=DAY` | Chỉ trả `THU_NSNN` |
| Local API `entryPeriod=WEEK` | Trả 43 chỉ tiêu, ngày cuối kỳ `2026-11-01` |
| Local API `entryPeriod=MONTH` | Trả 2 chỉ tiêu số dư |
| Local POST kỳ tuần | Lưu 123, đọc lại 123, xóa sạch |
| Admin API đổi kỳ | `WEEK → QUARTER → WEEK` PASS |

## Lưu ý vận hành

1. Dữ liệu cũ của chỉ tiêu không phải Thu NSNN nếu đang có bản ghi ngày trong cùng kỳ sẽ chặn nhập kỳ. Cần xóa/chuyển các bản ghi ngày cũ trước khi nhập tổng kỳ.
2. Chỉ tiêu mặc định Tuần; chỉ tiêu nào thực tế nhập Tháng/Quý/Năm phải đổi trong **Cấu hình số liệu**.
3. Chỉ tiêu số dư mặc định Tháng; nếu cần theo quý/năm thì đổi cấu hình.
4. Số liệu kỳ hiện tại lưu ở ngày cuối kỳ (có thể là ngày tương lai). Báo cáo sẽ tính khi kỳ nằm trong phạm vi xem.

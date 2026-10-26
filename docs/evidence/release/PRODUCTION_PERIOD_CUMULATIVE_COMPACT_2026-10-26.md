# Lũy kế theo kỳ + hiển thị tỷ — 26/10/2026

## Production

- **Code:** `e4fe0ee`
- **Deployment:** `dpl_EKE5yLoXaVgPt4P6FuGuHUkL1kZH`
- **URL:** `https://task-cus.vercel.app`
- **Health:** `db=up`, `commit=e4fe0ee`
- **Migration:** không có.

## 1. Nhập lũy kế cho Tuần/Tháng/Quý/Năm

Đã bật nút **Tính từ lũy kế** cho các chỉ tiêu phát sinh ở mọi tab kỳ (trước đây chỉ có tab Ngày).

Cách tính:

- Người dùng nhập **lũy kế đến cuối kỳ**.
- Hệ thống tự lấy **lũy kế đến ngày trước ngày bắt đầu kỳ** (tức cuối kỳ trước).
- Tự điền:
  ```
  Phát sinh trong kỳ = lũy kế cuối kỳ − lũy kế cuối kỳ trước
  ```
- Ví dụ Tuần 44/2026:
  - Nhập lũy kế đến 01/11/2026.
  - Hệ thống lấy lũy kế đến 25/10/2026.
  - Tự điền tổng phát sinh Tuần 44.
- Áp dụng cho Tuần, Tháng, Quý, Năm.
- Chỉ tiêu **Số dư** không dùng công cụ này vì là số tại thời điểm.

### API

`GET /api/metrics/entries/cumulative` nhận thêm `entryPeriod`.

- `entryPeriod=DAY`: lấy lũy kế hôm trước.
- `entryPeriod=WEEK|MONTH|QUARTER|YEAR`: lấy lũy kế đến ngày trước ngày bắt đầu kỳ.
- Trả thêm `period` và `previousDate`.

## 2. Hiển thị số lớn theo tỷ/triệu

Đã thêm `fmtMetricCompact`:

- `2.651.813.870.360` → **2.651,81 tỷ**
- `134.872.416` → **134,87 triệu**
- Số nhỏ giữ nguyên.
- Giá trị gốc vẫn nằm trong tooltip/title.

Áp dụng tại:

- Bảng **Số liệu giao ban** trên Dashboard chính.
- Bảng **Số liệu giao ban** trong V4.
- Bảng **So sánh kết quả thu NSNN**.
- Chip **chỉ tiêu giao** tại `/giao-ban`.
- Bảng tổng hợp `/giao-ban` (giá trị gốc trong tooltip).

## Kiểm tra

| Hạng mục | Kết quả |
|---|---|
| `scripts/test-period-cumulative.ts` | 10/10 PASS |
| `scripts/test-cumulative-helper.ts` | 9/9 PASS |
| `scripts/test-entry-period.ts` | 19/19 PASS |
| `scripts/test-comparison-config.ts` | 13/13 PASS |
| `scripts/test-dashboard-v4.ts` | 16/16 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| Local API lũy kế tuần | previousDate `2026-10-25`; đọc đúng; đã xóa bản ghi test |
| Production health | PASS |

## Lưu ý

- Nếu trong kỳ đã có bản ghi ngày cũ cho cùng chỉ tiêu, hệ thống vẫn chặn nhập chồng số kỳ.
- Tỷ lệ BTC/UBND/KH vẫn cao vì 3 target Production đang thiếu 3 số 0; chưa tự sửa khi chưa xác nhận nguồn.

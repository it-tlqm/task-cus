# Nhập lũy kế ngày (open metrics)

## Cách dùng

1. Vào **Cấu hình giao ban → Nhóm & chỉ tiêu**, sửa chỉ tiêu.
2. Chọn **Kiểu: Lũy kế ngày**.
3. Vào **Mốc lũy kế**, tạo mốc **Số mở đầu kỳ** trước ngày bắt đầu nhập.
4. Tại **Nhập số liệu**, mỗi dòng có 2 kiểu nhập:
   - **Phát sinh**: số phát sinh trong kỳ. Hệ thống tự cộng vào lũy kế trước kỳ.
   - **Lũy kế**: tổng lũy kế đến cuối kỳ.

Mặc định là **Phát sinh** để không phải tự tính tổng lũy kế. Chuyển sang **Lũy kế** sẽ hiện tổng đã lưu để đối chiếu/sửa.

## Cách tính

- Nhập phát sinh: lũy kế mới = lũy kế trước kỳ + số phát sinh.
- Nhập lũy kế: giữ nguyên tổng người dùng nhập.
- Ngày = lũy kế hôm nay − lũy kế hôm trước.
- Tháng = lũy kế cuối tháng − lũy kế đầu tháng.
- Năm = lũy kế cuối năm − lũy kế đầu năm.
- Chỉ tiêu **Số phát sinh** giữ nguyên cách tính cộng dồn.

## Lưu ý

- Số lưu trong CSDL luôn là số lũy kế chuẩn hoá; không cần thêm cột.
- Khi mở lại, màn hình hiển thị số phát sinh của kỳ; bấm **Lũy kế** để xem tổng.
- Chỉ tiêu đã có dữ liệu nên chuyển kiểu vào đầu kỳ, trước khi nhập tiếp.
- Cấu hình lưu trong `MetricDefinition.derivation.inputMode`, không cần migration.

## Kiểm thử

```bash
npx tsx scripts/test-entry-input-mode.ts
npx tsx scripts/test-cumulative-mode.ts
```

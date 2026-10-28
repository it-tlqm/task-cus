# Nhập lũy kế ngày (open metrics)

## Cách dùng

1. Vào **Cấu hình giao ban → Nhóm & chỉ tiêu**, sửa chỉ tiêu.
2. Chọn **Kiểu: Lũy kế ngày**.
3. Vào **Mốc lũy kế**, tạo mốc **Số mở đầu kỳ** trước ngày bắt đầu nhập.
4. Tại **Nhập số liệu**, nhập số lũy kế đến ngày cho chỉ tiêu đó.

## Cách tính

- Ngày = lũy kế hôm nay − lũy kế hôm trước.
- Tháng = lũy kế cuối tháng − số mở đầu kỳ.
- Năm = lũy kế cuối năm − số mở đầu kỳ.
- Chỉ tiêu **Số phát sinh** giữ nguyên cách tính cộng dồn.

## Lưu ý

- Không trộn số phát sinh và số lũy kế trong cùng một chỉ tiêu.
- Chỉ tiêu đã có dữ liệu nên chuyển kiểu vào đầu kỳ, trước khi nhập tiếp.
- Cấu hình lưu trong `MetricDefinition.derivation.inputMode`, không cần migration.

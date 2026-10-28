# Nhập phát sinh hoặc lũy kế

## Cách dùng

Tại **Nhập số liệu**, mỗi chỉ tiêu phát sinh (FLOW) có 2 kiểu nhập cho từng dòng:

- **Phát sinh** (mặc định): số phát sinh trong kỳ.
- **Lũy kế**: tổng lũy kế đến cuối kỳ.

Hệ thống tự quy đổi về đúng dạng lưu của chỉ tiêu:

| Dạng lưu của chỉ tiêu | Nhập phát sinh | Nhập lũy kế |
| --- | --- | --- |
| Số phát sinh | Giữ nguyên | Trừ lũy kế đầu kỳ để ra phát sinh |
| Lũy kế ngày | Cộng vào lũy kế đầu kỳ | Giữ nguyên |

## Lũy kế đầu kỳ

- Chỉ tiêu lưu **lũy kế**: lấy bản ghi lũy kế gần nhất trước kỳ, hoặc mốc **Số mở đầu kỳ**.
- Chỉ tiêu lưu **phát sinh**: lấy mốc **YEAR** gần nhất + tổng phát sinh sau mốc đến hết ngày trước kỳ.
- Khi chọn **Lũy kế**, màn hình hiện dòng **Lũy kế trước kỳ** để đối chiếu trước khi lưu.

## Cách tính báo cáo

- Chỉ tiêu lưu phát sinh: cộng dồn các số phát sinh trong kỳ.
- Chỉ tiêu lưu lũy kế: lũy kế cuối kỳ − lũy kế đầu kỳ.
- Không thêm cột CSDL, không cần migration.

## Lưu ý

- Chỉ tiêu **Số dư** (BALANCE) không có 2 kiểu nhập; nhập trực tiếp số dư.
- Nếu lũy kế trước kỳ hiển thị 0 hoặc không đúng, kiểm tra mốc YEAR/OPENING trước khi lưu.
- Chuyển kiểu nhập sẽ giữ lại số đã có để đối chiếu, không xóa dữ liệu.

## Kiểm thử

```bash
npx tsx scripts/test-entry-input-mode.ts
npx tsx scripts/test-cumulative-mode.ts
```

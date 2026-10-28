# Nhập số liệu giao ban bằng Excel

## Phạm vi

Áp dụng cho **mọi chỉ tiêu** người dùng được phân công nhập, không chỉ Thu NSNN:

- Chỉ tiêu số phát sinh (INCREMENTAL).
- Chỉ tiêu lũy kế ngày (CUMULATIVE).
- Chỉ tiêu số dư (BALANCE).
- Chỉ tiêu có nhiều phân loại (Ô tô, Than cốc, Hàng hóa khác…).

## Cách dùng

1. Vào **Số liệu giao ban → Nhập số liệu**, chọn kỳ và ngày neo như khi nhập tay.
2. Bấm **Nhập Excel**.
3. Bấm **Tải file mẫu** — file chỉ chứa các chỉ tiêu/phân loại bạn được nhập.
4. Điền cột **Giá trị** theo đúng đơn vị hiển thị (đồng, USD, xe…).
5. Chọn file, kiểm tra bảng xem trước, bấm **Nhập N ô**.

## Cột trong file mẫu

| Cột | Bắt buộc | Ghi chú |
| --- | --- | --- |
| Mã chỉ tiêu | Có | Khớp mã trong Cấu hình giao ban, không phân biệt hoa/thường |
| Tên chỉ tiêu | Không | Chỉ để đọc |
| Phân loại | Khi chỉ tiêu có nhiều phân loại | Khớp nhãn phân loại |
| Đơn vị | Không | Chỉ để đọc |
| Giá trị | Có | Bỏ trống thì bỏ qua dòng |
| Ghi chú | Không | Lưu vào ghi chú của ô số liệu |

## Quy tắc đọc số

- `1.363.106.886.324` → `1363106886324`
- `236.643.983,94` → `236643983.94`
- `1234.56` → `1234.56`
- `1 234` → `1234`
- `-26,92` → `-26.92`

## An toàn dữ liệu

- File được kiểm tra trước; dòng lỗi hiển thị rõ số dòng và lý do.
- Dòng trùng chỉ nhận dòng đầu tiên.
- Chỉ tiêu không thuộc quyền nhập hoặc không đúng kỳ nhập bị từ chối.
- Dữ liệu ghi qua đúng API nhập hiện có, giữ nguyên kiểm tra quyền, ngày nhập, phân loại và nhật ký sửa.
- Mỗi lần gửi tối đa 200 dòng/lô; file lớn được chia lô tự động.
- Ô trống trong file không xóa số đã nhập trên hệ thống.

## Kiểm thử

```bash
npx tsx scripts/test-metric-excel-import.ts
npx tsx scripts/test-ux-phase5.ts
```

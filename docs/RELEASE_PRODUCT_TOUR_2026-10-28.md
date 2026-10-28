# Release: Product Tour (Production 28/10/2026)

## Phạm vi

Thêm **Product Tour 6 bước** cho người dùng:

1. Tổng quan điều hành — số thu, chỉ tiêu, biểu đồ.
2. Số liệu giao ban — bảng tổng hợp, tab chi tiết/so sánh.
3. Nhập số liệu — chọn **Phát sinh** hoặc **Lũy kế**.
4. Công việc của tôi — việc cần xử lý, hạn, tiến độ.
5. Báo cáo — xem trước, chốt kỳ, xuất Excel.
6. Thông báo — giao việc, phê duyệt, nhắc hạn.

## Cách chạy

- **Tự chạy lần đầu đăng nhập** sau khoảng 1,4 giây.
- Có **Bỏ qua**, **Quay lại**, **Tiếp tục**, **Hoàn tất**; đóng bằng `Esc`.
- Trạng thái hoàn thành lưu theo tài khoản trên trình duyệt:
  `talung.productTour.v1.<username>`.
- Mở lại: **Hướng dẫn → Bắt đầu tour**, hoặc mở `/v5?tour=1`.

## Giao diện

- Spotlight làm tối nền, khoanh vùng đang nói tới.
- Thẻ hướng dẫn có số bước, tiến độ, nội dung ngắn.
- Tự điều hướng sang đúng trang của từng bước.
- Bám theo khi cuộn/đổi kích thước; responsive mobile.
- Không cần migration CSDL.

## Deploy

- Branch: `release/metrics-dual-input`
- Commit: `d65c533`
- Deployment: `dpl_967sUbyRRGWYFxNYTY5SJCubuZyk`
- Health: `db=up`

Bản trước (chỉ có nhập liệu 2 kiểu): `dpl_3q3CK93CrKLtqrQvndSct1Q11oWF`.

## Rollback

- Quay lại bản trước tour: `dpl_3q3CK93CrKLtqrQvndSct1Q11oWF`
- Quay lại trước đợt nâng cấp nhập liệu: `dpl_5UwoUvCFVXqCyZVF59fBeRCxK1gj`

## Kiểm thử

| Bộ test | Kết quả |
| --- | --- |
| Product Tour | 25/25 |
| Nhập 2 kiểu | 20/20 |
| Lũy kế ngày | 11/11 |
| Encoding | PASS |
| `tsc --noEmit` | PASS |
| `pnpm build` | PASS |

Đã kiểm tra thực tế: tự chạy sau đăng nhập, điều hướng đủ 3 bước đầu, mở lại từ Hướng dẫn, hiển thị mobile 390px.

## Không nằm trong đợt này

- Kho ứng dụng (miniapp store), nhập Excel, các thay đổi UX mới vẫn ở local, chưa deploy.

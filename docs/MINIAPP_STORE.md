# Kho ứng dụng (miniapp store)

## Ý tưởng

Hệ thống không tách thành nhiều ứng dụng deploy riêng. Mỗi nghiệp vụ là một **miniapp** trong cùng ứng dụng:

- Dùng chung đăng nhập, phân quyền, CSDL và giao diện V5.
- Có danh mục, tìm kiếm, ghim và lịch sử dùng gần đây như một cửa hàng ứng dụng.
- Khi mở app, menu bên trái chỉ còn nghiệp vụ của app đó.
- Nút **Kho ứng dụng** ở đầu sidebar và trên thanh trên cùng để đổi app.

## Danh mục hiện tại

| Nhóm | Ứng dụng |
| --- | --- |
| Điều hành | Tổng quan điều hành, Lịch công tác |
| Nghiệp vụ | Công việc, Giao ban số liệu, Kế hoạch, Nhật ký ca trực |
| Báo cáo & tài liệu | Báo cáo, Kết quả tháng, Tài liệu, Sản phẩm |
| Quản trị | Nhân sự & tổ chức, Quản trị hệ thống |

## Quy tắc hiển thị

- App khai báo `roles` chỉ hiện với đúng vai trò.
- App khai báo `permissions` chỉ hiện khi tài khoản có ít nhất một quyền trong danh sách.
- **Nhật ký ca trực** không hiện với `UNIT_LEADER`.
- **Nhân sự & tổ chức**, **Quản trị hệ thống** chỉ hiện với tài khoản có quyền quản trị.
- Backend vẫn là chốt chặn cuối cùng; ẩn app chỉ là lớp giao diện.

## Nhận diện app theo URL

Mỗi app khai báo các tiền tố URL trong `paths`. Khi vào bất kỳ trang con nào, hệ thống chọn tiền tố dài nhất:

- `/v5/giao-ban/nhap` → Giao ban số liệu
- `/admin/organization` → Nhân sự & tổ chức
- `/admin/audit` → Quản trị hệ thống

## Ghim và dùng gần đây

- Lưu bằng `localStorage`, chỉ trên máy đang dùng.
- `talung.miniapps.pinned.v1`
- `talung.miniapps.recent.v1`
- Tối đa 6 app gần đây.

## Thêm một app mới

1. Thêm mục vào `MINIAPPS` trong `src/config/miniapps.ts`:
   - `id`, `name`, `description`, `href`, `icon`, `accent`, `category`
   - `paths`, `keywords`
   - `roles` / `permissions` nếu cần giới hạn
2. Nếu app có menu riêng, thêm mục vào `NAV_SECTIONS` trong `src/components/v5/V5Shell.tsx`.
3. Chạy `npx tsx scripts/test-miniapp-store.ts`.

## Kiểm thử

```bash
npx tsx scripts/test-miniapp-store.ts
npx tsx scripts/test-ux-phase5.ts
npx tsx scripts/test-encoding.ts
pnpm build
```

## Chưa làm

- Chưa tách deploy riêng từng app.
- Chưa có badge số việc chờ theo app.
- Chưa có màn hình quản trị bật/tắt app theo đơn vị.

# PRODUCTION — SỬA THÔNG BÁO CHỜ NGHIỆM THU + UI (25/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT PENDING`

- **Production:** `https://task-cus.vercel.app`
- **Deployment:** `dpl_xCPQnrRUtVSZx67bEaXptuLKV5SH`
- **Code:** `906ef3e`
- **Health:** `status=ok`, `db=up`, `commit=906ef3e`, `env=production`
- **Phương án:** code-only, không migration, không thay đổi schema.

---

## 1. Góp ý #1 — đã sửa

Nội dung góp ý:
- Thông báo đã phê duyệt vẫn hiện **“CHỜ NGHIỆM THU”**.
- Tin chưa đọc chưa nổi bật màu đỏ/vàng.
- Khung thông báo hẹp.

Đã sửa:
- API `/api/notifications` đọc trạng thái nhiệm vụ hiện tại:
  - `WAITING_REVIEW` → **CHỜ NGHIỆM THU**
  - `COMPLETED` / `DONE` → **ĐÃ PHÊ DUYỆT**
  - `CANCELED` → **ĐÃ HỦY**
  - Trạng thái khác → **ĐÃ XỬ LÝ**
- Thông báo cũ trong DB không cần sửa hàng loạt; nhãn được hiển thị theo trạng thái mới.
- Tin chưa đọc có nền vàng/đỏ + viền trái; thêm bộ lọc **Chưa đọc**.
- Khung trang `/notifications` mở rộng từ `max-w-2xl` lên `max-w-4xl`.

## 2. Góp ý #2 — cần UAT lại

- Nút trong khối So sánh đổi thành **“Nhập chỉ tiêu BTC/UBND/KH →”** để rõ đích đến.
- Nút mở đúng `Cấu hình → Chỉ tiêu giao`, chọn sẵn `THU_NSNN`.
- Tab **So sánh thu NSNN** chỉ cấu hình chỉ tiêu nào được hiển thị trong khối So sánh; không nhập giá trị target.
- Nếu người dùng vẫn không nhập được, cần ảnh màn hình/URL và thông báo lỗi cụ thể.

## 3. Góp ý #3 — đã có

- Form duyệt kết quả có chọn mức chất lượng **65–100%**.
- Lịch sử hiệu lực chất lượng hiển thị `%`.
- Cần kiểm tra lại với tài khoản thật nếu giao diện chưa thấy do flag/role.

## 4. Góp ý #4 — đã có

- Đã bổ sung “Thêm người cho ngày này” cho từng vị trí.
- Tách trực trưa khỏi trực thường; chỉ cảnh báo trùng trong cùng nhóm trực.
- Commit `b52612f` ngày 23/10/2026.

## 5. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `scripts/test-notification-display.ts` | 9/9 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/login` | 200 |
| `/notifications` | 307 unauth |
| `/api/notifications` unauth | 401 |

## 6. Rollback

```powershell
vc rollback dpl_DtyiPJAzfL534hDtgQTeJoEGWxWn --scope tlqm --yes
```

Không có migration/schema cần rollback.

---

## 7. Bổ sung — modal xem thông báo nhanh (25/10/2026)

- **Deployment:** `dpl_616eHTsS76WdNqDqVt8imwsvWQyZ`
- **Code:** `7d11267`
- **Health:** `commit=7d11267`, `db=up`, `env=production`

Đã thêm `NotificationQuickView` khi bấm chuông ở Header:

- Desktop: panel nổi góc phải dưới header, rộng 430px.
- Điện thoại: bottom sheet toàn chiều rộng.
- Hiển thị 8 thông báo mới nhất; nền vàng/đỏ cho tin chưa đọc.
- Đánh dấu đã đọc từng tin hoặc **Đọc tất cả**.
- Có link **Xem tất cả thông báo** sang `/notifications`.
- Đóng bằng nút X, click nền hoặc phím Escape.
- Không migration/schema.

| Kiểm tra | Kết quả |
|---|---|
| `scripts/test-notification-quick-view.ts` | 10/10 PASS |
| `scripts/test-notification-display.ts` | 9/9 PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/login` | 200 |
| `/dashboard`, `/notifications` | 307 unauth |

Rollback về bản trước modal:

```powershell
vc rollback dpl_xCPQnrRUtVSZx67bEaXptuLKV5SH --scope tlqm --yes
```
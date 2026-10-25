# PRODUCTION — CẤU HÌNH SO SÁNH THU NSNN (25/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT PENDING`

- **Production:** `https://task-cus.vercel.app`
- **Deployment:** `dpl_DtyiPJAzfL534hDtgQTeJoEGWxWn`
- **Code:** `7caf008`
- **Health:** `status=ok`, `db=up`, `commit=7caf008`, `env=production`
- **Phương án:** cấu hình qua `system_configs`, **không migration**, **không thay đổi schema**.

---

## 1. Thay đổi

- Khối **So sánh kết quả thu NSNN** chỉ hiển thị các chỉ tiêu được bật trong cấu hình.
- Mặc định: chỉ `THU_NSNN`.
- `Mặt hàng phân bón` bị ẩn khỏi khối So sánh; bảng **SỐ LIỆU GIAO BAN** phía trên vẫn giữ đầy đủ.
- Thêm tab **“So sánh thu NSNN”** trong `/giao-ban/cau-hinh` để bật/tắt theo từng chỉ tiêu.
- Cấu hình lưu tại `system_configs.key = metric.comparison.visibleCodes`, dạng JSON array.
- Không cần sửa code khi đổi danh sách chỉ tiêu.

## 2. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `scripts/test-comparison-config.ts` | 11/11 PASS |
| `scripts/test-dashboard-v4.ts` | 14/14 PASS |
| Local API: đọc cấu hình mặc định | `["THU_NSNN"]` |
| Local API: lưu cấu hình | PASS |
| Local summary: dòng so sánh | Chỉ `THU_NSNN` |
| `/api/health` Production | 200, db up |
| `/login` | 200 |
| `/giao-ban` | 307 unauth |
| `/giao-ban/cau-hinh?tab=COMPARISON` | 307 unauth |
| `/api/metrics/admin` unauth | 401 |
| `/api/metrics/summary` unauth | 401 |

## 3. Chưa kiểm tra

- UAT bằng tài khoản thật trên Production.
- Bật lại một chỉ tiêu khác trên Production và xác nhận hiển thị.
- Mobile thật 360/390.

## 4. Rollback

Code rollback về bản trước:

```powershell
vc rollback dpl_5PzpFBXxzw5DvjeJdtR5fPUXkCvF --scope tlqm --yes
```

Không có migration/schema cần rollback.

Nếu chỉ muốn ẩn/hiện lại: vào **Cấu hình → So sánh thu NSNN**, bật/tắt chỉ tiêu và lưu; không cần deploy.

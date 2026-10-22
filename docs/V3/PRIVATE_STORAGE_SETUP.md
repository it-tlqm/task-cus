# HƯỚNG DẪN CẤU HÌNH KHO TỆP PRIVATE (SUPABASE + VERCEL)

**Mục tiêu:** chuyển bucket `task-attachments` sang **PRIVATE**, mọi lượt tải/xem tệp đi qua route có xác thực + kiểm tra quyền của ứng dụng.
**Code đã sẵn sàng** (deploy `6cce5f9`): route `GET /api/tasks/{taskId}/attachments/{attachmentId}/file`, provider **không bao giờ trả URL công khai**, API không còn `storage/v1` trong payload.

> ⚠️ **Không gửi khoá/secret qua chat, email hay commit vào Git.** Thiết lập trực tiếp trên Vercel Dashboard / Supabase Dashboard.

---

## BƯỚC 1 — Tạo secret trên Vercel Production (chủ dự án)

1. Vercel Dashboard → Project **task-cus** → **Settings → Environment Variables**.
2. Thêm (Production):
   | Name | Value |
   |---|---|
   | `SUPABASE_SERVICE_ROLE_KEY` | *(service_role / secret key của project Supabase `ekswvjbpqblssxcdwagi`)* |
   | `SUPABASE_STORAGE_PRIVATE` | `1` *(chỉ đặt **sau** Bước 3)* |
3. **Redeploy** Production (Deployments → ⋯ → Redeploy) để biến môi trường có hiệu lực.
   - Nếu dùng Supabase dạng **publishable/secret key mới**: đặt `SUPABASE_SECRET_KEY` thay cho `SUPABASE_SERVICE_ROLE_KEY` (mã đã hỗ trợ cả hai).
4. Kiểm tra biến đã vào đúng môi trường (không in giá trị):
   ```bash
   vercel env ls production | findstr SUPABASE
   ```

## BƯỚC 2 — Kiểm chứng ứng dụng vẫn chạy (bucket vẫn PUBLIC)

```bash
curl -s https://task-cus.vercel.app/api/health
# -> {"status":"ok","db":"up","commit":"6cce5f9"}
```

## BƯỚC 3 — Chuyển bucket sang PRIVATE (Supabase Dashboard)

1. Supabase Dashboard → project `ekswvjbpqblssxcdwagi` → **Storage** → bucket **task-attachments**.
2. Bật/tắt **Public bucket** → **tắt (Private)** → lưu.
3. Nếu có policy cũ cho phép đọc công khai (`storage.objects` / `select` cho `anon`/`public`), **xoá hoặc thu hẹp** chúng.

## BƯỚC 4 — Bật chế độ nghiêm ngặt trên máy chủ

Thêm `SUPABASE_STORAGE_PRIVATE=1` vào Vercel Production → **Redeploy**.
Khi bật, ứng dụng **fail-closed**: nếu thiếu service-role key hoặc bucket còn PUBLIC ⇒ API trả **503** kèm thông báo cấu hình (không tự fallback sang khoá công khai).

## BƯỚC 5 — Kiểm tra bắt buộc

```bash
# 1) Truy cập KHÔNG đăng nhập phải bị từ chối
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://ekswvjbpqblssxcdwagi.supabase.co/storage/v1/object/public/task-attachments/<KEY>"
# Kỳ vọng: 400/401/404  (KHÔNG phải 200)

# 2) Không liệt kê được tệp
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "apikey: <PUBLISHABLE_KEY>" -H "Authorization: Bearer <PUBLISHABLE_KEY>" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":100}' \
  "https://ekswvjbpqblssxcdwagi.supabase.co/storage/v1/object/list/task-attachments"
# Kỳ vọng: 400/401 (không còn danh sách công khai)

# 3) Route có xác thực vẫn tải được (đăng nhập rồi gọi)
#    GET /api/tasks/{taskId}/attachments/{attachmentId}/file  → 200 + bytes
```

## BƯỚC 6 — Dọn kho tệp cũ (sau khi đã lưu trữ)

Tệp cũ đã được lưu trữ tại `demo-ops/archive/prod-2026-10-22/files/` (checksum đã kiểm chứng) → xoá khỏi bucket:

```bash
node scripts/purge-storage.mjs --bucket=task-attachments --dry-run          # xem kế hoạch
node scripts/purge-storage.mjs --bucket=task-attachments --confirm=PURGE-2026-10-22
```
Cần `SUPABASE_SERVICE_ROLE_KEY` trên máy chạy lệnh (không dùng publishable key).

## Vì sao cần tự thực hiện

Máy của agent **không có** `VERCEL_TOKEN` và **không có** service-role key ⇒ không thể đặt secret Vercel hay đổi chế độ bucket trên Dashboard. Các bước trên là thao tác trên hạ tầng, cần tài khoản chủ sở hữu dự án.

## Lưu ý an toàn

* Không bao giờ commit `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY` vào Git; `.env` đã được git-ignore.
* File credential Super Admin (`demo-ops/reset/*.txt`) git-ignore + ACL chỉ tài khoản hiện tại — không gửi qua chat/email.
* Nếu cấu hình sai, ứng dụng **fail-closed 503** (không đọc/ghi bằng khoá công khai) ⇒ không có rủi ro lộ tệp, chỉ tạm thời không tải được tệp.

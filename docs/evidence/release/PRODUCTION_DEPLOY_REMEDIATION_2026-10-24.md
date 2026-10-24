# PRODUCTION DEPLOY — REMEDIATION V3.2 (24/10/2026)

**Trạng thái:** `DEPLOYED — CODE-ONLY — TECHNICAL SMOKE PASS — FLAGS YC-10/YC-11 OFF`  
**Production:** `https://task-cus.vercel.app`  
**Vercel project:** `tlqm/task-cus`  
**Deployment:** `dpl_CuwiAdzz4Uprqzf1dbSG9cSbeGVj`  
**Deployment URL:** `https://task-93dd75v62-tlqm.vercel.app`  
**Code commit:** `3ceb5cb` — `docs(evidence): ghi lai commit bang chung thuc te` (branch `codex/v3-remediation-p0`)  
**Health commit:** `3ceb5cb` (verified)  
**Flags:** `V3_YC10_QUALITY` và `V3_YC11_PRECHECK` **không được set** trong Production (OFF).  
**Schema/migration:** không có; đây là deploy code-only.

---

## 1. Phạm vi deploy

Deploy các sửa lỗi đã review:

- Chặn collaborator xem quality trong lịch sử và notification.
- Ngày/giờ Việt Nam cho dashboard/AI/notification/remind/export.
- Purge-storage an toàn, mặc định tắt, không còn token tĩnh, chặn `work-evidence`.
- Bỏ JWT khỏi localStorage, dọn legacy token, CSP/HSTS.
- Bỏ cache auth 60 giây; quyền lấy từ DB, không fallback JWT.
- Scope nghỉ phép AI theo đơn vị.
- Middleware không còn bypass path có dấu chấm.
- Health báo commit thật.

**Không bật YC-10/YC-11.** Lý do YC-11: Production có `person_supervisions = 0`; bật sẽ chặn nộp/duyệt task per-person. YC-10 cần UAT quality trước.

---

## 2. Deploy

- Lệnh: `vc deploy --prod --yes --scope tlqm --env RELEASE_SHA=3ceb5cb`
- Vercel build: **PASS** (Next.js 15.5.27).
- Alias: `https://task-cus.vercel.app` → deployment mới.
- Không chạy migration, không đổi env flag, không reset dữ liệu.

---

## 3. Technical smoke

| Kiểm tra | Kết quả |
|---|---|
| `/api/health` | 200; `status=ok`, `db=up`, `env=production` |
| Health commit | `3ceb5cb` |
| `/login` | 200 |
| `/giao-ban` chưa đăng nhập | 307 |
| `/api/tasks/<id>/history` chưa đăng nhập | 401 |
| `/api/admin/system/purge-storage` chưa đăng nhập | 401 |
| CSP header | có; `frame-ancestors 'self'` |
| HSTS | có; `max-age=31536000; includeSubDomains` |
| X-Frame-Options | `SAMEORIGIN` |
| Flags YC-10/YC-11 | không có trong env Production |

Health payload:

```json
{
  "success": true,
  "status": "ok",
  "db": "up",
  "commit": "3ceb5cb",
  "env": "production",
  "deploymentId": "dpl_CuwiAdzz4Uprqzf1dbSG9cSbeGVj",
  "latencyMs": 263
}
```

---

## 4. Rollback

- Code rollback về V3.2 trước remediation:
  `vc rollback dpl_HjAkRQJT7iHQ6szfzNxxRfqLvj9V --scope tlqm --yes`
- Không có migration/schema cần rollback.
- Nếu rollback, kiểm tra lại `/api/health`, `/login`, `/giao-ban`.

---

## 5. Còn lại

- UAT tài khoản thật: login/logout/refresh, quality visibility, dashboard ngày VN, notification/remind, PDF preview, AI.
- Kiểm tra CSP trên Preview/Production với ảnh Supabase/PDF/AI thật.
- Chưa bật YC-10/YC-11.
- PITR/backup tự động vẫn là quyết định ops.
- Theo dõi 24h: 5xx, 401/403, login, approval/history, notification, AI, auth p95.

# PRODUCTION — BẬT YC-10 QUALITY (25/10/2026)

**Trạng thái:** `ENABLED — TECHNICAL SMOKE PASS — UAT QUALITY PENDING`

**Production:** `https://task-cus.vercel.app`

**Deployment:** `dpl_Gz8eFdNYdGmcWhzm7VYzA4v4duwF`

**Code commit:** `5a0606b` (UX Phase 1; không deploy nhánh Phase 2/3)

**Flag:** `V3_YC10_QUALITY=true` trên Production

**Flag YC-11:** `V3_YC11_PRECHECK` không set — vẫn OFF

---

## 1. Thay đổi

- Bật `V3_YC10_QUALITY=true` trên Vercel Production.
- Redeploy đúng code `5a0606b`.
- Không chạy migration/schema change.
- Không deploy nhánh `codex/v3-ux-phase2`.

## 2. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| `/api/health` | 200; `status=ok`, `db=up`, `env=production` |
| Health commit | `5a0606b` |
| `/login` | 200 |
| `/approvals` chưa đăng nhập | 307 |
| `V3_YC10_QUALITY` | đã set Production |
| `V3_YC11_PRECHECK` | không set |

Health payload:

```json
{
  "success": true,
  "status": "ok",
  "db": "up",
  "commit": "5a0606b",
  "env": "production",
  "deploymentId": "dpl_Gz8eFdNYdGmcWhzm7VYzA4v4duwF",
  "latencyMs": 271
}
```

## 3. UAT bắt buộc

- Đăng nhập tài khoản lãnh đạo có quyền duyệt.
- Mở `/approvals`, chọn hồ sơ `TASK_RESULT`.
- Bấm **Đồng ý** → phải hiện chọn chất lượng **65–100**, bước 5.
- Chọn 80 → lưu → xem lịch sử task.
- Kiểm tra collaborator không thấy quality; owner/tuyến duyệt thấy.
- Thử yêu cầu điều chỉnh quality sau khi duyệt.
- Nếu lỗi: tắt flag ngay (xem rollback).

## 4. Rollback

Tắt YC-10:

```powershell
vc env remove V3_YC10_QUALITY --environment production --scope tlqm --yes
```

Sau đó redeploy lại code hiện tại (hoặc rollback deployment):

```powershell
vc rollback dpl_3L6o1GfnKNRWuMJ75yNgSQzaRHU3 --scope tlqm --yes
```

Không có DB migration cần rollback.

## 5. Còn lại

- UAT quality thật.
- Nếu UAT đạt, giữ flag ON; nếu chưa, tắt và sửa.
- YC-11 vẫn OFF vì `person_supervisions = 0`.

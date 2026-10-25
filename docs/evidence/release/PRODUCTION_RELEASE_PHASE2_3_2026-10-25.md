# PRODUCTION — RELEASE UX PHASE 2A/2B/3A–3C + 3E (25/10/2026)

**Trạng thái:** `DEPLOYED — TECHNICAL SMOKE PASS — UAT PENDING`

- **Production:** `https://task-cus.vercel.app`
- **Deployment:** `dpl_5vAFy7twhW15n5uSjBxKPcQW7obF`
- **Code:** `eb8a302`
- **Health:** `status=ok`, `db=up`, `commit=eb8a302`, `env=production`
- **Dashboard V4:** vẫn chỉ là bản xem trước `/dashboard/v4`; `/dashboard` cũ vẫn mặc định.

---

## 1. Phạm vi release

### Phase 2A
- Sửa biên bản họp và kết luận chưa chuyển task.
- Người tạo được sửa kế hoạch `DRAFT`/`RETURNED`.
- Dashboard dùng form giao việc `/tasks?new=1`.
- Thông báo cho công chức phối hợp.

### Phase 2B + migration
- Nhiều tag TX/1277 cho một `RoutineEntry`.
- `workDate` + `shift`.
- Migration: `20261025100000_v3_ux_2b1_routine_tags`.
- Đã backup + restore rehearsal + áp Production.

### Phase 3A–3C
- Export tháng điền tên/vị trí.
- Ẩn/thu gọn khai báo ca theo vai trò.
- Hủy mềm kế hoạch trùng, có lý do; chặn kỳ khóa.

### Phase 3D
- Form nhập nhanh 3 chỉ tiêu BTC/UBND/KH ngay trong khối So sánh.
- Lưu + xác nhận; chỉ tiêu đã chốt phải vào cấu hình đầy đủ.

### Phase 3E
- Cấp `SYSTEM_ADMIN` có kiểm soát:
  - Chỉ `SYSTEM_ADMIN` hiện hữu được cấp/thu hồi.
  - Không tự cấp/thu hồi cho chính mình.
  - Bắt buộc phạm vi toàn tổ chức.
  - Bắt buộc lý do; ghi audit.
  - Chặn thu hồi admin cuối cùng.

## 2. Backup / migration

| Hạng mục | Kết quả |
|---|---|
| Backup schema Production | `F08BD0B307EC5E602CCE619EC5B8ED6C84A0B53FBE064CFCB1F106CA93A0C904` |
| Backup data Production | `B0250A05603DA662E1D21E8A80ECEEF20C8E132427E9DBD83E42EC20E3AEEFFF` |
| Restore local `talung_v3_prod_rehearsal_20261025` | PASS |
| Migration rehearsal | PASS |
| Migration Production | PASS |
| Production `routine_entries` | 18 |
| `work_date IS NULL` | 0 |
| `shift IS NULL` | 0 |
| `routine_entry_catalog_tags` | 1 |

- Backup lưu ngoài repo, trong thư mục tạm bảo vệ; không commit dữ liệu Production.
- Không dùng `prisma migrate deploy`; áp SQL thủ công qua Management API sau backup/rehearsal.

## 3. Kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Phase 2A: meeting/plan/dashboard/collaborator | PASS |
| Phase 2B routine tags | 60/60 PASS |
| Phase 2B UI smoke | 14/14 PASS |
| Phase 3B declaration | PASS |
| Phase 3C duplicate plan + UI | PASS |
| Phase 3E static | 12/12 PASS |
| Phase 3E API | 8/8 PASS |
| Monthly export | PASS |
| `npx tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `/api/health` Production | 200, db up |
| `/login` | 200 |
| `/dashboard`, `/routine`, `/plans`, `/admin/permissions`, `/notifications` | 307 unauth |

## 4. Chưa kiểm tra

- UAT đầy đủ bằng tài khoản thật trên Production.
- Mobile thật 360/390.
- Cấp/thu hồi SYSTEM_ADMIN trên Production với tài khoản thật.
- Dữ liệu so sánh tháng trước/cùng kỳ vẫn cần số thực tế lịch sử.

## 5. Rollback

Code-only về bản trước release:

```powershell
vc rollback dpl_55tXdRgnpFdGKRbt4fmifD9Qrpf8 --scope tlqm --yes
```

Migration 2B là additive. Nếu phải rollback schema, chỉ drop sau khi có quyết định riêng:

```sql
DROP TABLE IF EXISTS "routine_entry_catalog_tags";
DROP INDEX IF EXISTS "routine_entries_work_date_idx";
ALTER TABLE "routine_entries" DROP COLUMN IF EXISTS "work_date";
ALTER TABLE "routine_entries" DROP COLUMN IF EXISTS "shift";
```

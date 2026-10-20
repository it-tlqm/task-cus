# OVERNIGHT STATUS — YC-33 → YC-37

**Cập nhật:** 21/10/2026 · **Base:** `efe2bde` (Giai đoạn 1 đã deploy) · **Production:** `https://task-cus.vercel.app`

Trạng thái dùng: `DEPLOYED_AUTO_VERIFIED` · `IMPLEMENTED_NOT_DEPLOYED` · `DRAFT_PREVIEW_ONLY` · `BLOCKED_BUSINESS_RULE` · `BLOCKED_ENVIRONMENT` · `NOT_STARTED`

---

## S0 — Audit (đã xong)

| Hạng mục | Kết quả |
|---|---|
| Health Production | `db=up`, commit `efe2bde` |
| Migration history | Production **không có** `_prisma_migrations` → cấm `prisma migrate deploy`; dùng `scripts/apply-*.ts` |
| Nút "Chấp thuận" | `src/app/approvals/page.tsx` — bấm là gọi API **ngay**, **không có bước xem trước** → gap YC-37 |
| Luồng phê duyệt hiện có | 3 loại: task nghiệm thu (`/api/tasks/[id]`), kế hoạch (`/api/plans/[id]/workflow`), gia hạn (`/api/tasks/[id]/deadline-request/[reqId]/review`) |
| RBAC | `src/server/guard.ts` — `UNIT_LEADER` = toàn quyền nghiệp vụ; `DEPARTMENT_LEADER` = theo phạm vi đơn vị; `SYSTEM_ADMIN` **không** được đọc/sửa nghiệp vụ |
| Audit | `src/server/audit.ts` → bảng `audit_events`; đã có `IDOR_ATTEMPT_BLOCKED` |
| Chống duyệt trùng | Đã có `updateMany({ where: { status: <trạng thái chờ> } })` trong plan workflow; task dùng `assertTaskStatusTransition` |
| Công thức Bảng 1 | Đọc trực tiếp từ workbook gốc (`Dữ liệu.zip`) — xem mục S2 |
| Công thức 01A/01B/02A/02B | Đọc trực tiếp từ workbook gốc — xem mục S4 |
| Hệ số TX vs QĐ1277 | TX (`work_catalog_entries.convert_factor`) ≠ QĐ1277 (`product_items.convert_factor`) — phải phân biệt, chưa có mapping |

**Nguồn đã giải nén (ngoài Git):** `C:\Users\thanhnx\AppData\Local\Temp\opencode\yc33-src\` + bản ASCII `src-leader1.xlsx`, `src-leader2.xlsx`, `src-staff7/8/9.xlsx`, `src-giang.xlsx`, `src-temp2D/2E.xlsx`, `src-temp.xlsx`.

---

## Trạng thái theo chặng

| Chặng | YC | Trạng thái | Ghi chú |
|---|---|---|---|
| S1 | YC-37 | `IMPLEMENTED_NOT_DEPLOYED` | Đã có schema + service + API + UI (xem `NEXT_ACTIONS.md`) |
| S2 | YC-33 | `IMPLEMENTED_NOT_DEPLOYED` | Engine thuần decimal-safe + fixture parity |
| S3 | YC-36 | `IMPLEMENTED_NOT_DEPLOYED` | Tự đánh giá / nhận xét / xếp loại đề xuất |
| S4 | YC-34 | `IMPLEMENTED_NOT_DEPLOYED` | Preview + export 01A/01B/02A/02B (bản dự thảo) |
| S5 | YC-35 | `IMPLEMENTED_NOT_DEPLOYED` | Quan hệ phụ trách theo kỳ + bình quân có điều kiện |
| S6 | — | `NOT_STARTED` | Regression + tài liệu + bàn giao UAT |

---

## Schema đã chuẩn bị (additive, chưa áp Production)

Migration: `prisma/migrations/20261021090000_yc33_37_scoring_evaluation_supervision_approval/migration.sql`
Apply-script: `scripts/apply-yc33-37-ddl.ts`

| Bảng | YC | Mục đích |
|---|---|---|
| `score_runs` / `score_run_items` | YC-33 | Snapshot kỳ tính: công thức, phiên bản danh mục/sản phẩm, trạng thái từng dòng |
| `evaluation_assessments` | YC-36 | Tự đánh giá, gợi ý, ưu điểm/hạn chế, nhận xét lãnh đạo, xếp loại đề xuất |
| `person_supervisions` | YC-35 | Quan hệ phụ trách theo kỳ (không suy từ role kỹ thuật) |
| `approval_cases` / `approval_decisions` | YC-37 | Hồ sơ + lịch sử mọi lượt chấp thuận / từ chối / giải trình / phản hồi |

**Kiểm chứng DDL trên DB local (`talung_yc33_local`):** lần 1 `schema_changed=true`, lần 2 `schema_changed=false` (cùng fingerprint), `checks_failed=0`. Không DROP/ALTER bảng cũ, không FK sang bảng nghiệp vụ.

---

## Dữ liệu Production (đối chiếu trước khi thay đổi)

| Đối tượng | Trước |
|---|---:|
| `people` / `accounts` | 38 / 24 |
| `work_catalog_versions` / `work_catalog_entries` | 1 / 348 (`TX-20261020-01`, `selectionMode=ALL`) |
| `work_catalog_department_mappings` | 0 (chưa ánh xạ — chờ Hải quan) |
| `activity_templates` | 48 |
| `tasks` / `plans` | 18 / 5 |
| `personal_work_items` / `monthly_work_results` / `work_evidences` | 26 / 15 / 0 |

---

## Ghi chú an toàn

- Mọi thay đổi schema chỉ **CREATE TABLE/INDEX mới** → không ảnh hưởng code cũ, rollback = deploy lại commit cũ.
- Không tạo bản ghi nghiệp vụ mới ngoài dữ liệu test đã dọn sạch.
- Không commit workbook gốc, dữ liệu nhân sự, hồ sơ đánh giá, token hay mật khẩu.

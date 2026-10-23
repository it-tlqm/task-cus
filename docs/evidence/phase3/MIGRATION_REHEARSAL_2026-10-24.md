# YC-11 Phase 3 — Migration rehearsal (2026-10-24)

**Migration:** `20261023190000_v3_approval_precheck_route`  
**Script:** `scripts/rehearse-v3-yc11-route-migration.ts`  
**DB:** `talung_v3_approval_impl_quality` (localhost) — **Production: NO**  
**Kết quả:** **PASS** (apply → verify → rollback → verify data → re-apply)

## 1. Phạm vi

- Bảng additive duy nhất: `approval_route_snapshots`.
- Không sửa migration cũ; không đổi `tasks`, `task_participant_*`, `approval_cases`,
  `approval_decisions`, `person_supervisions`.
- Không thêm role/permission/stage; không seed tuyến.
- Không chạm `ProductItem`, `WorkItemProduct`, `MonthlyWorkResult`, `scoring`, `EvaluationAssessment`.

## 2. Kết quả apply / rollback / re-apply

| Bước | Kết quả |
|---|---|
| Apply 8 statement DDL | PASS — bảng + 4 index + 2 CHECK + 3 FK |
| Verify schema | PASS — cột/nullability, unique `(task_id, round)`, CHECK `route_status`/`round` |
| Rollback 1 statement | PASS — bảng bị drop |
| Dữ liệu cũ sau rollback | PASS — không đổi |
| Re-apply | PASS — bảng trở lại |

Chi tiết JSON: `MIGRATION_REHEARSAL_2026-10-24.json`.

## 3. Schema sau apply

Cột:

- `id` TEXT NOT NULL (PK)
- `task_id` TEXT NOT NULL — FK `tasks(id)` ON DELETE CASCADE
- `case_id` TEXT NULL — FK `approval_cases(id)` ON DELETE SET NULL
- `round` INTEGER NOT NULL — CHECK `round >= 1`
- `route_status` TEXT NOT NULL — CHECK `READY/WAITING_ASSIGNMENT/CYCLE/AMBIGUOUS`
- `route_json` JSONB NOT NULL
- `created_by_id` TEXT NULL — FK `people(id)` ON DELETE SET NULL
- `created_at` TIMESTAMP(3) NOT NULL

Index:

- UNIQUE `(task_id, round)`
- `(task_id, created_at)`
- `(case_id)`

## 4. Điểm điều chỉnh so với proposal (đã ghi rõ)

Proposal ghi `case_id NOT NULL` + unique `(case_id, round)`. Thực tế S4 **chỉ tạo
`ApprovalCase` ở lần quyết định đầu**, còn snapshot tuyến phải ghi **khi owner nộp chung**
(trước khi case tồn tại). Vì vậy implementation dùng:

- `task_id NOT NULL` + unique `(task_id, round)` — khóa snapshot theo Task/vòng;
- `case_id NULL` — gắn khi case được tạo ở lần quyết định đầu (`linkRouteSnapshotToCase`).

Không thay đổi semantics: snapshot vẫn bất biến sau khi nộp, legacy không có snapshot = final-only.

## 5. Dữ liệu trước/sau (không đổi)

| Bảng | Trước | Sau apply | Sau rollback |
|---|---:|---:|---:|
| tasks | 77 | 77 | 77 |
| approval_cases | 18 | 18 | 18 |
| approval_decisions | 29 | 29 | 29 |
| task_participant_events | 35 | 35 | 35 |
| task_participant_results | 16 | 16 | 16 |
| person_supervisions | 2 | 2 | 2 |

## 6. Lưu ý release

- DB test clone **không có `_prisma_migrations`**; rehearsal dùng DDL trực tiếp qua Prisma,
  **không** chạy `prisma migrate deploy`.
- Rollback SQL: `scripts/sql/v3_approval_precheck_route_rollback.sql`.
- Trước release thật, S1/S0 cần rehearsal trên bản sao có lịch sử migration đầy đủ.
- Không chạy migration này trên Production trong đợt overnight.

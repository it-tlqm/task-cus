# S6 — MIGRATION PROPOSAL 3 PHASE (YC-09 → YC-10 → YC-11)

**Ngày:** 23/10/2026  
**Trạng thái:** **APPROVED PROPOSAL** — căn cứ `S0_DECISION_LOG_2026-10-23.md`  
**Nhánh spec:** `codex/v3-approval-rules-spec` — **không tạo migration, không sửa schema**  
**Nhánh implementation:** S0 mở sau khi S4 merge  
**Nguyên tắc:** additive, nullable, không default nghiệp vụ, không backfill nội dung, rollback giữ dữ liệu.

> Đây là **đề xuất logic**. Tên cột/bảng có thể được implementation owner tinh chỉnh cho khớp
> convention Prisma, nhưng không được thay đổi semantics đã APPROVED. Không chạy bất kỳ DDL nào
> từ tài liệu này trên Production.

---

## 1. Phụ thuộc schema hiện tại

| Thành phần | Điểm phải giữ |
|---|---|
| `tasks` | `id`, `owner_id`, `unit_id`, `status`, `actual_result_text`; không đổi semantics |
| `task_assignees` | Danh sách participant; `role` hiện `COLLABORATOR/VIEWER` |
| `task_updates` | Timeline chung; `author_id`, `progress_percent`, `status_before/after`, `kind`, `notes` |
| `approval_cases` | Unique `(case_type, resource_id)`; `submitted_by_id`, `status`, `current_round` |
| `approval_decisions` | `case_id`, `round`, `action`, `actor_id`, `actor_person_id`; chưa có quality |
| `people` | Participant/actor FK |
| `accounts` | Audit actor nếu cần |
| `person_supervisions` | Nguồn route Phase 3; không sửa/không seed |
| `products`/`work_item_products`/`monthly_work_results` | **Không chạm** trong cả 3 phase |

---

## 2. Phase 1 — YC-09 per-person

### 2.1. Bảng `task_participant_results` (current projection)

| Cột | Kiểu logic | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID | PK | |
| `task_id` | UUID | NOT NULL | FK `tasks(id)` ON DELETE CASCADE |
| `person_id` | UUID | NOT NULL | FK `people(id)` ON DELETE CASCADE |
| `role` | text | NOT NULL | `OWNER` hoặc `COLLABORATOR`; `VIEWER` không tạo |
| `part_status` | text | NOT NULL, default `NOT_STARTED` | `NOT_STARTED/IN_PROGRESS/SUBMITTED/RETURNED/ACCEPTED/EXEMPT` |
| `part_result_text` | text | NULL | Bắt buộc khi `SUBMITTED` (app validation ≥5 ký tự) |
| `part_completed_on` | date | NULL | Bắt buộc khi `SUBMITTED` |
| `part_progress_percent` | int | NULL | 0–100, bước 5; không thay tiến độ Task |
| `submitted_at` | timestamptz | NULL | |
| `submitted_by_id` | UUID | NULL | FK `people(id)` ON DELETE SET NULL; phải là chính participant |
| `decided_at` | timestamptz | NULL | |
| `decided_by_id` | UUID | NULL | FK `people(id)` ON DELETE SET NULL; pre-check/final |
| `decision_note` | text | NULL | Bắt buộc khi `RETURNED/EXEMPT` |
| `round` | int | NOT NULL default 1 | ≥1; vòng gửi lại |
| `legacy` | boolean | NOT NULL default false | Bản ghi cũ/không có dữ liệu per-person |
| `created_at` | timestamptz | NOT NULL default now | |
| `updated_at` | timestamptz | NOT NULL default now | |

**Ràng buộc/index đề xuất:**
- Unique `(task_id, person_id)` — một dòng hiện tại/người/task.
- Index `(task_id, part_status)`, `(person_id, part_status)`.
- Check `role IN ('OWNER','COLLABORATOR')`.
- Check `part_status IN (...)`.
- Check `part_progress_percent IS NULL OR (0 <= value <= 100 AND value % 5 = 0)`.
- Check `round >= 1`.
- Không đặt DB default `SUBMITTED/ACCEPTED`; default chỉ `NOT_STARTED`.

**Ghi chú thiết kế:**
- Không tạo dòng cho mọi Task trong migration; tạo lazily khi participant thao tác hoặc khi
  owner mở panel lần đầu. Task legacy không có dòng → đọc như “chưa có dữ liệu per-person”.
- `EXEMPT` chỉ do người có thẩm quyền; DB không thể kiểm tra actor, dùng app + audit.
- Khi Task `WAITING_REVIEW/COMPLETED`, app khóa ghi; DB không cần trigger.

### 2.2. Bảng `task_participant_events` (append-only)

| Cột | Kiểu logic | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID | PK | |
| `participant_result_id` | UUID | NOT NULL | FK `task_participant_results(id)` ON DELETE CASCADE |
| `task_id` | UUID | NOT NULL | FK `tasks(id)` ON DELETE CASCADE (truy vấn nhanh) |
| `person_id` | UUID | NOT NULL | FK `people(id)` ON DELETE CASCADE |
| `event_type` | text | NOT NULL | `SUBMIT/RETURN/ACCEPT/EXEMPT/REOPEN/PRECHECK_PASS/PRECHECK_RETURN` |
| `round` | int | NOT NULL | Khớp participant result tại thời điểm |
| `actor_account_id` | UUID | NULL | FK `accounts(id)` ON DELETE SET NULL |
| `actor_person_id` | UUID | NULL | FK `people(id)` ON DELETE SET NULL |
| `note` | text | NULL | Lý do trả lại/ miễn/ điều chỉnh |
| `result_text_snapshot` | text | NULL | Ảnh chụp nội dung tại thời điểm |
| `completed_on_snapshot` | date | NULL | Ảnh chụp ngày hoàn thành |
| `created_at` | timestamptz | NOT NULL default now | |

**Ràng buộc/index:**
- Index `(participant_result_id, created_at)`, `(task_id, created_at)`, `(person_id, created_at)`.
- Check `event_type IN (...)`.
- **Append-only:** không update/delete từ ứng dụng; nếu cần sửa, tạo event mới.
- Không unique theo `(participant_result_id, round, event_type)` vì có thể có nhiều lần trả/gửi
  trong cùng vòng do thao tác lặp; app chống trùng bằng transaction/idempotency.

### 2.3. Bổ sung `task_updates`

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `subject_person_id` | UUID | NULL | Người mà sự kiện nói tới; NULL = sự kiện Task-level cũ |
| `participant_event_id` | UUID | NULL | FK `task_participant_events(id)` ON DELETE SET NULL |

- Index `(task_id, subject_person_id, created_at)`.
- Không đổi dữ liệu cũ; đọc NULL như sự kiện Task-level.
- Không dùng `progress_percent` của participant thay tiến độ Task.

### 2.4. Bảng `approval_case_snapshots` (audit tại thời điểm nộp)

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID | PK | |
| `case_id` | UUID | NOT NULL | FK `approval_cases(id)` ON DELETE CASCADE |
| `round` | int | NOT NULL | Vòng trình |
| `snapshot_json` | jsonb | NOT NULL | Danh sách participant + trạng thái + kết quả + người/ thời gian |
| `created_at` | timestamptz | NOT NULL default now | |
| `created_by_id` | UUID | NULL | FK `people(id)` ON DELETE SET NULL |

- Unique `(case_id, round)`.
- Chỉ ghi khi owner nộp chung; không sửa snapshot cũ.
- Có thể lưu `route_snapshot` Phase 3 ở bảng riêng (xem mục 4).

### 2.5. Backfill / tương thích

- **Không backfill nội dung.**
- Task cũ không có `task_participant_results`: hiển thị “Chưa có dữ liệu phần việc”; owner vẫn
  nộp/duyệt theo luồng một người hiện tại.
- Task đang `WAITING_REVIEW` tại thời điểm deploy: giữ nguyên, không bắt pre-check, không tạo
  participant rows; final decision xử lý như legacy.
- Nếu cần tạo dòng owner cho Task mới: thực hiện trong service khi tạo Task hoặc khi owner mở
  panel; không chạy migration data.

### 2.6. Rollback Phase 1

1. Tắt feature flag per-person.
2. Giữ nguyên dữ liệu participant/event (không xóa dấu vết); chỉ ngừng đọc/ghi.
3. Nếu buộc drop: export bảng/ sự kiện trước; drop theo thứ tự FK:
   `task_updates` columns → `approval_case_snapshots` → `task_participant_events` →
   `task_participant_results`.
4. Không sửa `tasks`/`task_assignees`.

---

## 3. Phase 2 — YC-10 quality

### 3.1. Bổ sung `approval_decisions`

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `quality_percent` | smallint | NULL | `NULL` = chưa đánh giá; chỉ 65/70/75/80/85/90/95/100 |

- Check: `quality_percent IS NULL OR (quality_percent BETWEEN 65 AND 100 AND quality_percent % 5 = 0)`.
- Không default; không backfill; decision cũ NULL.
- Không thêm quality vào `approval_cases`, `tasks`, `personal_work_items`, `monthly_work_results`,
  `product_items`, `work_item_products`, `evaluation_assessments`.

### 3.2. Bảng `approval_quality_adjustments` (E10.4 A1)

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID | PK | |
| `case_id` | UUID | NOT NULL | FK `approval_cases(id)` ON DELETE CASCADE |
| `decision_id` | UUID | NOT NULL | FK `approval_decisions(id)` ON DELETE CASCADE; decision gốc |
| `requested_by_id` | UUID | NOT NULL | FK `people(id)` ON DELETE RESTRICT |
| `requested_at` | timestamptz | NOT NULL default now | |
| `reason` | text | NOT NULL | Bắt buộc |
| `old_percent` | smallint | NOT NULL | Giá trị đang có |
| `new_percent` | smallint | NOT NULL | 65–100 step 5 |
| `status` | text | NOT NULL default `PENDING` | `PENDING/APPROVED/REJECTED` |
| `decided_by_id` | UUID | NULL | FK `people(id)` ON DELETE SET NULL |
| `decided_at` | timestamptz | NULL | |
| `decision_note` | text | NULL | Lý do chấp thuận/từ chối điều chỉnh |
| `created_at` | timestamptz | NOT NULL default now | |
| `updated_at` | timestamptz | NOT NULL default now | |

**Ràng buộc/index:**
- Check `new_percent` như quality.
- Index `(case_id, status)`, `(decision_id, status)`, `(requested_by_id, created_at)`.
- App guard: tối đa một `PENDING`/decision; không cho tự yêu cầu + tự duyệt; không sửa
  `approval_decisions.quality_percent` trực tiếp.
- Nếu DB hỗ trợ partial unique: unique `(decision_id) WHERE status='PENDING'`; nếu không, xử lý
  bằng transaction/advisory lock.

### 3.3. Backfill / tương thích

- Không backfill; decision cũ `quality_percent = NULL`.
- Preview hiển thị “Chưa đánh giá chất lượng”.
- `AGREE` mới với `TASK_RESULT` bắt buộc quality; decision cũ không bị chặn/không đổi.
- Không đổi dữ liệu score/monthly/export cũ.

### 3.4. Rollback Phase 2

1. Tắt feature flag quality.
2. Giữ `quality_percent`/adjustment để tra cứu; chỉ ngừng ghi.
3. Nếu buộc drop: export quality/adjustment trước; drop `approval_quality_adjustments`, sau đó
   drop cột `approval_decisions.quality_percent`.
4. Không sửa decision/task/monthly cũ.

---

## 4. Phase 3 — YC-11 route/pre-check

### 4.1. Bảng `approval_route_snapshots`

| Cột | Kiểu | Null | Ghi chú |
|---|---|---|---|
| `id` | UUID | PK | |
| `case_id` | UUID | NOT NULL | FK `approval_cases(id)` ON DELETE CASCADE |
| `round` | int | NOT NULL | Vòng trình |
| `route_status` | text | NOT NULL | `READY/WAITING_ASSIGNMENT/CYCLE/AMBIGUOUS` |
| `route_json` | jsonb | NOT NULL | Participant → pre-checker → final; nguồn supervision; thời điểm |
| `created_at` | timestamptz | NOT NULL default now | |
| `created_by_id` | UUID | NULL | FK `people(id)` ON DELETE SET NULL |

- Unique `(case_id, round)`.
- Chỉ ghi khi owner nộp chung (sau pre-check); snapshot không bị ghi đè khi tuyến đổi.
- Legacy case không có snapshot: hiển thị “final-only/legacy”.

### 4.2. Pre-check event

- Dùng `task_participant_events` Phase 1:
  - `PRECHECK_PASS`: pre-checker chấp nhận phần; participant vẫn `SUBMITTED` (không `ACCEPTED`).
  - `PRECHECK_RETURN`: participant `RETURNED`; note bắt buộc.
- Không tạo bảng stage/case mới.
- Không thêm cột `stage` vào `approval_cases`.
- Không thay `current_round` bằng stage; `round` vẫn là vòng trình lại.

### 4.3. Không thay đổi role/permission

- Không thêm role `TEAM_LEADER`/`DEPUTY_LEADER`.
- Không thêm `tasks.precheck` (P-2).
- Không seed `person_supervisions`.
- Route đọc `PersonSupervision` hiện có; nếu thiếu → `WAITING_ASSIGNMENT`.

### 4.4. Backfill / tương thích

- Không backfill snapshot; case cũ final-only.
- Task mới sau khi bật Phase 3: pre-check theo route; nếu route `WAITING_ASSIGNMENT`, owner
  không nộp chung.
- Task đang `WAITING_REVIEW` trước deploy: final-only; không chặn.
- `person_supervisions = 0`: Phase 3 không bật cho tới khi lãnh đạo phân tuyến; không tự seed.

### 4.5. Rollback Phase 3

1. Tắt `V3_YC11_PRECHECK`.
2. Giữ snapshot/event; chỉ ngừng đọc/ghi.
3. Nếu buộc drop: drop `approval_route_snapshots`; event Phase 1 giữ nguyên.
4. Không sửa case/task cũ.

---

## 5. Thứ tự migration & rehearsal

### 5.1. Thứ tự áp dụng

```text
Phase 1:
  task_participant_results
  task_participant_events
  task_updates (+subject_person_id, +participant_event_id)
  approval_case_snapshots

Phase 2:
  approval_decisions (+quality_percent)
  approval_quality_adjustments

Phase 3:
  approval_route_snapshots
```

- Phase 1 phải apply trước Phase 3 (event table).
- Phase 2 độc lập schema nhưng cùng approval service; apply sau Phase 1 để tránh conflict.
- Không gộp migration 3 phase vào một file; mỗi phase một migration riêng, có rollback.

### 5.2. Rehearsal bắt buộc

- Clone schema + dữ liệu gần nhất sang DB fixture riêng.
- Kiểm tra `_prisma_migrations`; nếu lịch sử dùng `prisma db push`, baseline trước khi apply.
- Apply từng phase; chạy query kiểm tra:
  - Bảng mới tồn tại; unique/index/check đúng.
  - Legacy Task/ApprovalCase vẫn đọc được.
  - Không có dòng quality ngoài 65–100.
  - Không có snapshot trùng `(case_id, round)`.
- Rollback từng phase; xác nhận dữ liệu cũ còn nguyên.
- Không chạy trên Production; backup trước nếu môi trường chia sẻ.

### 5.3. Điều kiện dừng migration

- Schema diff ngoài phạm vi.
- Backfill nội dung/dữ liệu giả.
- Khóa bảng lớn kéo dài/không có kế hoạch.
- `_prisma_migrations` không rõ trạng thái.
- Test legacy fail.
- Bất kỳ DDL nào chạm `ProductItem`/`WorkItemProduct`/`MonthlyWorkResult`/scoring.

---

## 6. Ma trận tương thích dữ liệu

| Dữ liệu | Phase 1 | Phase 2 | Phase 3 |
|---|---|---|---|
| Task cũ không participant | Đọc legacy, không chặn | Không đổi | Final-only |
| Task đang `WAITING_REVIEW` | Giữ nguyên | Không đổi | Final-only |
| ApprovalCase cũ | Không snapshot | Quality NULL | Không route snapshot |
| ApprovalDecision cũ | Không đổi | Quality NULL | Không đổi |
| PersonalWorkItem | Không đổi | Không đổi | Không đổi |
| QĐ1277/Product | Không đổi | Không đổi | Không đổi |
| MonthlyWorkResult/ScoreRun | Không đổi | Không đổi | Không đổi |
| `person_supervisions` | Không đổi | Không đổi | Chỉ đọc, không seed |
| Role/Permission | Không đổi | Không đổi | Không đổi |

---

## 7. Rollback tổng hợp

| Phase | Rollback tối thiểu | Dữ liệu |
|---|---|---|
| 1 | Tắt flag; drop bảng/cột mới nếu cần | Giữ event/result để tra cứu; không xóa Task |
| 2 | Tắt flag; drop adjustment/cột quality | Export quality trước khi drop |
| 3 | Tắt flag; drop route snapshot | Giữ event pre-check; không sửa case |

**Không rollback bằng cách:** sửa `Task.status`, xóa `ApprovalDecision`, hạ quyền, seed lại
`person_supervisions`, hoặc reset dữ liệu nghiệp vụ.

---

## 8. Kết luận

Đề xuất migration này **additive, có thể rollback**, không chạm QĐ1277/monthly/scoring và không
tạo role/stage. Đủ điều kiện để S0 review và giao implementation owner sau khi S4 merge. Trên
nhánh spec **không tạo migration**.

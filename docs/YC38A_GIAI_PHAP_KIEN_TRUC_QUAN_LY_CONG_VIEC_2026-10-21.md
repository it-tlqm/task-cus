# YC-38A — THIẾT KẾ KIẾN TRÚC QUẢN LÝ CÔNG VIỆC THỐNG NHẤT (DESIGN ONLY)

**Dự án:** TALUNG-CUS-WORK (Hải quan cửa khẩu quốc tế Tà Lùng)
**Ngày:** 21/10/2026 · **Base:** `efe2bde`…`5ef8b01` (Production `5ef8b01`, `db=up`)
**Trạng thái:** `YC38A = DESIGN_ONLY` · `CODE_CHANGE = NONE` · `PRODUCTION_CHANGE = NONE`
**Nguồn:** `docs/YC38A_OPENCODE_DESIGN_ONLY/YC38A/YC38A_KIEN_TRUC_QUAN_LY_CONG_VIEC.md` + báo cáo GĐ3 + `docs/YC33_37_KIEM_KE_FORM_TAO_CONG_VIEC_2026-10-21.md` + CV2431 + workbook gốc

> Mọi truy vấn Production trong tài liệu này là **chỉ đọc** (aggregate, không in tên cá nhân). Không sửa code/schema/API/UI, không chạy migration, không deploy.

---

## 1. TÓM TẮT ĐIỀU HÀNH

### 1.1. Root cause (đã kiểm chứng bằng code + dữ liệu)

| # | Phát hiện | Bằng chứng |
|---|---|---|
| **RC1** | **`tasks` không có trục nguồn.** Cột thực tế: `id, code, title, description, owner_id, unit_id, priority, status, original_deadline, current_deadline, has_issue, issue_notes, expected_result_text, actual_result_text, created_at, updated_at` — **không** có `catalog_entry_id`/`product_item_id`/`plan_item_id` | `information_schema.columns` (Production) |
| **RC2** | **Task ↔ đường đánh giá hoàn toàn rời nhau:** 18 task, **0** task có bất kỳ `personal_work_item` nào | Aggregate Production (read-only) |
| **RC3** | **`plan_items` chỉ là mục đại diện (outline), không mang nguồn.** Cột: `id, plan_id, group_id, title, sort_order, created_at`. `POST /api/plans` (`plans/route.ts:167-173`) chỉ ghi `groupId/title/sortOrder` — **nguồn TX/QĐ1277 bị rơi mất** | schema + `src/app/api/plans/route.ts:167` |
| **RC4** | **Thực tế `/plans` tạo `personal_work_item`, không phải `plan_item`**, và gắn `planItemId = activePlan.items[0].id` (hạng mục **đầu tiên**). 1 work_item có planItemId, **tiêu đề khác hoàn toàn** plan_item | `src/app/plans/page.tsx` (POST `/api/personal-work-items`, `planItemId: activePlan.items?.[0]?.id`) + aggregate |
| **RC5** | **Chỉ `personal_work_items` mang đủ trục nguồn**: `plan_item_id, template_id, dept_work_item_id, product_item_id, catalog_entry_id, task_id` + `due_date, completed_date` | `information_schema.columns` |
| **RC6** | **Chưa có khái niệm "đầu mối chủ trì".** `task_assignees.role` chỉ có `COLLABORATOR` (8 dòng, **0** `VIEWER`); owner **không bao giờ** nằm trong assignees → đầu mối chủ trì đang **ngầm = `Task.ownerId`**, trộn lẫn "người tạo" và "người chủ trì". Lãnh đạo giao cho cán bộ bằng cách set `ownerId` | `prisma/schema.prisma` (`TaskAssignee`), `src/app/api/tasks/route.ts:213,239` |
| **RC7** | **Ràng buộc chống nhân đôi kết quả tháng không có tác dụng.** `@@unique([personId, workItemId])` — nhưng cả **15/15** `monthly_work_results` đều `workItemId = NULL` (NULL không tham gia unique trong Postgres). Phát hiện **3 nhóm** (người + nguồn + kỳ) có >1 bản ghi | `prisma/schema.prisma` + aggregate Production |
| **RC8** | **Ca trực tách rời hoàn toàn** (đúng CV2431): `duty_rosters` 57 dòng, **không có** cột task/work_item/product; `duty_day_infos` 5 dòng | `information_schema.columns` + aggregate |
| **RC9** | **4 trục danh mục khác nhau, không được ép tương ứng:** TX1 **348** (NV 174 / TH 102 / CBL 57 / DANG 8 / CNTT 5 / PT 2) · QĐ1277 **3.386** sản phẩm · **48** mẫu legacy (8 đang dùng) · **5** nhóm `activity_group` cũ | aggregate Production + workbook gốc |
| **RC10** | **Provenance bị mất ở 2 luồng:** `POST /api/tasks` chỉ nhận `title/description` tự do; `POST /api/plans` chỉ nhận `title` | `src/app/api/tasks/route.ts:272-288`, `plans/route.ts:167-173` |

### 1.2. Kết luận quan trọng (đính chính giả định của Giai đoạn 3)

Báo cáo GĐ3 nghi ngờ "F1/F4 và F5 tạo bản ghi trùng". **Dữ liệu Production không ủng hộ giả định này:**

| Kiểm tra | Kết quả | Kết luận |
|---|---|---|
| Task có >1 `work_item` | **0** | Chưa có bằng chứng "1 Task → nhiều WorkItem" là trùng |
| Cặp (task, work_item) cùng người + cùng tiêu đề, work_item chưa gắn task | **0** | Chưa có cặp trùng thật giữa 2 bảng |
| `routine_entry` không có `workItemId` | **0 / 17** | Routine **tái dùng** work_item sẵn có; chỉ tạo mới khi caller KHÔNG truyền `workItemId` (`routine/route.ts:396-414`) → rủi ro là *tiềm ẩn theo code*, chưa xảy ra trên dữ liệu thật |
| Task trùng (owner + tiêu đề chuẩn hóa) | 1 nhóm / 2 bản ghi | Có cơ chế dedup sẵn (`tasks/route.ts:253-260`, cửa sổ `CREATE_DEDUP_WINDOW_SEC`) |
| **Nhóm trùng `monthly_work_results` (người + nguồn + kỳ)** | **3** | ⚠️ **Đây mới là rủi ro trùng THẬT** — do `workItemId = NULL` né ràng buộc unique |

**Root cause thật không phải "trùng dữ liệu" mà là "mất liên kết + mất nguồn":** 18/18 việc được giao không dẫn tới bất kỳ đơn vị đánh giá nào; 348 đầu việc TX1 **chưa được dùng lần nào**; hệ số nằm rải rác ở 3 nơi khác nhau.

### 1.3. Phương án khuyến nghị

**Phương án A — `personal_work_items` làm VIỆC GỐC (canonical), `tasks`/`plan_items` là lớp phân công & liên kết.**
Lý do: `personal_work_items` **đã có sẵn** đủ trục nguồn, hạn, ngày hoàn thành, minh chứng, liên kết kỳ; `tasks` **chưa có** trục nguồn; chuẩn hoá 1 bảng gốc rẻ hơn hợp nhất 2 bảng gốc song song.

**Quyết định cần người phụ trách duyệt:** (1) chọn Phương án A; (2) cho phép thêm cột `work_item_id` vào `tasks` và `plan_items`; (3) xác nhận mô hình "đầu mối chủ trì" (cá nhân **hoặc** bộ phận) và cách biểu diễn bộ phận chủ trì.

---

## 2. AS-IS — KIỂM CHỨNG F1–F8

### 2.1. Sơ đồ dữ liệu (thực tế Production, đọc-only)

```
                          ┌──────────────┐        ┌────────────────┐
                          │    tasks     │        │  plan_tasks    │
                          │ (18)         │        │  links (4)     │
                          │ owner_id ────┼───────>│ plan_item_id   │
                          │ unit_id      │        └────────�┬───────┘
                          │ KHÔNG có    │                 │
                          │ trục nguồn   │        ┌────────▼───────┐
                          └──────┬───────┘        │   plan_items   │ (14 / 5 plans)
                                 │                │ id, plan_id,   │
                    0 liên kết   │                │ group_id,     │
                                 │                │ title, sort_  │  ← CHỈ LÀ OUTLINE
                                 │                │ order (không  │     (không nguồn)
                                 │                │ có nguồn)    │
                                 │                └───────┬───────┘
                                 │                        │ planItemId (chỉ trỏ items[0])
                                 │                        ▼
                                 │        ┌──────────────────────────────────┐
                                 │        │      personal_work_items (26)     │
                                 │        │  person_id · period_id            │
                                 │        │  plan_item_id · template_id(48)   │
                                 │        │  dept_work_item_id               │
                                 │        │  product_item_id (QĐ1277)        │
                                 │        │  catalog_entry_id (TX1)          │
                                 │        │  task_id                          │
                                 │        │  due_date · completed_date        │
                                 │        │  expected_result · status         │
                                 │        └───┬────────────────────────┬─────┘
                                 │            │                        │
                                 │            ▼ 0                     ▼ 17
                                 │   ┌──────────────────┐   ┌────────────────────┐
                                 │   │monthly_work_     │   │  routine_entries   │ (17)
                                 │   │results (15)     │   │  workItemId ✔ 17/17│
                                 │   │  workItemId = 0  │   │  submissions (14)   │
                                 │   │  productItemId 14│   └────────────────────┘
                                 │   │  taskId 3       │
                                 │   │  unique(person,  │      ┌────────────────────┐
                                 │   │   workItemId)=NULL│      │   duty_rosters (57) │
                                 │   │  → KHÔNG chặn    │      │  KHÔNG có cột task │
                                 │   │    trùng          │      │  work_item/product │
                                 │   └──────────────────┘      └────────────────────┘
                                 │
   ┌─────────────────────────────┴──────────────┐
   │  work_catalog_entries (348) — TX1         │   product_items (3.386) — QĐ1277
   │  NV 174 · TH 102 · CBL 57 · DANG 8 ·        │   activity_templates (48) — legacy
   │  CNTT 5 · PT 2   (6 nhóm, KHÔNG = bộ phận) │   activity_group (5 nhóm cũ)
   │  đang được dùng bởi work_item: 0           │   work_catalog_department_mappings (0)
   └───────────────────────────────────────────┘   approval_cases (0) · approval_decisions (0)
```

### 2.2. Ma trận AS-IS (8 luồng × các trục)

| Luồng | API | Bảng ghi | Nguồn được lưu? | Người tạo | Người giao | Chủ trì | Phối hợp | Hạn | Ngày hoàn thành | Minh chứng | Kết quả tháng | Tính điểm | Phê duyệt |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **F1** Nhật ký CV — "Thêm việc mới (Tùy biến)" | `POST /api/tasks` (`tasks/route.ts:272`) | `tasks` + `task_assignees` | ❌ chỉ `title`/`description` | = user | = user | ⚠️ ngầm `ownerId` (`route.ts:213`) | `assignees` role=COLLABORATOR | `currentDeadline` | ❌ | `task_attachments` (1) | ❌ không dẫn tới work_item | ✅ qua `tasks` |
| **F2** Lập kế hoạch | `POST /api/plans` (`plans/route.ts:160`) | `plans` + `plan_items` | ❌ plan_item chỉ có `title`/`groupId` | user | user | n/a | n/a | ❌ (plan theo kỳ) | ❌ | ❌ | ❌ | ✅ `plans/[id]/workflow` |
| **F3** "Thêm đầu việc công tác" trong kế hoạch | `POST /api/personal-work-items` (`personal-work-items/route.ts:398`) | `personal_work_items` | ✅ **1 nguồn** (TX **hoặc** SP **hoặc** 48 mẫu **hoặc** dept) + `planItemId`→items[0] | user | user | = `personId` | ❌ | `dueDate` | `completedDate` | `work_evidences` | ✅ `monthly_work_results` | ✅ (YC-33) | ✅ (YC-37) |
| **F4** Công việc phát sinh (lãnh đạo giao) | `POST /api/tasks` | `tasks` + `task_assignees` | ❌ | user | user | ⚠️ `ownerId` (đặt được qua body) | `assignees` | `currentDeadline` | `actualResultText` | `task_attachments` | ❌ | ❌ | ✅ |
| **F5** Nhật ký tác nghiệp | `POST /api/routine` (`routine/route.ts:399,418,441`) | `routine_entries` (+`personal_work_items` nếu không truyền `workItemId`) + `result_submissions` | ⚪ `templateId` | user | user | = `personId` | ❌ | theo ca | theo ca | ❌ (qua `result_submissions`) | ⚠️ đường gián tiếp | ⚠️ | ✅ |
| **F6** Giao việc từ biên bản giao ban | `POST /api/meetings/[id]` (`meetings/[id]/route.ts:162`) | `tasks` | ❌ | user | user | `ownerId` (từ `meetingConclusion`) | `assignees` | `deadline` | ❌ | ❌ | ❌ | ❌ | ✅ |
| **F7** Giao việc từ văn bản đến | `POST /api/docs` (`docs/route.ts:176`) | `tasks` | ❌ | user | user | `ownerId` | ❌ | `deadline` | ❌ | ❌ | ❌ | ❌ | ✅ |
| **F8** Phân công ca trực | `POST /api/rosters` (`rosters/route.ts:288,346`), `/day-info` | `duty_rosters` (57), `duty_day_infos` (5) | ❌ (không có cột) | user | user | = người trực | ❌ | theo ca | theo ca | ❌ | ❌ | ❌ | ❌ |

### 2.3. Số liệu Production (read-only, 21/10/2026)

| Nhóm | Số liệu |
|---|---|
| `tasks` | 18 (CANCELED 1 · IN_PROGRESS 6 · COMPLETED 7 · NOT_STARTED 3 · WAITING_REVIEW 1) |
| Task có `plan_task_links` | 4 · Task có ≥1 work_item: **0** |
| `task_assignees` | 8 dòng, role=**COLLABORATOR** 100%; owner trùng assignee: 0 |
| `personal_work_items` | 26 — theo nguồn: template(48 mẫu) **21** · tự nhập 4 · planItem 1 · productItem(QĐ1277) 1 · deptWorkItem 1 · **catalogEntry(TX1) 0**; có `monthly_result` 0; có minh chứng 0; có hạn 0; có ngày hoàn thành 0 |
| `monthly_work_results` | 15 — productItem 14 · task 3 · không nguồn 1 · **workItem 0**; có `factor_snapshot` 14; thiếu `completedQty` 1; **3 nhóm trùng (người+nguồn+kỳ)**; ràng buộc unique không có tác dụng (workItemId=NULL) |
| `routine_entries` | 17 — **17/17 có `workItemId`** (tái dùng work_item) · 15 có `templateId` · `result_submissions` 14 |
| `duty_rosters` / `duty_day_infos` | 57 / 5 — **không có cột liên kết công việc** |
| Danh mục | TX1 348 (đang dùng: **0**) · QĐ1277 3.386 (đang dùng 1) · 48 mẫu legacy (đang dùng 8) · 5 nhóm legacy |
| `approval_cases` / `approval_decisions` | 0 / 0 |
| Dữ liệu DEMO trên Production | 3 person `DEMO*` → **13** work_item · **15** monthly_result (**100%** kết quả tháng) · 9 task · 4 routine |

---

## 3. TO-BE

### 3.1. Nguyên tắc bất di bất dịch

1. **Một việc gốc = một `work_item`**; `tasks` = **phân công**, `plan_items` = **mục đại diện kế hoạch**, `routine_entries` = **nhật ký lượt thực hiện**, `monthly_work_results` = **kết quả chấm điểm theo kỳ**.
2. **Một đầu mối chủ trì duy nhất** cho mỗi việc gốc: **cá nhân hoặc bộ phận**; tách rõ *người tạo · người giao · chủ trì · người thực hiện · người phê duyệt*.
3. **Hai trục danh mục độc lập:** TX1 = nguồn công việc (348) · QĐ1277 = sản phẩm đầu ra (3.386) — **không** quy đổi hệ số chéo, **không** gộp 6 nhóm TX với 6/5 nhóm cũ, giữ nguyên 48 mẫu.
4. **Không mất lịch sử**: mọi bảng cũ giữ nguyên; chỉ **bổ sung** cột/liên kết.
5. **Idempotency theo (nguồn, người, kỳ)** — không phụ thuộc `workItemId` khác NULL.

### 3.2. Phương án A — `personal_work_items` làm việc gốc (KHUYẾN NGHỊ)

**ERD (bổ sung, không xoá):**

```
 personal_work_items  (VIỆC GỐC — bảng gốc)
 ├─ id ──────────────┬─ person_id          (người thực hiện/kỳ của việc)
 │                   ├─ period_id          (kỳ đánh giá)
 │                   ├─ due_date           (hạn xử lý)
 │                   ├─ completed_date     (ngày hoàn thành thực tế)
 │                   ├─ expected_result    (kết quả cần đạt — trục "6 rõ")
 │                   ├─ status             (DRAFT/IN_PROGRESS/COMPLETED/...)
 │                   ├─ catalog_entry_id   ──► work_catalog_entries (TX1 348)   [TRỤC NGUỒN VIỆC]
 │                   ├─ product_item_id    ──► product_items (QĐ1277 3.386)     [TRỤC SẢN PHẨM ĐẦU RA]
 │                   ├─ template_id        ──► activity_templates (48 legacy)      [tương thích lịch sử]
 │                   ├─ dept_work_item_id  ──► department_work_items
 │                   ├─ plan_item_id       ──► plan_items
 │                   ├─ task_id            ──► tasks                            [NGUỒN GIAO VIỆC]
 │                   └─ NEW: primary_owner_person_id ──► persons                   [ĐẦU MỐI CHỦ TRÌ]
 │                   └─ NEW: primary_owner_unit_id    ──► org_units                [chủ trì = BỘ PHẬN]
 │                   └─ NEW: source_kind    (TX_CATALOG|QD1277_PRODUCT|PLAN|DEPT|LEGACY_TEMPLATE|CUSTOM)
 │                   └─ NEW: source_ref_id / source_code_snapshot                [PROVENANCE bất biến]
 │
 ├─ NEW tasks.work_item_id  (FK ngược) + tasks.created_by_id + tasks.assigned_by_id
 ├─ NEW plan_items.work_item_id (FK ngược) — thay cho việc trỏ items[0]
 ├─ monthly_work_results.work_item_id  (đã có) + NEW: subject_kind + subject_id + idempotency_key
 ├─ routine_entries.work_item_id (đã có, đang tái dùng 17/17) — chuẩn hoá: LUÔN tái dùng
 └─ NEW work_item_assignments(work_item_id, person_id, role, period_id, source)  [nhiều người / nhiều kỳ]
```

**Trạng thái:**

| Thực thể | State machine |
|---|---|
| `personal_work_items` | `DRAFT → IN_PROGRESS → (WAITING_REVIEW) → COMPLETED`; `CANCELLED`; `NOT_OCCURRED` (tồn tại ở routine) |
| `tasks` (lớp phân công) | `NOT_STARTED → IN_PROGRESS → WAITING_REVIEW → COMPLETED`; `CANCELED` (giữ nguyên hiện tại) |
| `plan_items` | không đổi (outline) |
| `plans` | `DRAFT → SUBMITTED → APPROVED → IN_EFFECT`; `RETURNED` (giữ nguyên) |
| `monthly_work_results` | `DRAFT → CONFIRMED` (snapshot điểm) |
| `approval_cases` | `OPEN → AGREED | REJECTED | CLARIFY_REQUESTED → (RESPOND) → OPEN` |

**Field mapping AS-IS → TO-BE:**

| Trường AS-IS | Nơi | TO-BE | Ghi chú |
|---|---|---|---|
| `tasks.owner_id` | `tasks` | `tasks.created_by_id` (mới) + `work_items.primary_owner_person_id` | tách "người tạo" khỏi "chủ trì" |
| `task_assignees.role` | `task_assignees` | thêm `PRIMARY_OWNER` (mới, cho 1 chủ trì) | giữ `COLLABORATOR`/`VIEWER` |
| `tasks.description` (tự do) | `tasks` | `work_items.source_kind + source_ref_id` | provenance chuẩn hoá |
| `plan_items.title` | `plan_items` | giữ + `plan_items.work_item_id` (mới) | hết trỏ `items[0]` |
| `plan_items.group_id` | `plan_items` | giữ (5 nhóm legacy) | **không** ép sang 6 nhóm TX |
| `work_items.catalog_entry_id` | `personal_work_items` | giữ (đã là trục TX) | đã đúng |
| `work_items.product_item_id` | `personal_work_items` | giữ (đã là trục QĐ1277) | đã đúng |
| `work_items.template_id` | `personal_work_items` | giữ | 48 mẫu giữ lịch sử; ẩn khỏi form **mới** |
| `work_items.task_id` | `personal_work_items` | giữ + trỏ ngược `tasks.work_item_id` | 2 chiều |
| `monthly_work_results.work_item_id` | | giữ + `subject_kind/subject_id` | khi workItemId NULL vẫn xác định được đối tượng |
| `@@unique([personId, workItemId])` | `monthly_work_results` | thay bằng **unique partial** theo `idempotency_key` | hết lỗ hổng NULL |
| `duty_rosters` | | **KHÔNG đổi** | ca trực là phân công vị trí, không phải việc đánh giá |
| `work_catalog_entries` 348 | | **KHÔNG đổi** | không gộp 6 nhóm với bộ phận |
| `product_items` 3.386 | | **KHÔNG đổi** | không phải nguồn công việc |

**Quyền (RBAC) — tách 5 vai:**

| Vai | Ý nghĩa | Nguồn hiện có | TO-BE |
|---|---|---|---|
| Người tạo | ai mở form | `tasks.ownerId` (đang gộp) | `created_by_id` |
| Người giao | lãnh đạo giao | ngầm = `ownerId` | `assigned_by_id` (audit) |
| **Đầu mối chủ trì** | chịu trách nhiệm giải quyết | ❌ chưa có | `primary_owner_person_id` **hoặc** `primary_owner_unit_id` — **1 trong 2, không cả 2** |
| Người thực hiện | cập nhật tiến độ/kết quả | `work_items.personId`, `task_assignees` | giữ + `work_item_assignments.role` |
| Người phê duyệt | quyết định xếp loại | `approval_cases.decided_by_id` | giữ |

**Idempotency & chống trùng:**
- Tạo việc: `dedupKey = task-create:<owner>:<normalizeTitle>` (đã có, `tasks/route.ts:253`) — giữ, mở rộng thêm `work_item_id` khi có.
- Kết quả tháng: `idempotency_key = <person>|<subject_kind>:<subject_id>|<period>` — unique partial index (bổ sung, không xoá unique cũ).
- Tính điểm: `score_runs` unique `(person, periodType, periodYear, periodNumber, formulaVersion)` — **đã có**; giữ snapshot.

**Nhiều người / nhiều kỳ:**
- Nhiều người thực hiện 1 việc → `work_item_assignments` (nhiều dòng, 1 dòng `PRIMARY_OWNER` tối đa) **hoặc** mỗi người 1 `work_item` con — **cần Hải quan chốt** (Q-B1).
- Nhiều kỳ cho 1 việc → 1 `work_item` mỗi kỳ, gắn qua `plan_item_id`/`task_id`; **không** unique `(task_id, period_id)` cứng (theo cảnh báo §4 tài liệu đề bài).

**Chi phí & rủi ro Phương án A:**
- +2 cột `tasks`, +3 cột `plan_items`/`personal_work_items`, +1 bảng `work_item_assignments`, +partial unique index → **additive, không xoá**.
- Rủi ro: dữ liệu cũ 26 work_item thiếu `primary_owner` → backfill `= person_id`; 18 task thiếu `work_item_id` → **KHÔNG** backfill hàng loạt (sẽ tạo quan hệ giả); chỉ đánh dấu `UNLINKED` để lãnh đạo gắn dần.
- Số bản ghi cần backfill: **0 bản ghi bị xoá/sửa**; chỉ cập nhật cột null.

### 3.3. Phương án B — `tasks` làm việc gốc

**ERD rút gọn:** `tasks` thêm `catalog_entry_id, product_item_id, plan_item_id, primary_owner_person_id, created_by_id, assigned_by_id, period_id`; `personal_work_items` thành **projection** theo (task, person, period) — mỗi người × kỳ 1 dòng.

**Vì sao KHÔNG khuyến nghị:**
1. `tasks` **không có `person_id`** (chỉ `owner_id` + `task_assignees`) → "1 việc, N người thực hiện" phải nhân bản Task → **trái nguyên tắc một việc gốc**.
2. Lịch sử hiện có: **26 work_item** (21 từ 48 mẫu legacy, 4 tự nhập) và **15 monthly_result** (14 theo `product_item_id`) → backfill ngược về Task **không tồn tại** cho phần lớn → phải tạo Task ảo → vi phạm "không nhân bản".
3. Kỳ đánh giá nằm ở `work_items.period_id`/`monthly_results.period_year-month`; Task không có khái niệm kỳ → phải thêm `period_id` vào Task → Task vừa là "việc" vừa là "kỳ" → lẫn lộn.
4. `routine_entries` (17) đang trỏ `work_item_id` → phải chuyển sang Task → sửa 17 bản ghi lịch sử.
5. Rủi ro cao hơn: ảnh hưởng `tasks` (18 bản ghi, có lịch sử approval/audit) + `plans` + `routine` + `monthly_results` cùng lúc.

**Kết luận:** B khả thi về lý thuyết nhưng chi phí chuyển đổi và rủi ro mất liên kết lịch sử **cao hơn rõ rệt**; A tận dụng bảng đã có đủ trục nguồn.

### 3.4. So sánh A ↔ B

| Tiêu chí | A (work_item gốc) | B (task gốc) |
|---|---|---|
| Bảng gốc đã có trục nguồn? | ✅ `personal_work_items` | ❌ `tasks` (0/5 trục) |
| Hỗ trợ 1 việc – N người thực hiện | ✅ (`work_item_assignments` hoặc N work_item theo kỳ) | ⚠️ phải nhân bản Task |
| Bản ghi lịch sử phải backfill | 0 (chỉ cột null) | ≥ 26 work_item + 15 kết quả tháng |
| Ảnh hưởng `routine_entries` (17) | không (đã trỏ đúng) | sửa 17 dòng |
| Ảnh hưởng `tasks` (18) | +2 cột | +8 cột + đổi vai trò |
| Rủi ro mất liên kết | Thấp | Trung bình–Cao |
| Chi phí bảo trì | 1 bảng gốc + 1 bảng liên kết | 1 bảng gốc + projection + adapter |
| Phù hợp "một việc gốc – một lần nhập" | ✅ | ⚠️ |
| **Kết luận** | **KHUYẾN NGHỊ** | Giữ làm phương án dự phòng |

---

## 4. KẾ HOẠCH CHUYỂN ĐỔI (nhiều chặng, rollback từng bước)

| Chặng | Nội dung | Điều kiện dừng | Rollback |
|---|---|---|---|
| **C0** | Backup JSON Production (bảng liên quan) + kiểm tra `restore-test` trên clone local | có file backup đọc lại được | — |
| **C1** | **Schema additive**: `tasks.work_item_id`, `tasks.created_by_id`, `tasks.assigned_by_id`; `plan_items.work_item_id`; `work_items.primary_owner_person_id`, `primary_owner_unit_id`, `source_kind`, `source_ref_id`, `source_code_snapshot`; bảng `work_item_assignments`; partial unique `monthly_work_results.idempotency_key` | `checks_failed=0`, đếm đối chiếu trước/sau không đổi | `DROP` cột/bảng mới (chưa có dữ liệu) |
| **C2** | **Dry-run backfill trên local fixture** (script `scripts/yc38c-dryrun-backfill.mjs`): xuất báo cáo ánh xạ đề xuất + checksum + tỉ lệ khớp; **không ghi Production** | báo cáo review, không có dòng "mơ hồ" bị ghi | không áp dụng |
| **C3** | **Backfill an toàn** (chỉ cột null, không tạo quan hệ giả): `work_items.primary_owner_person_id = person_id` (fallback), `source_kind` suy từ cột nguồn đã có | số dòng `UNRESOLVED` được đánh dấu chứ không gán | revert theo backup C0 |
| **C4** | **Read adapter**: `GET /api/work-items?scope=...` trả view hợp nhất (work_item + task gốc + plan + routine) — **chỉ đọc**, không đổi hành vi cũ | UI cũ không đổi output | bỏ cờ feature |
| **C5** | **Dual-write có kiểm soát**: khi tạo work_item mới → ghi `tasks.work_item_id` nếu có task; có `idempotency_key`; bật bằng feature flag, **giới hạn theo đơn vị** | đối chiếu số bản ghi 2 bảng khớp | tắt cờ |
| **C6** | **Write-path thống nhất**: `POST /api/tasks` và `POST /api/plans` bắt buộc nhận `sourceKind` + `sourceRefId` (hoặc tự suy từ picker); tạo work_item tương ứng khi giao việc có đủ căn cứ | không mất task nào không có work_item khi đã bật | tắt cờ + adapter |
| **C7** | **Dọn 48 mẫu khỏi form mới** (giữ nguyên bản ghi lịch sử) | đã đánh giá phụ thuộc; có cờ | hiện lại |
| **C8** | **Thu hồ adapter** khi YC-38C nghiệm thu | không còn viết 2 bảng | giữ adapter lâu dài |

**Quy tắc match backfill (đề xuất, cần duyệt):**
- `work_item.source_kind` = ưu tiên theo thứ tự: `catalog_entry_id`→TX_CATALOG · `product_item_id`→QD1277_PRODUCT · `plan_item_id`→PLAN · `dept_work_item_id`→DEPT · `template_id`→LEGACY_TEMPLATE · còn lại→CUSTOM.
- `primary_owner_person_id` = `person_id` (fallback) — **chỉ khi chưa có**; tuyệt đối **không** tự gán từ `task.ownerId` khi lệch người.
- `tasks.work_item_id`: **KHÔNG** backfill tự động (18/18 không có work_item khớp) → đánh dấu `UNLINKED` để lãnh đạo gắn.

---

## 4.1. Dry-run backfill (đã chạy trên LOCAL fixture — bằng chứng)

Công cụ: `scripts/yc38c-dryrun-backfill.mjs` — **chỉ đọc**, từ chối chạy nếu DB không phải localhost.

Kết quả trên fixture local (4 work_item · 2 task · 1 plan_item):

```
work_items: 4
  theo source_kind: {"PLAN":4}
  theo source_confidence: {"HIGH":4}
  theo primary_owner_confidence: {"FALLBACK_PERSON":4}
  UNRESOLVED (chủ trì): 0

tasks: 2
  đã có work_item_id: 0            (cột chưa tồn tại — thêm ở chặng C1, additive)
  có ĐÚNG 1 work_item khớp (ứng viên backfill, cần người duyệt): 0
  KHÔNG có work_item nào khớp → đánh dấu UNLINKED, KHÔNG backfill: 2
  nhiều work_item khớp (mơ hồ) → cần người quyết định: 0
  lưu ý: cột tasks.work_item_id / plan_items.work_item_id CHƯA tồn tại — thêm ở chặng C1

plan_items: 1 · đã có work_item_id: 0

checksum (SHA-256 thứ tự ổn định): dee68e3669e98780d50684b40756681e14c6f104c06c3ce2c55f424ed55c2dc0
idempotency (chạy lại): ✔ checksum không đổi
bảo toàn: work_items trước=4 sau=4 ✔

KẾT LUẬN: dry-run chỉ đọc, chưa áp dụng gì.
```

**Quy tắc match đã hiện thực trong công cụ (đề xuất, chờ duyệt):**
`source_kind` theo thứ tự ưu tiên `catalog_entry_id` → TX_CATALOG · `product_item_id` → QD1277_PRODUCT · `plan_item_id` → PLAN · `dept_work_item_id` → DEPT · `template_id` → LEGACY_TEMPLATE · còn lại → CUSTOM.
`primary_owner_person_id` fallback = `person_id` của chính work_item (**không** tự lấy từ `task.ownerId` khi lệch người).
`tasks.work_item_id`: **không** backfill tự động (0 ứng viên khớp) → đánh dấu `UNLINKED` để lãnh đạo gắn tay.

**Điểm dừng trước Production:** bắt buộc có (1) người phụ trách duyệt phương án A; (2) trả lời Q-B1…Q-B4; (3) backup C0 có restore-test trên clone; (4) báo cáo "ứng viên backfill task" được rà soát.

---

## 5. HỢP ĐỒNG UI CHO YC-38B (chỉ thiết kế, chưa code)

**Nguyên tắc:** cán bộ **nhập tên trước**; hệ thống **gợi ý** mã TX phù hợp; nút *Chọn từ danh mục* mở; **không** ép chọn hai danh mục.

**Hợp đồng component dùng chung** (1 component cho `/my-work`, `/plans`, `/tasks`):

```
<WorkSourcePicker
  value={ { sourceKind, sourceRefId, sourceCodeSnapshot, title } }
  onChange={...}
  personUnitId={...}          // để xếp hạng gợi ý theo bộ phận
  recentSourceIds={...}       // "gần đây" — lưu client-side theo người
  favoriteSourceIds={...}     // "ghim" — lưu client-side
/>
```

| Hành vi | Yêu cầu cụ thể |
|---|---|
| Ô nhập chính | Tiêu đề công việc, tự do; **không** bắt buộc chọn danh mục |
| Gợi ý TX | Sau khi có ≥ 3 ký tự → gọi `GET /api/work-catalog/suggest?q=` (server) → trả **tối đa 8** mã TX, ưu tiên: (1) khớp tiêu đề đã nhập (không dấu), (2) cùng nhóm TX đã dùng gần đây của người, (3) cùng đơn vị, (4) ưu tiên nhóm `TH` (Tổng hợp & Báo cáo) khi tiêu đề chứa từ khóa báo cáo/tổng hợp |
| Nút *Chọn từ danh mục* | Mở modal 2 tab: **① Danh mục TX (348)** · **② Sản phẩm QĐ1277 (3.386)** — tab độc lập, **không** bắt buộc chọn cả hai |
| Tìm QĐ1277 | **Server-side** (`GET /api/products?search=&pageSize=20`) — không tải 3.386 bản ghi về client; tìm không dấu |
| Tìm TX | `GET /api/work-catalog?q=` — không dấu, theo mã (`NV-01`) hoặc tiêu đề |
| "Gần đây" | 10 nguồn dùng gần nhất **của người đang đăng nhập** (client-side, theo `sourceRefId`) — không hiển thị dữ liệu người khác |
| "Ghim" | Người dùng ghim tối đa 5 mã TX / 5 sản phẩm; lưu local |
| Ưu tiên danh mục phù hợp nhưng **không khóa** | Gợi ý TX đặt trên cùng; người dùng vẫn tự nhập hoặc bỏ chọn |
| Ẩn 48 mẫu legacy | Ở form **mới**; các bản ghi cũ vẫn hiển thị nguồn "Mẫu cũ" và không sửa |
| Hiển thị hệ số | Nếu mã TX có hệ số → hiển thị *Hệ số: 2.5* (đọc) hoặc *Chưa có hệ số*; **không** cho sửa ở form nhập |
| Sản phẩm QĐ1277 | Chọn **không bắt buộc**; không dùng hệ số sản phẩm làm hệ số công việc |

---

## 6. MA TRẬN KIỂM THỬ, UAT, KẾ HOẠCH YC-38C

### 6.1. Ma trận kiểm thử (chỉ thiết kế)

| # | Tình huống | Kỳ vọng | Cấp |
|---|---|---|---|
| T1 | 1 việc giao cho 1 người | 1 work_item, 1 chủ trì, đúng nguồn | Unit+API |
| T2 | 1 việc giao cho **bộ phận** (đầu mối chủ trì = đơn vị) | `primary_owner_unit_id` set, `primary_owner_person_id` null | Unit |
| T3 | 1 việc giao cho nhiều người | ≥2 assignee, **1** chủ trì, nhiều `work_item_assignments` | Unit+UI |
| T4 | Giao qua trưởng bộ phận → phân công tiếp | giữ truy vết tới việc gốc, không tạo việc gốc mới | Unit |
| T5 | 1 kế hoạch nhiều kỳ | work_item tách theo kỳ, `period_id` đúng | Unit |
| T6 | Ca trực không có sản phẩm | **không** sinh work_item/sản phẩm | Unit |
| T7 | 1 task có nhiều work_item khác kỳ | hợp lệ, **không** coi là trùng | Unit+DB |
| T8 | TX hệ số = 0 | giữ 0, điểm = 0, **không** coi là thiếu | Unit |
| T9 | TX hệ số NULL | `INSUFFICIENT_DATA`, không ra điểm giả | Unit |
| T10 | 1 việc có nhiều sản phẩm QĐ1277 | cho phép (0..n sau khi Hải quan chốt) | API |
| T11 | Phê duyệt trước/sau khi tạo | audit + `approval_cases` đúng vòng | API+UI |
| T12 | Double-click / retry | 1 bản ghi (idempotency key) | API |
| T13 | Đổi người chủ trì | audit, lịch sử giữ | API+DB |
| T14 | Không đủ quyền | 403, không ghi | API |
| T15 | Đánh giá quý | không tự tổng hợp tháng → quý | Unit |
| T16 | Lịch sử 48 mẫu | hiển thị đúng, không sửa, không xoá | UI+DB |
| T17 | Bộ lọc/tìm QĐ1277 > 3.000 | server-side, phản hồi < 1s | API+UI |
| T18 | Gợi ý TX khi nhập tên | ≤ 8 gợi ý, ưu tiên đúng | UI |
| T19 | Dữ liệu DEMO trên Production | lọc/tách an toàn, **không xoá** | DB |
| T20 | Regress YC-01→37 | không hỏng | E2E |

### 6.2. Tiêu chí nghiệm thu YC-38B/C

- Không mất bản ghi nào (đếm trước/sau bằng nhau).
- Mọi work_item mới có `source_kind` + `source_ref_id` **hoặc** `CUSTOM` hợp lệ.
- 100% việc được giao có đường dẫn tới đơn vị đánh giá (work_item ↔ monthly_result).
- 0 việc có 2 chủ trì.
- 0 kết quả tháng trùng (người+đối tượng+kỳ).
- 348 TX + 3.386 sản phẩm + 48 mẫu còn nguyên; 6 nhóm TX không bị ép vào bộ phận.
- 0 lỗi console; các bộ kiểm thử YC-01→37 vẫn xanh.

### 6.3. Checklist UAT (rút gọn — 12 mục)

1. Tạo việc bằng **tên** (không chọn danh mục) → lưu được, nguồn = tự nhập.
2. Gõ tên → hiện **gợi ý mã TX**; chọn 1 mã → nguồn = TX, hiện hệ số.
3. Mở *Chọn từ danh mục* → 2 tab (TX 348 / Sản phẩm QĐ1277); tìm QĐ1277 nhanh, không tải hết về máy.
4. "Gần đây"/"Ghim" hiển thị đúng của người đang đăng nhập.
5. Không bắt buộc chọn cả TX và sản phẩm.
6. Lãnh đạo giao việc → hiện **người chủ trì** rõ ràng; giao cho bộ phận → hiện bộ phận chủ trì.
7. Giao cho nhiều người → chỉ 1 chủ trì.
8. Việc đã giao → mở Nhật ký công việc thấy **cùng một** việc (không phải 2 bản ghi).
9. Ghi kết quả tháng → không tạo bản ghi thứ 2 cho cùng người/kỳ/đối tượng.
10. Ca trực → không sinh việc đánh giá.
11. 48 mẫu cũ: lịch sử vẫn xem được, form mới không còn mẫu cũ.
12. Số liệu tổng không đổi sau toàn bộ thao tác.

### 6.4. Kế hoạch YC-38C (chi tiết hoá để giao)

| Việc | Nội dung | Đầu ra | Phụ thuộc |
|---|---|---|---|
| 38C-1 | Script dry-run backfill trên **local fixture** (không Production) | `scripts/yc38c-dryrun-backfill.mjs` + báo cáo match/checksum/idempotency | duyệt Q-B1 |
| 38C-2 | Apply-script C1 (additive) | `scripts/apply-yc38c-ddl.ts` | duyệt A |
| 38C-3 | Read adapter + feature flag | `GET /api/work-items` | C1 |
| 38C-4 | Dual-write có kiểm soát | `POST /api/tasks`, `/api/plans` | C1 + B1 |
| 38C-5 | Bộ chọn thông minh (UI contract §5) | `src/components/work/WorkSourcePicker.tsx` | B1 (chỉ thiết kế ở 38A) |
| 38C-6 | Chuẩn hoá unique kết quả tháng | partial unique + `idempotency_key` | C1 |
| 38C-7 | Chống trùng khi tạo việc | `idempotency_key` cho work_item | C1 |
| 38C-8 | Ẩn 48 mẫu khỏi form mới (giữ lịch sử) | cờ + UI | C4 |
| 38C-9 | Lọc/tách dữ liệu DEMO ở Production (không xoá) | báo cáo + cờ hiển thị | C3 |
| 38C-10 | Hồ sơ bàn giao + UAT | tài liệu | tất cả |

---

## 7. CÂU HỎI NGHIỆP VỤ CẦN HẢI QUAN TRẢ LỜI

> Phân biệt: **Hỏi Hải quan** (cần quyết định nghiệp vụ) vs **quyết định kỹ thuật Agent** (có thể tự đề xuất).

### 7.1. CHẶN triển khai (cần Hải quan)

| # | Câu hỏi | Ảnh hưởng | Tùy chọn | Khuyến nghị | Ưu tiên |
|---|---|---|---|---|---|
| **Q-B1** | Một việc giao cho **nhiều người** thì mỗi người có 1 work_item riêng (theo kỳ) hay 1 work_item + bảng phân công? | Quyết định khóa unique + cấu trúc `work_item_assignments` | (a) 1 work_item/người/kỳ · (b) 1 work_item + assignments | (b) — khớp "một việc gốc" CV2431; (a) chỉ khi cần chấm điểm riêng từng người | **P0** |
| **Q-B2** | "Đầu mối chủ trì" là **cá nhân hay bộ phận**? Nếu bộ phận thì ai là người đại diện chịu trách nhiệm? | `primary_owner_person_id` vs `primary_owner_unit_id` | (a) chỉ cá nhân · (b) chỉ bộ phận · (c) cả hai (1 trong 2) | (c) — CV2431 ghi *"cá nhân hoặc bộ phận"*, người đại diện để trống, giao việc xuống bộ phận sẽ sinh chủ trì cá nhân | **P0** |
| **Q-B3** | 1 việc có được gắn **nhiều sản phẩm QĐ1277** không? | `product_item_id` (1:1) vs bảng nối (1:n) | (a) 0..1 · (b) 0..n | (b) nếu 1 nhiệm vụ sinh nhiều sản phẩm — **chờ Hải quan xác nhận theo CV2431** | P1 |
| **Q-B4** | Hệ số tính điểm lấy từ **TX hay QĐ1277** khi một việc có cả hai? | quy tắc nguồn hệ số (YC-33) | (a) TX ưu tiên · (b) QĐ1277 ưu tiên · (c) chưa được gắn hệ số thì chưa tính | (c) — hiện tại YC-33 đã chọn theo nguồn, **cần chốt thứ tự ưu tiên** | **P0** |
| **Q-B5** | Mẫu 2C (báo cáo kết quả thực hiện nhiệm vụ **của đơn vị**, theo quý) có phải đầu ra bắt buộc của hệ thống? Có dùng lại file "Mẫu 2C Báo cáo KQ…docx" trong bộ hồ sơ không? | phạm vi YC-38C | (a) có · (b) không | (a) — CV2431 mục IV.1.1.a/c liệt kê 2C trong bộ hồ sơ quý | P1 |
| **Q-B6** | Ca trực có phải là **đầu vào** của kết quả đánh giá quý không? | có sinh work_item từ ca trực không | (a) có · (b) không | (b) hiện tại — CV2431 không nêu trực tiếp; nếu (a) cần thêm quy tắc | P2 |

### 7.2. KHÔNG chặn triển khai (quyết định kỹ thuật của Agent — đề xuất)

| # | Vấn đề | Đề xuất |
|---|---|---|
| T-K1 | Bảng gốc | `personal_work_items` (Phương án A) |
| T-K2 | Tên bảng liên kết | `work_item_assignments` (role: `PRIMARY_OWNER`/`COLLABORATOR`/`VIEWER`) |
| T-K3 | Khóa idempotency kết quả tháng | `idempotency_key = person|subject_kind:subject_id|period`, unique partial |
| T-K4 | Trường provenance | `source_kind` + `source_ref_id` + `source_code_snapshot` (bất biến) |
| T-K5 | Cờ tương thích | feature flag theo đơn vị, tắt được tức thì |
| T-K6 | Backfill | chỉ cột null; **không** tạo quan hệ giả; mục chưa xác định → `UNRESOLVED` + báo cáo |
| T-K7 | 48 mẫu | giữ nguyên bản ghi; ẩn khỏi form mới sau khi đánh giá phụ thuộc |
| T-K8 | 6 nhóm TX | giữ nguyên; **không** tạo bảng ánh xạ sang `org_units` cho tới khi Hải quan xác nhận |
| T-K9 | Dữ liệu DEMO Production | lọc/tách bằng cờ hiển thị, **không xoá** |
| T-K10 | Ẩn 48 mẫu | chỉ ở form tạo mới; form sửa cũ vẫn hiện nguồn |

---

## 8. KHẲNG ĐỊNH

```
YC38A            = DESIGN_ONLY
CODE_CHANGE      = NONE
PRODUCTION_CHANGE= NONE
SCHEMA_CHANGE    = NONE
MIGRATION_RUN    = NONE
DEPLOY           = NONE
DATA_WRITES      = NONE   (mọi truy vấn Production trong tài liệu này là chỉ đọc)
```

**Tài liệu sản phẩm:** `docs/YC38A_OPENCODE_DESIGN_ONLY/YC38A/YC38A_KIEN_TRUC_QUAN_LY_CONG_VIEC.md` (đặc tả yêu cầu) · `docs/YC38A_GIAI_PHAP_KIEN_TRUC_QUAN_LY_CONG_VIEC_2026-10-21.md` (báo cáo này).
**Tài liệu tham chiếu:** `docs/YC33_37_GIAI_DOAN_3_BAO_CAO_2026-10-21.md` · `docs/YC33_37_KIEM_KE_FORM_TAO_CONG_VIEC_2026-10-21.md`.

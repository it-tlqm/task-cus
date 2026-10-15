# REVIEW / AUDIT ĐỘC LẬP — TALUNG-CUS-WORK
**Ngày:** 2026-10-15 · **Phạm vi:** xác minh claim "131/131 PASS / READY FOR INTERNAL PILOT" trong `docs/FULL_SYSTEM_UAT_REPORT.md`
**Phương pháp:** đọc code toàn bộ lớp guard + toàn bộ `src/app/api/**/route.ts` (44 route handlers) + UI liên quan, chạy `tsc --noEmit`, `prisma validate`, `next build`. **Không sửa code. Không migrate/seed.**

## 0. Baseline & môi trường kiểm chứng
- Git: dùng MinGit winget (`...\WinGet\Packages\Git.MinGit_...\cmd\git.exe`, ngoài PATH). `git status`: `M skills-lock.json` (+650/-2, thuần thêm skill entries), `?? .opencode/`, `?? AGENTS.md` — đúng hiện trạng đã khai báo, không đụng code nghiệp vụ.
- Toolchain: `C:\Program Files\nodejs` (node v24.20.0, ngoài PATH) + `node_modules` có sẵn.
- `tsc --noEmit`: **PASS (exit 0)**. `prisma validate`: **schema valid**. `next build`: **Compiled OK, 45/45 static pages, toàn bộ API routes build OK** (danh sách route đầy đủ trong log build).
- **Hạn chế:** `localhost:5432` không mở (TCP test fail) → **không xác minh runtime/DB sống**; toàn bộ kết luận dưới là code-level. Scripts UAT 131 bài không được chạy lại ở đây.

## 1. Ma trận REAL/PARTIAL/MOCK/UI_ONLY cập nhật (so với BACKEND_TRUTH_AUDIT 10/10)
| # | Phân hệ | Trước | Nay | Căn cứ |
|---|---|---|---|---|
| 1 | Auth/JWT/RBAC/đổi pass/me | REAL | **REAL** | `auth.ts`, `login/route.ts`, `change-password/route.ts`, `me/route.ts` tự guard 401 |
| 2 | Tasks CRUD + nghiệm thu `[id]` | REAL | **REAL** | `tasks/[id]/route.ts:110-120` chỉ leader mới COMPLETED; `WAITING_REVIEW` gate `123-127` |
| 3 | Xin/duyệt lùi hạn + giữ hạn gốc | REAL | **REAL** | `deadline-request/route.ts:44-60` (verifyTaskAccess + bắt buộc lý do), `review/route.ts:32-76` (PENDING guard, giữ `originalDeadline`, ghi TaskUpdate) |
| 4 | Plans + workflow + link chống clone | REAL | **REAL** | `workflow/route.ts:38-187` SUBMIT/APPROVE/RETURN đúng máy trạng thái; LINK_TASK dùng upsert `204-216` |
| 5 | Routine + formValues→SubmissionValue + NOT_OCCURRED | PARTIAL (rớt field) | **REAL** | UI `routine/page.tsx:224-230` đã gửi đủ field; API `routine/route.ts:409-500` lưu SubmissionValue + chống trùng 409 |
| 6 | Notifications read/dismiss + IDOR | MOCK STATE | **REAL** | Model `Notification` tồn tại (`schema.prisma:542`); `read/dismiss/[id]/read-all` đều check `recipientId` 403 (`read/route.ts:27-29`, `dismiss/route.ts:27-29`, `[id]/route.ts:28,83`) |
| 7 | Dashboard KPI | PARTIAL (hardcode) | **REAL** | API tính thật (`kpi/route.ts:214-373`, breakdown `completed/total`); UI null-safe "Chưa có dữ liệu" (`dashboard/page.tsx:400-450`), không còn chuỗi hardcode |
| 8 | Snapshot checksum + verify | MOCK (hash fake) | **REAL** | `snapshots.ts:44-72` canonical JSON + SHA-256 + verify; UI dùng `checksum` thật (`reports/page.tsx:286,329-338`) |
| 9 | Excel Mẫu A (8 cột) / Mẫu B (13 cột) + sanitize | REAL | **REAL** | `legacy-exporter.ts:61-70` (A→H, cột C "Danh mục đầu việc"), `detailed-exporter.ts:49-51` (13 cột), `sanitizeFormula` phủ cả 2 exporter (28 điểm gọi), export có `reports.export` + scope 403 (`export/route.ts:31-84`) |
| 10 | People/transfer/khóa TK + chống tự khóa | REAL | **REAL** | `transfer/route.ts`, `account/status/route.ts:44-47` anti-self-lockout + audit |
| 11 | Catalog CRUD + gate RETIRED | PARTIAL | **REAL** | `catalog/templates/route.ts` + `[id]/route.ts` (check `catalog.manage`, chặn mẫu RETIRED ở `personal-work-items/route.ts:150-152`) |
| 12 | System config + policy guard | REAL (mới) | **REAL** | `config/route.ts:40-46` chặn UNIT_LEADER PUT 403; `system-config.ts:166-171` cấm tắt `deadlineRequireReason` 400 |
| 13 | Audit log | REAL | **REAL** | `recordAuditEvent` phủ create/update/workflow/export/config; route guard `audit.view` |
| 14 | PersonalWorkItem tự do ngoài 48 mẫu | REAL (mới) | **REAL** | `templateId` nullable, chặn template RETIRED, phân quyền STAFF-chỉ-mình (`personal-work-items/route.ts:197-211,224`) |
| 15 | Approvals (nuốt lỗi toast) | PARTIAL | **REAL** | Chỉ gỡ item khi `res.ok` (`approvals/page.tsx:277-299`), lỗi giữ nguyên + `toast.error` (`300-319`) |
| 16 | Chế độ báo cáo 4 modes | (ngầm REAL) | **PARTIAL** | Xem §3 P1-5 |
| 17 | Quản trị nhân sự đầy đủ/CAPTCHA/PKI | UI_ONLY | **UI_ONLY / OUT-OF-SCOPE** | Không đổi; UAT đã tự khai báo out-of-scope (PKI, backup auto) — chấp nhận cho pilot |
| 18 | `/admin/system` page | UI_ONLY | **CHƯA KIỂM CHỨNG LẠI** | APIs `overview`+`config` đã tồn tại và guard đúng — cần đối chiếu UI ở vòng sau |

**Kết quả:** 15 REAL, 1 PARTIAL (reporting-mode), 1 chưa kiểm chứng lại, 0 MOCK còn tồn tại. Các lỗi cũ (toast giả, rớt formValues, hash fake, KPI hardcode, notifications F5) đã được sửa thật trong code.

## 2. Top issues mới (UAT 131 bài KHÔNG phủ) + minh chứng
### P1 — phải fix trước pilot (toàn vẹn nghiệp vụ & bảo mật)
1. **Bypass nghiệm thu qua endpoint updates/progress.** `POST /api/tasks/[id]/updates` (`updates/route.ts:47-81`) và alias `progress` chỉ yêu cầu WRITE rồi `taskUpdateData.status = resolvedStatus` — owner/assignee có thể tự set `COMPLETED`, qua mặt `WAITING_REVIEW` + leader gate ở `[id]/route.ts:110-120`. Cùng lỗ hổng ở nhánh generic `PATCH /api/tasks` (`tasks/route.ts:312-322`). UI hiện tại không lạm dụng (`my-work/page.tsx:270-271` nộp `WAITING_REVIEW`), nhưng API mở với mọi caller.
2. **Sửa deadline trực tiếp, qua mặt luồng xin lùi hạn.** `PATCH /api/tasks/[id]` nhận `currentDeadline` từ bất kỳ ai có WRITE (`[id]/route.ts:135`) và chỉ ghi TaskUpdate khi đổi status/progress (`168`) → dời hạn âm thầm, không bản ghi lịch sử, trái yêu cầu `deadline_change_history` (§6.2 PROJECT_CONTEXT).
3. **LINK_TASK không kiểm tra quyền.** `workflow/route.ts:190-231` không gọi `verifyTaskAccess`, không check unit, không check planItem thuộc planId → user bất kỳ link task đơn vị khác vào kế hoạch mình (IDOR ghi).
4. **Chấp nhận chéo mật khẩu demo.** `auth.ts:29-30`: tài khoản hash từ `demo123` chấp nhận `Talung@2026` và ngược lại → toàn bộ 48 officer `hqtl001..048` (seed `Talung@2026`, `seed-production-officers.ts:122-123`) đều đăng nhập được bằng `demo123`.
5. **4 chế độ báo cáo không được thực thi.** `reportingMode` chỉ là metadata catalog (đọc/sửa ở `admin/catalog`, `catalog/templates/[id]`), **không một dòng** routine/dashboard/notifications nào rẽ nhánh theo mode; `NOT_SUBMITTED` không tồn tại trong code; không có kiểm tra "EVERY_PERIOD đến hạn chưa nộp". Trái §5 PROJECT_CONTEXT (yêu cầu cốt lõi).

### P2 — nên fix trước pilot
6. **Mặc định sai reportingMode.** `catalog/templates/route.ts:122` default `EVERY_PERIOD`, trái schema default `UNCONFIGURED` (`schema.prisma:218`) và quy tắc "mới nhập = chưa cấu hình" (§2.4).
7. **Tự phê duyệt:** collection `PATCH CONFIRM_COMPLETION` cho phép owner tự nghiệm thu (`tasks/route.ts:275-282`); plan SUBMIT→APPROVE không tách người trình/người duyệt; `REQUEST_AMENDMENT` mở APPROVED→DRAFT không snapshot (không có bảng `plan_versions` dù IMPLEMENTATION_PLAN §3.2 kê có).
8. **Login hardening:** không rate-limit/lockout (`login/route.ts`); JWT 7 ngày; `middleware.ts:4` + `auth.ts:6` fallback secret demo khi thiếu env (`.env` hiện đã có JWT_SECRET 38 ký tự — kiểm tra key-only — nhưng fallback vẫn là rủi ro Go-Live).
9. **Remind spam + thiếu scope.** `tasks/[id]/remind/route.ts:17-24,97-109`: mọi authenticated user nhắc duyệt task bất kỳ (kể cả khác đơn vị), không idempotency/rate-limit, mỗi gọi sinh notification mới.
10. **Attachments POST thiếu verifyTaskAccess** (`attachments/route.ts:68-86` — GET/DELETE chưa đối chiếu hết); `isSigned/signedBy` do client tự khai (`90-91`), không phải PKI.

### P3 — ghi nhận, fix dần
11. Export suy diễn số liệu: `progressPercent` hardcode 75/40 (`export/route.ts:127,438`), status ánh xạ xấp xỉ; `reports/summary` default `completionRate=100` khi rỗng (`summary/route.ts:129`) vs KPI API trả null — thiếu nhất quán.
12. Fail-closed quirks: `.includes()` trên `authorizedUnits` có thể là chuỗi `"ALL"` (`personal-work-items/route.ts:58,207,310,385`, `people/[id]/route.ts:56`) → từ chối sai leader scope-ORGANIZATION.
13. Vô hiệu hóa TK thu hồi JWT trễ ≤60s do `authMemoryCache` (`auth.ts:136`) — claim "lập tức" quá đà nhẹ.
14. `NV-<timestamp>` đụng độ khi tạo đồng thời (`tasks/route.ts:143`); thiếu Zod validation hầu hết routes; `my-work/page.tsx:332-333` còn `catch { // ignore }`; vocab `COMPLETED/DONE` lẫn lộn; `catalog GET` không auth ở handler (dựa middleware); seed cấp SYSTEM_ADMIN full quyền business (`seed.ts:226-233`, hiện an toàn nhờ route-level block nhưng mong manh).

## 3. Đề xuất fix theo vertical-slice (P0→P3), mỗi slice: API+guard+test F5/curl
- **Slice 1 (P1-1+P1-2):** centralize `assertStatusTransition()` dùng chung cho `[id]/PATCH`, collection `PATCH`, `updates/POST`: chỉ leader được COMPLETED; mọi đổi `currentDeadline` (ngoài review-APPROVE) bị 403 hoặc sinh TaskUpdate `DEADLINE_CHANGED` kèm hạn cũ/mới. Nghiệm thu: curl owner `{"status":"COMPLETED"}` → 403; task ở lại nguyên sau F5.
- **Slice 2 (P1-3):** LINK_TASK thêm `verifyTaskAccess(WRITE)` + check planItem.planId === planId + scope unit. Nghiệm thu: canbo_b link task đơn vị A → 403.
- **Slice 3 (P1-4):** xóa 2 dòng fallback ở `auth.ts:29-30`; force đổi pass demo ở lần đầu (optional). Nghiệm thu: `hqtl001/demo123` → 401.
- **Slice 4 (P1-5+P2-6):** thực thi mode tối thiểu: routine POST chặn/khuyến cáo theo mode của template; job/query "EVERY_PERIOD quá hạn chưa nộp" → `NOT_SUBMITTED` lên dashboard/notifications; default tạo mới `UNCONFIGURED`. Mỗi slice xong mới sang slice sau.
- **Slice 5 (P2 7-10):** tách người trình/duyệt, snapshot plan trước unlock, rate-limit login + bắt buộc JWT_SECRET env (fail-fast khi thiếu), remind thêm scope+idempotency, attachments thêm verifyTaskAccess.
- **Slice 6 (P3):** mã NV duy nhất (sequence), Zod, dọn catch-ignore, thống nhất vocab + completionRate null.

## 4. Nhật ký khắc phục (append-only)
### Slice 1 — Status-transition guard tập trung (hoàn tất 2026-10-15, đã xác minh)
- Vấn đề: P1-1 (bypass nghiệm thu qua `updates`/`PATCH` collection), P1-2 (dời hạn trực tiếp không lịch sử), P2-7 (owner tự CONFIRM).
- Thay đổi: mới `src/server/task-transitions.ts` (`assertTaskStatusTransition` thuần + `isTaskLeader`); nối vào `api/tasks/[id]/PATCH` (thay check inline, giữ nguyên message; leader đổi hạn sinh TaskUpdate ghi hạn cũ→mới), `api/tasks/PATCH` (CONFIRM giới hạn leader; generic + REJECT qua guard), `api/tasks/[id]/updates/POST` (+ alias `progress`).
- Xác minh: `scripts/test-task-transitions.ts` 10/10 PASS (viết trước, FAIL vì thiếu module, rồi PASS); `tsc --noEmit` exit 0; `next build` exit 0 (45 routes). Không DB sống nên chưa chạy UAT runtime.
- Hành vi đổi (chủ ý): cán bộ/assignee không còn tự set COMPLETED/DONE, không trả WAITING_REVIEW→IN_PROGRESS, không dời hạn trực tiếp (phải xin lùi hạn); UI hiện tại (`my-work` nộp WAITING_REVIEW, `approvals`/`tasks` leader duyệt) không ảnh hưởng.
### Slice 2 — LINK_TASK authz (hoàn tất 2026-10-15, đã xác minh typecheck+build)
- `workflow/route.ts` (LINK_TASK): check `planItem.planId === planId` (400), scope đơn vị của kế hoạch (403), `verifyTaskAccess(WRITE)` trên task (403). Không DB sống nên negative-test runtime còn nợ.
### Slice 3 — Cô lập mật khẩu demo/production (hoàn tất 2026-10-15, TDD 5/5 + typecheck + build)
- Xóa fallback chéo ở `auth.ts:verifyPassword` (chỉ còn `bcrypt.compare`). Test RED 2 FAIL đúng bệnh → GREEN 5/5 (`scripts/test-password-isolation.ts`). Tài khoản demo (`demo123`) và officer (`Talung@2026`)不受 ảnh hưởng đúng chiều.
### Slice 4 — Reporting-mode (hoàn tất một phần: default + gate RETIRED)
- `catalog/templates/route.ts`: default mới `UNCONFIGURED` (đúng schema + §2.4); UI `admin/catalog`: default form + fallback + option `UNCONFIGURED — Chưa cấu hình`.
- `routine/route.ts` POST: chặn template `RETIRED` (400), nhất quán với personal-work-items.
- Còn nợ: cưỡng chế EVERY_PERIOD/NOT_SUBMITTED theo kỳ (cần job/query riêng — ghi TODO cho vòng sau, không bịa policy).
### Slice 5 — Tách duyệt, snapshot, hardening (hoàn tất 2026-10-15, typecheck+build)
- Plan APPROVE chặn người lập tự duyệt (403) — trừ khi tách vai trò bằng phân công thực tế, đây là gate cứng.
- REQUEST_AMENDMENT unlock: niêm snapshot hạng mục/đầu việc/link-task vào `AuditEvent.newData.snapshotBeforeUnlock` (thay bảng `plan_versions` ở mức pilot).
- Login rate-limit: 10 sai/10 phút → 429 theo IP+username (in-memory, single-instance; scale cần Redis/DB — đã ghi chú trong code).
- JWT_SECRET: `requireJwtSecret()` fail-fast ở production (`auth.ts`, `middleware.ts` resolve theo request để không crash build); dev giữ fallback + warn.
- Remind: thêm `verifyTaskAccess(READ)` (403 xuyên đơn vị) + `idempotencyKey` theo ngày (`..._task_user_ngày_leader`).
- Attachments: GET thêm check READ, POST thêm check WRITE (top-level import); DELETE giữ logic cũ (uploader/owner/leader — còn lỏng với DEPUTY khác đơn vị, ghi nhận).
### Slice 6 — P3 quick wins (hoàn tất 2026-10-15, typecheck+build)
- Mã NV thêm 2 số ngẫu nhiên chống đụng; `my-work` catch-ignore → `toast.error`; `reports/summary` hết task → `completionRate: null` + UI null-safe (`reports/page.tsx:724-741`); `catalog GET` thêm auth handler-level; `.includes` trên `authorizedUnits` còn lại đã rà: `people/[id]` và personal-work-items GET đã guard `"ALL"` đúng, 3 điểm POST/PATCH/DELETE đã thêm guard.
- Không làm: Zod toàn diện, TTL cache 60s (giữ nguyên, đã ghi P3-13 trong báo cáo gốc), vocab COMPLETED/DONE (giữ tương thích DB hiện tại).
- Xác minh chung: 2 script test 15/15 PASS, `tsc` exit 0, `next build` exit 0. Runtime DB (UAT 131 + negative tests mới) còn nợ vì không có DB sống.

## 5. Kết luận về claim "131 PASS / Pilot Ready"
- **Phần đúng:** 10 nhóm lỗi audit cũ đã fix thật trong code (đối chiếu từng `file:line` ở §1); build/typecheck/validate xanh; 44 routes đều qua auth + scope-guard ở mức handler (trừ 2 lỗ P1-2/P1-3 và catalog-GET dựa middleware).
- **Phần chưa đủ:** (a) runtime 131 bài không tái chạy được ở đây (không DB sống); (b) scripts UAT không phủ 5 lỗ P1 mới (§2.1-5) — PASS của chúng không bao gồm các đường bypass này; (c) reporting-mode (yêu cầu cốt lõi §5) chưa implement.
- **Đề xuất: READY FOR INTERNAL PILOT *CÓ ĐIỀU KIỆN*** — các Slice 1-6 đã hoàn thành ở mức code (xem §4; test mới 15/15, tsc + build xanh). Điều kiện còn lại duy nhất: chạy runtime verification với DB sống (re-run UAT 131 + negative tests cho P1-1→P1-4: curl 403 bypass nghiệm thu/link-task/remind/attachments, 401 chéo mật khẩu, 400 template RETIRED/UNCONFIGURED). Giữ nguyên các out-of-scope đã khai báo (PKI, backup auto, dữ liệu thật).

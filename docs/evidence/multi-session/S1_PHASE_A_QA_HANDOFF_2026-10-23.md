# S1 — PHASE A QA — BÀN GIAO S0

**Ngày:** 23/10/2026
**Phạm vi:** YC-03 / YC-04 / YC-05 — Lập kế hoạch, hạng mục, đầu việc; QA trước release
**Trạng thái:** QA hoàn tất trên fixture cách ly; **chưa merge, chưa release Production**

```text
SESSION: S1 — Phase A QA
YC: YC-03/04/05
BRANCH: codex/v3-phase-a-qa
BASE_SHA: a68d31e (code Phase A) + 6cacc50 (docs/start signal)
COMMIT_SHA: 61577c0 (QA code/evidence) + HEAD nhánh (báo cáo này)
WORKTREE: D:\thanhnx\OpenCode\talung-phase-a-qa
DB: talung_v3_phase_a_qa (localhost:5432) — test only
PORT: 3111
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: YES — kèm điều kiện mục 10
READY_FOR_RELEASE: NO — cần S0 merge, audit/backup Production, UAT chủ dự án và lệnh release riêng
```

---

## 1. Kết luận điều hành

Phase A **đã vượt qua QA kỹ thuật trên fixture cách ly**:

- 12 bộ kiểm thử, **313/313 kiểm tra PASS**, gồm cả hai bộ từng bị chặn là `test-yc23-25-api.ts` và `test-v3-evidence-adjustment.ts`.
- UAT Desktop/Mobile **12/12 PASS** trên luồng tạo kế hoạch → thêm/sửa đầu việc → trình duyệt → trả lại → sửa → trình lại → phê duyệt.
- Migration A rehearsal **14/14 PASS** trên bản sao schema/dữ liệu, có backup idempotency key, kiểm tra rollback và chạy lại.
- `tsc --noEmit`, `prisma validate`, `next build` đều PASS.
- Storage vẫn **fail-closed**: khi `NODE_ENV=production` + `STORAGE_DRIVER=local` nhưng thiếu `ALLOW_LOCAL_EVIDENCE`, kho minh chứng từ chối cấu hình; chỉ mở bằng cờ test riêng trên thư mục local cách ly.

**Phát hiện chặn release quan trọng:** không được dùng `prisma migrate deploy` hoặc `prisma db push` đơn thuần cho migration A trên Production. Chi tiết và đường đi an toàn ở mục 5. Đây là lý do `READY_FOR_RELEASE: NO` dù QA PASS.

---

## 2. Kết quả kiểm thử

DB dùng cho toàn bộ test ghi: `talung_v3_phase_a_qa`; server `http://localhost:3111`; tài khoản fixture `democb01`, `democb02`, `demold01`, `demolda01`, `demoldb01` (mật khẩu test cục bộ, không commit).

| Bộ kiểm thử | Kết quả | Ghi chú |
|---|---:|---|
| `scripts/test-v3-phase-a-planning.ts` | **37/37 PASS** | Tạo/chọn kế hoạch, hạng mục, completedDate:null, idempotency, khóa SUBMITTED, trả lại, tự duyệt, phê duyệt |
| `scripts/test-v3-multi-product.ts` | **36/36 PASS** | Nhiều sản phẩm QĐ1277, xác nhận từng SP, khóa sau nghiệm thu |
| `scripts/test-v3-no-self-approval.ts` | **5/5 PASS** | Chống tự duyệt cả luồng V3 và nhiệm vụ cũ |
| `scripts/test-v3-review-flow.ts` | **38/38 PASS** | Cán bộ → lãnh đạo trực tiếp, trả lại, gửi lại, xác nhận |
| `scripts/test-v3-permissions.ts` | **24/24 PASS** | 401/403/409, cấp/thu hồi quyền, audit |
| `scripts/test-v3-e2e-flow.ts` | **40/40 PASS** | End-to-end V3, TX/QĐ1277, lịch sử, kết quả tháng |
| `scripts/test-v3-f01-f05.ts` | **22/22 PASS** | F01 luồng hoàn thành + F05 tương phản nút |
| `scripts/test-v3-f18-routine.ts` | **26/26 PASS** | Nhật ký tác nghiệp, TX/SP, liên thông |
| `scripts/test-v3-private-attachments.ts` | **14/14 PASS** | Kho tệp private, 401/403/404, audit, chống IDOR |
| `scripts/test-yc23-25-api.ts` | **38/38 PASS** | **Gate 1 đã xử lý** — fixture trưởng bộ phận riêng + cập nhật 2 kỳ vọng theo YC-31 |
| `scripts/test-v3-evidence-adjustment.ts` | **21/21 PASS** | **Gate 2 đã xử lý** — kho local riêng, fail-closed giữ nguyên |
| `scripts/uat-phase-a-desktop-mobile.ts` | **12/12 PASS** | UAT Desktop + Mobile 390×844 |
| **Tổng** | **313/313 PASS** | Chưa gồm 14 kiểm tra rehearsal migration |

### Kiểm tra tĩnh / build

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx prisma validate` | PASS |
| `npm run build` (Next.js 15.5.27, 98 trang) | PASS |
| `prisma migrate diff` sau rehearsal | Empty migration — schema khớp `prisma/schema.prisma` |
| Fail-closed Storage (production + local + thiếu cờ) | PASS — từ chối cấu hình, route sẽ trả 503 |
| Kiểm tra DB test local trước khi ghi | PASS — guard `scripts/lib/test-db-safety.ts` |

### Hai bộ từng bị chặn — cách xử lý, không hạ bảo mật

1. **`test-yc23-25-api.ts`**
   - Nguyên nhân cũ: cần mật khẩu `cb001/cb002` và file `demo-ops/demo-secrets.json`; fixture worktree không có.
   - Cách xử lý: thêm fixture riêng `demolda01` / `demoldb01` (DEPARTMENT_LEADER phạm vi A/B, chỉ trên DB test), cho phép cấu hình username/password qua biến môi trường. **Không đổi mật khẩu tài khoản cán bộ thật, không cấp thêm quyền cho tài khoản thật.**
   - 2 kỳ vọng được cập nhật theo hành vi YC-31: bộ phận A đã chuyển sang Danh mục TX nên mẫu cũ (48 mẫu) bị chặn 403 thay vì tạo được/400. Test kiểm tra trạng thái thật từ `/api/work-catalog` trước khi chọn kỳ vọng, không hard-code PASS.
   - Kết quả: **38/38 PASS**.
2. **`test-v3-evidence-adjustment.ts`**
   - Nguyên nhân cũ: `next start` đặt `NODE_ENV=production`; `STORAGE_DRIVER=local` bị chặn cho minh chứng nếu thiếu cờ test → 503.
   - Cách xử lý: chạy server test với `ALLOW_LOCAL_EVIDENCE=1` và `LOCAL_STORAGE_DIR=.local-storage-qa-evidence` (thư mục local, đã gitignore). Đây là cờ dành riêng cho test; Production vẫn fail-closed.
   - Đã kiểm tra ngược: bỏ cờ → `ensureEvidenceStorageReady()` ném lỗi cấu hình.
   - Kết quả: **21/21 PASS**.

### Ghi chú vận hành test

- `test-v3-private-attachments.ts` cần `LOCAL_STORAGE_DIR` **trùng với server**; nếu không, file fixture ghi một nơi nhưng route đọc nơi khác → 404. Đây là lỗi cấu hình test, không phải lỗi nghiệp vụ. Đã chạy lại với cùng thư mục: 14/14 PASS.
- Các bộ test Phase A trước đây hard-code `createRequire("D:/.../talung-cus-work/package.json")`; đã đổi sang `createRequire(import.meta.url)` để dùng đúng Prisma Client của worktree, tránh lẫn schema giữa các session.
- Thêm guard `scripts/lib/test-db-safety.ts`: chỉ cho phép DB localhost tên `talung_v3_*`; chặn chạy nhầm test ghi lên DB khác.

---

## 3. UAT Desktop / Mobile

Script: `scripts/uat-phase-a-desktop-mobile.ts` — **12/12 PASS**.

| Bước | Kết quả |
|---|---|
| Desktop 1440×900: tạo kế hoạch DRAFT cho Bộ phận Nghiệp vụ A + hạng mục đầu tiên | PASS |
| Thêm đầu việc đúng hạng mục/kỳ/người phụ trách `DEMO-CB-01` | PASS |
| Sửa đầu việc trên Desktop | PASS |
| Trình duyệt kế hoạch; UI chặn tự phê duyệt | PASS |
| Trưởng bộ phận A (`demolda01`) trả lại kèm lý do | PASS |
| Sửa đầu việc sau trả lại; trình lại | PASS |
| Trưởng bộ phận A phê duyệt | PASS |
| Mobile 390×844: chọn kế hoạch, không tràn ngang (`scrollWidth=390`) | PASS |
| Mobile: hộp thoại thêm đầu việc nằm trong khung | PASS |
| Mobile: thêm đầu việc và lưu thành công | PASS |

Ảnh bằng chứng (đã commit):

```text
docs/evidence/phase-a-qa/01-desktop-plan-created.png
docs/evidence/phase-a-qa/02-desktop-work-item-added.png
docs/evidence/phase-a-qa/03-desktop-work-item-edited.png
docs/evidence/phase-a-qa/04-desktop-submitted-self-approval-blocked.png
docs/evidence/phase-a-qa/05-desktop-approver-actions.png
docs/evidence/phase-a-qa/06-desktop-returned.png
docs/evidence/phase-a-qa/07-desktop-approved.png
docs/evidence/phase-a-qa/08-mobile-plan.png
docs/evidence/phase-a-qa/09-mobile-add-work-item.png
docs/evidence/phase-a-qa/10-mobile-work-item-added.png
```

Lưu ý: ảnh phải chờ `document.fonts.ready` trước khi đo/chụp; nếu font Material Symbols chưa tải, ligature chữ sẽ làm sai phép đo tràn ngang.

---

## 4. Migration rehearsal

Script: `scripts/rehearse-phase-a-migration.ts` — **14/14 PASS**.
Tóm tắt có thể commit: `docs/evidence/phase-a-qa/migration-rehearsal-summary.json`.

- Nguồn: `talung_v3_phase_a_qa`; bản sao: `talung_v3_phase_a_qa_rehearsal` (localhost, test).
- Migration: `prisma/migrations/20261023120000_v3_phase_a_planning/migration.sql`, SHA256 `BF93CA6E…2062A83`.
- Đã bỏ unique index trên bản sao để mô phỏng schema trước Phase A; tạo cặp idempotency key trùng; backup 6 khóa trước khi NULL hóa.
- Kết quả:
  - 63 dòng trước/sau migration và sau rollback; checksum toàn bộ nội dung (trừ `idempotency_key`) không đổi.
  - Bản ghi cũ hơn bị đặt `idempotency_key = NULL`; bản mới nhất giữ khóa.
  - Unique index hợp lệ; ghi trùng bị chặn `23505`.
  - Rollback (DROP INDEX) giữ nguyên dữ liệu; khóa đã NULL không tự khôi phục — đúng tài liệu.
  - Áp migration lần 2 thành công nhờ `CREATE UNIQUE INDEX IF NOT EXISTS`.
- Không xóa bản ghi nghiệp vụ; không chạy DDL trên Production.

### Thay đổi migration A trong nhánh QA

`CREATE UNIQUE INDEX` → `CREATE UNIQUE INDEX IF NOT EXISTS`, kèm ghi chú quy trình phát hành. Không đổi ngữ nghĩa dữ liệu; giúp migration an toàn khi index đã được tạo bởi `db push` hoặc khi release retry sau lỗi giữa chừng.

---

## 5. Phát hiện chặn release: đường đi migration Production

Đã diễn tập trên bản sao (không phải Production):

| Cách làm | Kết quả | Kết luận |
|---|---|---|
| `prisma migrate deploy` trên schema non-empty, không có `_prisma_migrations` | **P3005 — database schema is not empty** | **Không dùng được** nếu chưa baseline. Không chạy trên Production. |
| `prisma db push` khi còn khóa trùng | Yêu cầu `--accept-data-loss` | Không chấp nhận cờ phá dữ liệu cho release |
| `prisma db push --accept-data-loss` khi còn khóa trùng | **P2002 — unique constraint failed** | Vẫn fail; không xử lý được khóa trùng |
| Chạy `migration.sql` thủ công sau audit/backup/dọn khóa trùng | PASS | **Đường an toàn** |
| `prisma db push` sau khi chạy migration SQL | “Database is already in sync” | Xác nhận schema khớp |

**Đề nghị cho S0 / chủ dự án trước release:**

1. Chạy `scripts/phase-a-idempotency-audit.ts` read-only trên Production khi được cấp quyền; lưu backup khóa và SHA256.
2. Nếu có khóa trùng: backup, rồi chạy phần UPDATE dọn khóa cũ hơn (migration SQL) trước khi tạo unique index.
3. Áp `migration.sql` (đã có `IF NOT EXISTS`) trên bản sao gần nhất; xác nhận checksum dữ liệu, index, rollback.
4. **Không** dùng `prisma migrate deploy`; **không** dùng `db push --accept-data-loss` để xử lý khóa trùng.
5. Chỉ sau đó mới merge/release theo lệnh riêng.

> S1 **không có quyền read-only tới Production** trong worktree này. Không có credential Production trong `.env`/`.env.local`; không tự tìm hoặc dùng credential ngoài phạm vi. Vì vậy chưa xác minh được schema/dữ liệu Production hiện tại; đây là việc của S0/ops trước release.

---

## 6. Kiểm tra bảo mật / toàn vẹn

- Không sửa `src/server/approval-case.ts`, `task-transitions.ts`, route approval dùng chung hoặc schema ngoài A.
- Không đổi mật khẩu, quyền, tuyến phê duyệt của tài khoản thật.
- Fixture `demolda01/demoldb01` chỉ tạo trên DB test; không tạo `PersonSupervision`, không ảnh hưởng tuyến xác nhận công việc.
- Chống tự duyệt: 5/5 PASS; UI hiển thị “Không thể tự phê duyệt” đúng.
- `SUBMITTED` khóa nội dung; trả lại mở khóa; phê duyệt bởi người khác hoạt động.
- Storage: fail-closed được kiểm tra ngược; không mở bucket/không dùng kho Production.
- DB guard chặn test ghi ngoài `talung_v3_*` localhost.
- Không commit secret, `.env`, `demo-ops`, dữ liệu cá nhân; ảnh UAT chỉ dùng tài khoản DEMO.

---

## 7. File thay đổi

**Migration / test safety**
- `prisma/migrations/20261023120000_v3_phase_a_planning/migration.sql`
- `scripts/lib/test-db-safety.ts`
- `.gitignore` (ignore `.local-storage-*/`)

**Test harness / QA scripts**
- `scripts/test-v3-e2e-flow.ts`
- `scripts/test-v3-evidence-adjustment.ts`
- `scripts/test-v3-f01-f05.ts`
- `scripts/test-v3-f18-routine.ts`
- `scripts/test-v3-multi-product.ts`
- `scripts/test-v3-no-self-approval.ts`
- `scripts/test-v3-permissions.ts`
- `scripts/test-v3-phase-a-planning.ts`
- `scripts/test-v3-private-attachments.ts`
- `scripts/test-v3-review-flow.ts`
- `scripts/test-yc23-25-api.ts`
- `scripts/phase-a-idempotency-audit.ts` (mới)
- `scripts/rehearse-phase-a-migration.ts` (mới)
- `scripts/setup-phase-a-qa-fixtures.ts` (mới)
- `scripts/uat-phase-a-desktop-mobile.ts` (mới)

**Bằng chứng**
- `docs/evidence/phase-a-qa/*.png`
- `docs/evidence/phase-a-qa/migration-rehearsal-summary.json`

Không thay đổi mã nghiệp vụ Phase A (`src/app/api/plans`, `personal-work-items`, `work-item-products`) trong đợt QA này.

---

## 8. Test chưa chạy / lý do

| Hạng mục | Lý do | Tác động |
|---|---|---|
| `scripts/test-yc23-25-ui.ts` | Script cũ hard-code DB `localhost:54329`, tài khoản `cb001`, guard riêng; không còn phù hợp fixture S1 | Đã thay bằng UAT Phase A Desktop/Mobile chạy trên fixture 3111; API YC-23/25 đã 38/38 |
| Read-only Production schema | Không có credential/quyền trong S1 | Chưa xác minh Production; S0/ops phải làm trước release |
| UAT với tài khoản/cơ cấu thật | Chỉ dùng tài khoản DEMO trên DB test | Cần chủ dự án UAT trên Preview/Staging trước release |
| `test-yc23-25-api` nhánh “mẫu cũ còn chọn được” | Fixture A đã chuyển TX nên nhánh này không chạy; test kiểm tra nhánh chặn 403 | Không giảm coverage; nhánh legacy chỉ áp dụng bộ phận chưa chuyển TX |

---

## 9. Quyết định còn chờ

- **D1** — có Plan scope cá nhân độc lập không; vẫn PENDING, không thêm scope/role.
- **D6** — cơ chế lãnh đạo giao Task cho cán bộ; không suy từ filter “Toàn đơn vị”.
- **D8/D9** — ngữ nghĩa cột C và ranh giới `Task`/`PersonalWorkItem`; không đổi.
- **Release method migration A** — cần S0/chủ dự án phê duyệt đường chạy SQL thủ công + backup; không dùng `migrate deploy`/`db push --accept-data-loss`.
- **Production audit idempotency key** — chưa thực hiện do thiếu quyền read-only.
- UAT chủ dự án trên dữ liệu/vai trò thật vẫn là điều kiện release.

---

## 10. Điều kiện S0 tích hợp / release

**Được phép tích hợp vào nhánh integration ngay khi S0 review:**

- [ ] Diff chỉ gồm test harness, migration A, tài liệu/ảnh bằng chứng; không có app code Phase A thay đổi.
- [ ] Chạy lại `tsc`, `prisma validate`, `build` trên nhánh integration sau merge.
- [ ] Chạy lại tối thiểu: Phase A planning 37, multi-product 36, no-self 5, yc23-25 38, evidence-adjustment 21.
- [ ] Xác nhận `PRODUCTION_TOUCHED: NO`.

**Chặn release Production cho tới khi:**

- [ ] S0/ops được cấp quyền read-only Production và chạy audit/backup idempotency key.
- [ ] Rehearsal migration trên bản sao gần Production nhất (schema + dữ liệu) PASS.
- [ ] Có rollback plan đã diễn tập; backup trước migration.
- [ ] UAT chủ dự án trên Preview/Staging với vai trò thật giả lập.
- [ ] Có lệnh release riêng; không dùng `migrate deploy`/`db push --accept-data-loss`.

---

## 11. Mẫu handoff mục 7 (trạng thái cuối)

```text
SESSION: S1
YC: YC-03/04/05
BRANCH: codex/v3-phase-a-qa
BASE_SHA: a68d31e (code) / 6cacc50 (docs)
COMMIT_SHA: 61577c0 (QA code) + HEAD (handoff docs)
FILES_CHANGED: 12 test scripts; migration A; .gitignore; 4 QA scripts mới; 1 test-db guard; 10 ảnh UAT + 1 JSON rehearsal
SCHEMA_OR_MIGRATION: migration A thêm IF NOT EXISTS + ghi chú release; không đổi schema
TESTS_PASS: 12 bộ / 313 kiểm tra PASS; migration rehearsal 14/14; tsc/prisma validate/build PASS
TESTS_NOT_RUN: test-yc23-25-ui.ts (script cũ, thay bằng UAT); Production read-only schema; UAT chủ dự án
UI_EVIDENCE: docs/evidence/phase-a-qa/01..10
SECURITY_CHECKS: no-self 5/5; permissions 24/24; storage fail-closed; DB guard; không sửa approval service
DECISIONS_PENDING: D1/D6/D8/D9; phương án migration Production; audit key Production
CONFLICT_EXPECTED: Không với S4 (không sửa approval service); có thể chạm test harness dùng chung nếu session khác sửa cùng script
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: YES — sau review diff và chạy lại regression trên integration
READY_FOR_RELEASE: NO — chờ audit/backup Production, rehearsal gần Production, UAT chủ dự án, lệnh release riêng
```

---

## 12. Ghi chú cho S0

- Nhánh QA dựa trên `a68d31e` + docs `6cacc50`; không merge `main`, không push `main`.
- Không sửa `src/server/approval-case.ts`, `task-transitions.ts` hay route approval dùng chung.
- Nếu S0 muốn giữ migration A nguyên bản không dùng `IF NOT EXISTS`, cần thay bằng quy trình kiểm tra index tồn tại trước khi chạy; nhưng khi đó migration không idempotent và không an toàn với DB đã `db push`.
- Các file `demo-ops/qa-migration/*` và `.local-storage-qa-evidence/*` là local, đã gitignore; không đưa lên Git.
- DB rehearsal `talung_v3_phase_a_qa_rehearsal` được giữ lại trên localhost để S0 kiểm tra; có thể drop sau khi review.

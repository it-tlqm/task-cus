# S1 — PHASE A RELEASE READINESS CHECKLIST

**Ngày lập:** 23/10/2026 (17:56 ICT)
**Người lập:** S1 — Phase A QA
**Phạm vi:** YC-03 / YC-04 / YC-05 — Phase A
**Trạng thái tài liệu:** **CHECKLIST + READINESS ASSESSMENT** — không phải lệnh deploy
**Nhánh:** `codex/v3-phase-a-qa`
**Worktree:** `D:\thanhnx\OpenCode\talung-phase-a-qa`
**DB kiểm thử:** `talung_v3_phase_a_qa` (localhost:5432) · **Port:** 3111

> Tài liệu này chuẩn bị các gate còn thiếu trước release. **Không chạy migration/ghi dữ liệu/deploy Production.** Khi S0 báo S2/S3/S6 đã merge xong và cấp release candidate SHA, S1 mới chạy final regression theo mục 7.

---

## 0. TRẠNG THÁI HIỆN TẠI

| Gate | Trạng thái | Bằng chứng / ghi chú |
|---|---|---|
| Phase A QA đã merge vào integration | **PASS** | Merge `06c5d19`; S1 head `3708672`; S0 rerun Phase A 37/37 |
| S1 regression trên fixture (báo cáo trước) | **PASS** | 313/313 kiểm tra; migration rehearsal 14/14 |
| Integration head tại thời điểm lập | **OBSERVED** | `d01001f` — chưa phải release candidate |
| S2 merge | **PENDING / BLOCKED** | `BLOCKED_BY_CONTRACT_ALIGNMENT` (Q9, Q11/YC-02) |
| S3 merge đầy đủ | **PENDING/PARTIAL** | Helper/target UI mock đã merge; target-only chờ S2 schema |
| S6 merge implementation | **PENDING** | Mới merge plan/spec; implementation chờ S4 |
| Release candidate SHA | **NOT FROZEN** | Chờ S0 chốt sau khi S2/S3/S6 xong |
| Production DB read-only / schema audit | **BLOCKED_BY_PRODUCTION_ACCESS** | Không có credential/quyền read-only DB trong S1 worktree |
| Production public health read-only | **PASS (quan sát)** | 23/10/2026 10:56Z: `status=ok`, `db=up`, `commit=4c7eb52`, `env=production` |
| Migration rehearsal trên snapshot gần Production | **BLOCKED_BY_PRODUCTION_ACCESS** | Chưa có snapshot/clone từ Production; chưa được cấp quyền |
| Rollback drill trên bản sao fixture | **PASS** | Nằm trong 14/14 rehearsal: DROP INDEX giữ nguyên 63 dòng/nội dung |
| UAT Desktop/Mobile trên fixture | **PASS** | 12/12; ảnh `docs/evidence/phase-a-qa/01..10` |
| UAT chủ dự án trên Preview/Staging | **PENDING** | Cần tài khoản vai trò thật giả lập + chữ ký chủ dự án |
| Final regression trên release candidate | **NOT STARTED** | Theo yêu cầu: chờ S0 báo S2/S3/S6 merge xong |
| Post-deploy smoke | **PENDING** | Chỉ chạy sau khi có lệnh deploy riêng |
| **Release Production** | **NO** | Chưa có lệnh release; còn blocker migration + UAT + final regression |

### 0.1. Production access hiện tại

- `.env` và `.env.local` của S1 chỉ trỏ `localhost:5432` / `talung_v3_phase_a_qa`.
- Không có biến `PROD*`, `READONLY*` hoặc URL DB Production trong môi trường S1.
- Không có Supabase/MCP resource được cấu hình để đọc schema Production.
- **Kết luận: `BLOCKED_BY_PRODUCTION_ACCESS`** cho audit DB/schema, backup và snapshot rehearsal.
- Đã kiểm tra **public health** read-only; đây không thay thế kiểm tra schema/dữ liệu.
- Không tự tìm, sao chép hoặc dùng credential Production ngoài phạm vi được cấp.

### 0.2. Vì sao chưa chạy final regression

Theo yêu cầu điều phối: chờ S0 xác nhận S2/S3/S6 đã merge xong và chốt release candidate SHA. Chạy regression bây giờ sẽ kiểm tra một integration head còn thay đổi, không có giá trị chứng nhận release.

---

## 1. GATE A — CHỐT RELEASE CANDIDATE

> Owner: S0. S1 chỉ kiểm tra và ghi nhận.

- [ ] S0 xác nhận S2 đã merge (hết `BLOCKED_BY_CONTRACT_ALIGNMENT`).
- [ ] S0 xác nhận S3 đã merge đầy đủ sau S2 schema (không còn target-only).
- [ ] S0 xác nhận S6 đã merge phần implementation theo quyết định đã duyệt (nếu thuộc release này).
- [ ] S0 chốt **một SHA release candidate** trên `codex/v3-integration-yc01-13`.
- [ ] Không còn commit/merge đang chờ trong cửa sổ release.
- [ ] Working tree integration sạch; không có file dirty/untracked ngoài phạm vi.
- [ ] Ghi `RC_SHA`, thời điểm chốt, người chốt vào bảng sign-off mục 9.
- [ ] Đóng băng nhánh RC trong suốt regression + UAT + deploy; mọi thay đổi phải quay lại gate.

**Trạng thái hiện tại:** `NOT_READY` — integration `d01001f`; S2 blocked, S3 partial, S6 plan.

---

## 2. GATE B — MIGRATION AUDIT + BACKUP PRODUCTION

> Owner: S0/ops. S1 chỉ chạy khi được cấp quyền read-only và lệnh bằng văn bản.
> **Không chạy `prisma migrate deploy`; không chạy `db push --accept-data-loss`.**

### 2.1. Xác minh lịch sử migration

- [ ] Kết nối **read-only** tới Production bằng credential do S0/ops cấp.
- [ ] Chạy `select to_regclass('public._prisma_migrations');`
- [ ] Kỳ vọng: `NULL` (Production dựng bằng `db push`). Nếu khác, dừng và lập phương án baseline riêng.
- [ ] Xác nhận phiên bản schema hiện tại bằng fingerprint/`prisma migrate diff` read-only.
- [ ] Ghi lại `current_database()`, host, thời điểm, người thực hiện — **không ghi mật khẩu**.

### 2.2. Audit idempotency key trước migration

- [ ] Chạy read-only: `scripts/phase-a-idempotency-audit.ts` với URL read-only (đặt `PHASE_A_AUDIT_CONFIRM=1` khi không phải localhost; script chỉ đọc và ghi backup ra local).
- [ ] Ghi: tổng `personal_work_items`, số có `idempotency_key`, số cặp phân biệt, số nhóm trùng.
- [ ] Xuất backup JSON các khóa ra thư mục kiểm soát (không commit); ghi SHA-256, thời điểm, người thực hiện.
- [ ] Nếu có nhóm trùng: xác định bản giữ lại (mới nhất) và bản sẽ NULL hóa; đối chiếu với migration SQL.
- [ ] Không sửa trực tiếp Production trong bước audit.

**Kết quả fixture tham khảo:** 63 đầu việc; 4 khóa; 0 nhóm trùng; backup SHA256 `ceb503ee…63ee7f` (chỉ là fixture, không phải Production).

### 2.3. Backup toàn bộ trước DDL

- [ ] Dùng công cụ được S0/ops phê duyệt (`pg_dump` custom format hoặc `scripts/pg-backup-restore.mjs backup`).
- [ ] Lưu backup ngoài repo, vị trí kiểm soát; ghi kích thước + SHA-256 + thời điểm.
- [ ] Restore thử backup vào database clone **không phải Production**.
- [ ] Đối chiếu số bảng, số dòng các bảng chính, FK; ghi `restore_mismatches = 0`.
- [ ] Không xóa backup cũ; không restore đè Production khi chưa có phê duyệt riêng.

### 2.4. Preflight schema/data

- [ ] `personal_work_items` hiện có bao nhiêu dòng; có cột `idempotency_key` chưa.
- [ ] Unique index `personal_work_items_person_idempotency_key` đã tồn tại chưa (kỳ vọng: chưa, trước Phase A).
- [ ] Các bảng/cột Phase A khác có drift ngoài phạm vi không; ghi rõ drift cũ **không sửa**.
- [ ] Chụp baseline counts cho các bảng liên quan: plans, plan_items, personal_work_items, work_item_products, approval_cases/decisions, audit_events.
- [ ] Lưu baseline vào biên bản release.

### 2.5. Đường áp migration an toàn

Đã diễn tập trên bản sao (không phải Production):

| Cách | Kết quả | Quyết định |
|---|---|---|
| `prisma migrate deploy` | **P3005** — schema non-empty | **KHÔNG DÙNG** |
| `prisma db push` khi còn khóa trùng | Đòi `--accept-data-loss` | **KHÔNG DÙNG** |
| `prisma db push --accept-data-loss` khi còn khóa trùng | **P2002** | **KHÔNG DÙNG** |
| Chạy `migration.sql` thủ công sau audit/backup | PASS trên fixture | **Đường đề xuất** |
| `prisma db push` sau migration SQL | “Already in sync” | Dùng để xác nhận, không thay migration |

- [ ] S0/ops phê duyệt chạy `prisma/migrations/20261023120000_v3_phase_a_planning/migration.sql` thủ công.
- [ ] Migration có `CREATE UNIQUE INDEX IF NOT EXISTS`; không có DROP/TRUNCATE.
- [ ] Chạy đúng thứ tự: backup → audit → dọn khóa trùng → tạo unique index → xác minh.
- [ ] Không chạy migration trong transaction tự động nếu công cụ không hỗ trợ; theo runbook ops.
- [ ] Ghi lại statement/số dòng cập nhật/NULL hóa, thời gian, người thực hiện.

**Trạng thái:** `BLOCKED_BY_PRODUCTION_ACCESS` — chưa có URL read-only/backup Production.

---

## 3. GATE C — REHEARSAL TRÊN SNAPSHOT GẦN PRODUCTION

> Owner: S1 thực hiện trên bản sao; S0/ops cấp snapshot. Không kết nối ghi Production.

### 3.1. Chuẩn bị snapshot

- [ ] S0/ops cấp dump/snapshot gần Production nhất (schema + dữ liệu), đã khử credential.
- [ ] Restore snapshot vào DB local có tên `talung_v3_phase_a_qa_relsnap` (hoặc tên test được duyệt).
- [ ] Xác nhận `current_database()` đúng DB local; không phải Production.
- [ ] Ghi thời điểm snapshot, SHA-256 dump, số bảng/dòng chính.
- [ ] Không commit dump/snapshot vào Git.

### 3.2. Chạy rehearsal

- [ ] Chạy audit khóa trên snapshot.
- [ ] Chạy `scripts/rehearse-phase-a-migration.ts` với `ALLOW_MIGRATION_REHEARSAL=1`.
- [ ] Kiểm tra tối thiểu 14 mục:
  - [ ] clone đúng DB rehearsal;
  - [ ] mô phỏng schema trước Phase A;
  - [ ] tạo cặp khóa trùng;
  - [ ] backup khóa trước NULL hóa;
  - [ ] không mất dòng;
  - [ ] checksum toàn bộ nội dung (trừ `idempotency_key`) không đổi;
  - [ ] bản cũ hơn bị NULL;
  - [ ] bản mới nhất giữ khóa;
  - [ ] unique index hợp lệ;
  - [ ] ghi trùng bị chặn `23505`;
  - [ ] rollback giữ dòng/nội dung;
  - [ ] khóa NULL không tự khôi phục;
  - [ ] áp lại lần 2 thành công;
  - [ ] `prisma migrate diff` empty sau migration.
- [ ] Ghi evidence JSON + checksum vào thư mục kiểm soát; cập nhật `docs/evidence/phase-a-qa/migration-rehearsal-summary.json` nếu snapshot khác fixture.
- [ ] Đo thời gian migration/rollback; ghi vào runbook release.

**Trạng thái:** `BLOCKED_BY_PRODUCTION_ACCESS` — chưa có snapshot gần Production. Rehearsal 14/14 hiện tại chỉ trên fixture `talung_v3_phase_a_qa`, **không thay thế** rehearsal gần Production.

---

## 4. GATE D — ROLLBACK

> Owner: S0/ops quyết định; S1 chuẩn bị và diễn tập trên clone.

### 4.1. Code rollback

- [ ] Xác định SHA Production trước release (health public ghi `4c7eb52`; xác minh lại bằng Vercel/S0).
- [ ] Chuẩn bị rollback Vercel về deployment trước đó; không force-push `main`.
- [ ] Giữ backup branch/tag trước release.
- [ ] Kiểm tra mã cũ chạy được với schema Phase A (index mới là additive; mã cũ bỏ qua index).
- [ ] Ghi thời gian rollback mục tiêu và người có quyền.

### 4.2. Schema rollback

- [ ] Rollback tối thiểu: `DROP INDEX IF EXISTS "personal_work_items_person_idempotency_key";`
- [ ] Không DROP bảng/cột dữ liệu nghiệp vụ.
- [ ] Khóa đã NULL hóa **không tự khôi phục**; chỉ khôi phục từ backup nếu có yêu cầu.
- [ ] Nếu cần khôi phục dữ liệu: restore từ backup đã kiểm tra, không restore mù.
- [ ] Diễn tập rollback trên snapshot: dữ liệu còn nguyên; ghi checksum.

### 4.3. Điều kiện dừng/rollback ngay

- [ ] P0 bảo mật: tự duyệt, leo quyền, lộ dữ liệu, sai tuyến phê duyệt.
- [ ] Mất dữ liệu hoặc row count giảm ngoài dự kiến.
- [ ] Unique index/migration lỗi hoặc chạy một phần không xác định.
- [ ] `/api/health` sai commit, `db != up`, 5xx tăng.
- [ ] Storage minh chứng trả 503 ngoài dự kiến hoặc lộ URL public.
- [ ] UAT chủ dự án fail nghiệp vụ nghiêm trọng.

**Trạng thái:** `PASS_ON_FIXTURE` — rollback DROP INDEX đã diễn tập 14/14; cần diễn tập lại trên snapshot gần Production.

---

## 5. GATE E — UAT DESKTOP / MOBILE

> Owner: chủ dự án/ký nghiệm thu. S1 hỗ trợ kịch bản và bằng chứng.

### 5.1. Môi trường UAT

- [ ] Preview/Staging dùng DB test riêng; **không** dùng DATABASE_URL Production.
- [ ] Tài khoản vai trò thật giả lập: STAFF, DEPARTMENT_LEADER, UNIT_LEADER, SYSTEM_ADMIN (chặn nghiệp vụ).
- [ ] Không dùng mật khẩu/tài khoản thật; không reset tài khoản Production.
- [ ] Storage test riêng hoặc local có kiểm soát; không dùng bucket Production.
- [ ] Ghi SHA Preview/Staging trùng RC.

### 5.2. Kịch bản Desktop

- [ ] Tạo kế hoạch DRAFT, chọn đơn vị/kỳ/hạng mục đầu tiên.
- [ ] Chọn kế hoạch; thêm/sửa/xóa đầu việc đúng hạng mục/kỳ/người.
- [ ] Sửa form cũ với `completedDate:null` không còn 409.
- [ ] Gửi trùng `idempotencyKey` chỉ tạo một bản ghi.
- [ ] Một đầu việc gắn nhiều sản phẩm QĐ1277; không tự suy hệ số/điểm.
- [ ] Không tạo trực tiếp `COMPLETED`; không tự duyệt.
- [ ] `SUBMITTED` khóa nội dung; trả lại → sửa → trình lại → người khác phê duyệt.
- [ ] SYSTEM_ADMIN bị chặn nghiệp vụ; STAFF ngoài phạm vi bị 403.

### 5.3. Kịch bản Mobile 390×844

- [ ] Chọn kế hoạch, không tràn ngang (`scrollWidth <= viewport`).
- [ ] Mở/đóng modal thêm đầu việc; form nằm trong khung.
- [ ] Thêm/sửa đầu việc; lưu thành công; dữ liệu bền vững sau F5.
- [ ] Nút bị khóa/disabled có giải thích khi kế hoạch SUBMITTED/APPROVED.
- [ ] Ảnh chụp có chờ font Material Symbols tải xong trước khi đo layout.

### 5.4. Bằng chứng và ký nhận

- [ ] Ảnh Desktop/Mobile đặt tên theo bước; lưu `docs/evidence/phase-a-qa/` hoặc thư mục UAT.
- [ ] Biên bản UAT ghi người thử, vai trò, thời gian, SHA, kết quả PASS/FAIL.
- [ ] Chủ dự án ký xác nhận trước khi release.

**Trạng thái:** fixture UAT **12/12 PASS**; UAT chủ dự án **PENDING**.

---

## 6. GATE F — SMOKE SAU DEPLOY

> Chỉ chạy sau khi có lệnh deploy riêng. Mặc định **read-only**; mọi thao tác ghi phải được phê duyệt và dọn sạch.

### 6.1. Health & phiên bản

- [ ] `GET /api/health` trả `status=ok`, `db=up`.
- [ ] `commit` khớp RC SHA đã chốt.
- [ ] Không có 5xx trong cửa sổ smoke.
- [ ] Kiểm tra Vercel deployment đúng commit/time.

### 6.2. API read-only

- [ ] `GET /api/plans/options` với tài khoản vai trò phù hợp → 200.
- [ ] `GET /api/plans` → 200; dữ liệu kế hoạch hiện hữu không đổi bất thường.
- [ ] `GET /api/personal-work-items` → 200; phân quyền đúng.
- [ ] `GET /api/work-catalog` → 200; `legacyTemplatesSelectable` đúng theo bộ phận.
- [ ] `GET /api/products` → 200; tìm có dấu/không dấu.
- [ ] Kiểm tra 401/403 cho người không đăng nhập/không đủ quyền.
- [ ] Không gọi API ghi nếu chưa được phê duyệt.

### 6.3. Kiểm tra schema/dữ liệu sau deploy

- [ ] Unique index `personal_work_items_person_idempotency_key` tồn tại, valid.
- [ ] Không có khóa trùng còn lại (query read-only).
- [ ] Số dòng `personal_work_items` không giảm; checksum nội dung (trừ khóa) khớp baseline.
- [ ] `prisma migrate diff` chỉ còn drift cũ đã biết; không có drift Phase A.
- [ ] `_prisma_migrations` vẫn không bị tạo ngoài kế hoạch.
- [ ] Audit event ghi nhận thao tác migration/phase A đúng.

### 6.4. UI smoke

- [ ] `/plans` Desktop: mở/không lỗi; chọn kế hoạch; nút theo trạng thái đúng.
- [ ] `/plans` Mobile 390: không tràn ngang; modal mở/đóng.
- [ ] Trang lịch sử/duyệt liên quan không lỗi.
- [ ] Storage minh chứng: kiểm tra fail-closed/không lộ URL; không upload nếu chưa phê duyệt.

### 6.5. Sau smoke

- [ ] Ghi kết quả PASS/FAIL, thời gian, người thực hiện, SHA.
- [ ] Nếu có thao tác ghi: xác nhận đã dọn sạch; audit tăng có kiểm soát.
- [ ] Quyết định go/no-go; nếu fail P0 → rollback theo mục 4.

**Trạng thái:** `PENDING`.

---

## 7. GATE G — FINAL REGRESSION TRÊN RELEASE CANDIDATE

> **Chưa chạy.** Chỉ thực hiện sau khi S0 chốt RC SHA và xác nhận S2/S3/S6 đã merge xong.

### 7.1. Chuẩn bị

- [ ] Checkout đúng RC SHA trong worktree S1 (fetch/read-only; không merge `main`).
- [ ] Xác nhận `git status` sạch; không có file lạ.
- [ ] DB test `talung_v3_phase_a_qa` được reset/clone từ fixture sạch; port 3111.
- [ ] Storage test local riêng; `ALLOW_LOCAL_EVIDENCE=1` chỉ cho test.
- [ ] Không có URL/credential Production trong env.
- [ ] Build server từ RC SHA; ghi thời gian.

### 7.2. Bộ bắt buộc

| Nhóm | Bộ / lệnh | Trạng thái dự kiến |
|---|---|---|
| Tĩnh | `npx tsc --noEmit` | PENDING |
| Tĩnh | `npx prisma validate` | PENDING |
| Build | `npm run build` | PENDING |
| Phase A | `npx tsx scripts/test-v3-phase-a-planning.ts` (37) | PENDING |
| Phase A | `test-v3-multi-product.ts` (36) | PENDING |
| Security | `test-v3-no-self-approval.ts` (5) | PENDING |
| Review | `test-v3-review-flow.ts` (38) | PENDING |
| Permissions | `test-v3-permissions.ts` (24) | PENDING |
| E2E | `test-v3-e2e-flow.ts` (40) | PENDING |
| F01/F05 | `test-v3-f01-f05.ts` (22) | PENDING |
| F18 | `test-v3-f18-routine.ts` (26) | PENDING |
| Storage | `test-v3-private-attachments.ts` (14) | PENDING |
| YC-23/25 | `test-yc23-25-api.ts` (38) | PENDING |
| Evidence | `test-v3-evidence-adjustment.ts` (21) | PENDING |
| UAT | `uat-phase-a-desktop-mobile.ts` (12) | PENDING |
| Integration | Regression các session đã merge (S4/S5/S3/S6 theo S0 danh sách) | PENDING — S0 cung cấp |
| Migration | Rehearsal trên snapshot gần Production | BLOCKED_BY_PRODUCTION_ACCESS |

### 7.3. Cách ghi kết quả

- [ ] Ghi rõ **bộ nào chạy**, **bộ nào không chạy**, lý do, exit code.
- [ ] Không gộp số PASS của các bộ khác nhau thành một con số mơ hồ.
- [ ] Lưu log/ảnh/JSON evidence theo bộ.
- [ ] Nếu fail: ghi P0/P1, owner, commit/PR sửa; không đánh dấu PASS.
- [ ] Chỉ chốt `FINAL_REGRESSION: PASS` khi tất cả bộ bắt buộc chạy và không còn P0.

**Trạng thái:** `NOT_STARTED` — chờ S0.

---

## 8. GATE H — GO/NO-GO VÀ SIGN-OFF

### 8.1. Điều kiện GO

- [ ] RC SHA đã đóng băng và khớp integration.
- [ ] Final regression PASS; danh sách test chạy/chưa chạy rõ ràng.
- [ ] Migration audit/backup PASS; backup restore-test PASS.
- [ ] Rehearsal trên snapshot gần Production PASS.
- [ ] Rollback plan + drill PASS; thời gian rollback chấp nhận được.
- [ ] UAT Desktop/Mobile PASS và có chữ ký chủ dự án.
- [ ] Không còn P0/leo quyền/tự duyệt/lộ dữ liệu.
- [ ] Storage fail-closed; không dùng bucket Production cho test.
- [ ] Có lệnh release Production riêng của chủ dự án.
- [ ] Có cửa sổ bảo trì, người trực, kênh liên lạc.

### 8.2. Điều kiện NO-GO

- [ ] Còn S2/S3/S6 chưa merge hoặc RC thay đổi.
- [ ] Production access/read-only audit chưa có.
- [ ] Backup/restore hoặc rehearsal gần Production chưa PASS.
- [ ] Final regression fail P0 hoặc chưa chạy đủ bộ.
- [ ] UAT chủ dự án chưa ký.
- [ ] Có migration chưa diễn tập hoặc rollback chưa kiểm chứng.

### 8.3. Sign-off

| Vai trò | Tên | Kết luận | Thời điểm | Ghi chú |
|---|---|---|---|---|
| S0 — Integration Owner |  |  |  |  |
| S1 — Phase A QA |  |  |  |  |
| Chủ dự án |  |  |  |  |
| Ops/DB |  |  |  |  |

---

## 9. BLOCKER HIỆN TẠI

| ID | Blocker | Mức | Owner | Cách gỡ |
|---|---|---|---|---|
| B1 | S2 `BLOCKED_BY_CONTRACT_ALIGNMENT` (Q9, Q11/YC-02) | P0 release | S2/S0 | Sửa `isOfficial/dataSource`, 2 chữ số thập phân; S0 merge |
| B2 | S3 target-only chờ S2 schema | P0 release | S3/S2 | S2 công bố schema; S3 merge đầy đủ |
| B3 | S6 implementation chưa merge | P1 release | S6/S0 | Chốt phạm vi release; merge theo phase |
| B4 | `BLOCKED_BY_PRODUCTION_ACCESS` — không có read-only DB/snapshot | P0 release | S0/ops | Cấp credential read-only + snapshot gần Production |
| B5 | Chưa có RC SHA | P0 release | S0 | Chốt sau B1–B3 |
| B6 | UAT chủ dự án chưa thực hiện | P0 release | Chủ dự án | Preview/Staging + tài khoản test |
| B7 | Final regression chưa chạy | P0 release | S1 | Chạy sau B5, theo mục 7 |

---

## 10. NEXT ACTIONS

1. **S0:** xác nhận trạng thái merge S2/S3/S6; khi xong, chốt RC SHA và gửi lệnh `RUN_FINAL_REGRESSION`.
2. **S0/ops:** cấp quyền read-only DB Production + snapshot gần Production; nếu không, giữ nguyên `BLOCKED_BY_PRODUCTION_ACCESS`.
3. **S1:** khi có RC SHA, chạy mục 7 trên DB `talung_v3_phase_a_qa`, ghi rõ bộ chạy/chưa chạy; không chạy migration/ghi Production.
4. **S1/S0:** cập nhật kết quả final regression + migration rehearsal gần Production vào tài liệu này trước go/no-go.
5. **Chủ dự án:** UAT Desktop/Mobile trên Preview/Staging; ký sign-off.
6. **Chỉ sau tất cả gate:** release theo lệnh riêng; smoke theo mục 6.

---

## 11. LIÊN KẾT

- Handoff QA trước: `docs/evidence/multi-session/S1_PHASE_A_QA_HANDOFF_2026-10-23.md`
- Migration rehearsal fixture: `docs/evidence/phase-a-qa/migration-rehearsal-summary.json`
- Ảnh UAT: `docs/evidence/phase-a-qa/01..10-*.png`
- Script audit: `scripts/phase-a-idempotency-audit.ts`
- Script rehearsal: `scripts/rehearse-phase-a-migration.ts`
- Script UAT: `scripts/uat-phase-a-desktop-mobile.ts`
- Backup/restore: `scripts/pg-backup-restore.mjs` (theo công cụ S0/ops phê duyệt)
- Guard DB test: `scripts/lib/test-db-safety.ts`

---

## 12. S0 HANDOFF — RELEASE READINESS

```text
SESSION: S1
TASK: Phase A release-readiness checklist
BRANCH: codex/v3-phase-a-qa
BASE: 3708672 (S1 QA đã merge tại 06c5d19)
COMMIT: HEAD nhánh (docs checklist; commit kế tiếp sau 3708672)
PRODUCTION_TOUCHED: NO
RC_SHA: NOT_FROZEN (integration observed d01001f, chưa phải RC)
UPSTREAM: S2 BLOCKED; S3 PARTIAL; S6 PLAN — chờ S0 xác nhận merge xong
PRODUCTION_ACCESS: BLOCKED_BY_PRODUCTION_ACCESS (không có read-only DB/snapshot)
FINAL_REGRESSION: NOT_STARTED — chờ lệnh S0
NEXT_ACTION: S0 chốt RC SHA + cấp read-only/snapshot; sau đó S1 chạy mục 7
STATUS: BLOCKED_BY_UPSTREAM_MERGES + BLOCKED_BY_PRODUCTION_ACCESS
```

**KẾT LUẬN:** Phase A đã merge và QA fixture PASS, nhưng **release chưa sẵn sàng**. Hai blocker lớn nhất hiện tại là **upstream S2/S3/S6 chưa xong** và **`BLOCKED_BY_PRODUCTION_ACCESS`** cho audit/backup/rehearsal gần Production. Không chạy final regression cho tới khi S0 chốt RC.

# KẾ HOẠCH RELEASE NHANH V3 — 23/10/2026

**Trạng thái:** `READY_FOR_PRODUCTION_ACCESS` — **chưa phải lệnh deploy**  
**Cập nhật:** 24/10/2026 — bổ sung V3.1 (Phase 3 + quick approve), YC-10/YC-11 vẫn OFF.  
**RC SHA:** `1765aab` (V3.1 — Phase 3 + quick approve; runtime code)  
**Nhánh:** `codex/v3-integration-yc01-13`  
**Chế độ:** release nhanh, giữ nguyên phạm vi đã merge; các phần nghiệp vụ chưa chốt để sau.  
**Production:** chưa ghi, chưa deploy, chưa merge `main`.

> Mục tiêu: đưa các kết quả đã hoàn thành lên Production sớm, nhưng không hạ gate bảo mật/migration/UAT.
> Điều kiện bắt buộc: có quyền đọc Production DB/snapshot, backup đã kiểm tra restore, UAT sign-off và lệnh release riêng.

---

## 1. PHẠM VI RELEASE

### 1.1. Đưa lên Production

| Nhóm | Nội dung | Trạng thái |
|---|---|---|
| Phase A | YC-03/04/05: kế hoạch, đầu việc, liên kết, idempotency, chống tự duyệt | Đã merge, test PASS |
| S2 | YC-01/02: so sánh thu NSNN, `dataSource/isOfficial`, 2 chữ số thập phân | Đã merge; B1/B2/C1 vẫn hiển thị “CHỜ CHỐT” |
| S3 | YC-06/07 target-only: lifecycle/status/amount/source/comparisonKind/dataSource | Đã merge; **không tính % chính thức** vì D5 pending |
| S4 | YC-08/09 hotfix/YC-12: task/approval hardening, lịch sử duyệt | Đã merge, test PASS |
| S5 | YC-13: ghi chú roster theo người, audit, UI desktop/mobile | Đã merge; biến thể E13 chưa chọn |
| S6 Phase 1 | YC-09 per-person: participant result/event/snapshot, một ApprovalCase/Task | Đã merge, test PASS |
| S6 Phase 2 | YC-10 quality 65–100 + adjustment + sheet phụ export | Đã merge; **flag `V3_YC10_QUALITY` mặc định OFF** |
| S6 Phase 2b | Quick approve My Work có picker quality (khi YC-10 bật) | Đã merge; flag OFF giữ hành vi cũ |
| S6 Phase 3 | YC-11 route resolver/pre-check/final theo `PersonSupervision` | Đã merge; **flag `V3_YC11_PRECHECK` mặc định OFF**; cần UAT dữ liệu thật trước khi bật |

### 1.2. Không đưa vào release này

| Hạng mục | Lý do |
|---|---|
| D5 / B-C-3 (`direction`, `measureMode`, `baselineScope`) | Chưa có quyết định nghiệp vụ; không tự suy |
| S5 E13 (ô trống, Excel note, “Đổi người”) | Chưa chọn A/B/C |
| B1/B2/C1 (kỳ trước/cùng kỳ) | Vẫn `PENDING`; UI ghi “CHỜ CHỐT” |
| E8/E12 | Quy tắc trả lại/lịch sử chưa chốt |
| Bật YC-10/YC-11 trên Production | Phải UAT dữ liệu thật + quyết định riêng; release này để OFF |

---

## 2. ĐIỀU KIỆN BẮT BUỘC — KHÔNG THƯƠNG LƯỢNG

| Gate | Điều kiện | Trạng thái hiện tại |
|---|---|---|
| G1 | Quyền **read-only** Production DB/snapshot | **BLOCKED** — chưa có credential/quyền |
| G2 | Backup full + restore thử thành công, có SHA-256 | **PENDING** — cần G1 |
| G3 | Preflight schema audit + quyết định migration | **PENDING** — cần G1 |
| G4 | UAT chủ dự án trên Preview/Staging đúng RC | **PENDING** |
| G5 | Lệnh release Production riêng của chủ dự án | **CHƯA CÓ** |
| G6 | Flag YC-10 và YC-11 **OFF** trên Production | Bắt buộc |

**Không có G1 + G5 thì không có ngày deploy.** Không dùng `prisma migrate deploy`, không `db push --accept-data-loss`, không reset tài khoản/dữ liệu Production.

---

## 3. BẰNG CHỨNG KIỂM THỬ RC

| Bộ test | Kết quả | Thời điểm |
|---|---:|---|
| Phase A planning | 37/37 | trước RC |
| S1 báo cáo Phase A | 313/313 | trước RC |
| S2 API + UI | 43/43 + 17/17 | trước RC |
| S3 contract + mapping + target API + target UI | 110/110 + 80/80 + 26/26 + 18/18 | trước RC |
| S4 hardening + no-self + review + YC37 + YC38 + e2e | 40/40 + 5/5 + 38/38 + 25/25 + 36/36 + 15/15 + 40/40 | trước RC |
| S5 roster API + UI | 22/22 + 24/24 | trước RC |
| S6 Phase 1 per-person + UI | 42/42 + 5/5 | trước RC |
| S6 Phase 2 quality + UI | 120/120 + 15/15 | sau merge Phase 2 |
| S6 Phase 3 precheck + UI | 80/80 + 21/21 | sau merge V3.1; gồm chặn final khi thiếu snapshot |
| Quick approve quality (trong YC-11 UI) | U1–U8 PASS | desktop + mobile |
| `tsc --noEmit`, `prisma validate`, `pnpm build` | PASS | sau merge V3.1 |

**Lưu ý:** S2/S3/S5 không bị sửa sau lần test tương ứng; S0 đã rerun S4/S6/Phase2 trên RC. S1 final regression vẫn cần chạy trên đúng `5e141cb` trước khi ký release.

### 3.1. Final regression S0 trên RC `5e141cb`

| Module | Kết quả cuối | Ghi chú |
|---|---:|---|
| S2 API + UI | **43/43 + 17/17** | Chạy tuần tự trên `talung_v3_phase_b`/3112; UI target tab đã ổn định hóa click |
| S3 contract + mapping + target API + UI | **110/110 + 80/80 + 26/26 + 18/18** | Chạy tuần tự trên `talung_v3_phase_c`/3113 |
| S5 roster API + UI | **22/22 + 24/24** | Chạy tuần tự trên `talung_v3_roster`/3115; đã dọn 2 bản ghi test `[YC13-TEST]` còn sót, không phải dữ liệu sản phẩm |
| S4 hardening + no-self + e2e | **40/40 + 5/5 + 40/40** | Chạy trên `talung_v3_fixture_integration`/3116, flag OFF |
| S6 per-person | **42/42** | Chạy trên `talung_v3_fixture_integration`/3116, flag OFF |
| S6 Phase 2 quality + UI | **120/120 + 15/15** | Chạy trên `talung_v3_fixture_integration`/3116, flag ON |
| S6 Phase 3 precheck + UI | **80/80 + 21/21** | Chạy trên `talung_v3_fixture_integration`/3116, flag ON |
| Quick approve quality | **U1–U8 PASS** | Desktop 1440 + mobile 390 |
| `tsc` / `prisma validate` / `build` | PASS | Build integration V3.1 |

**Lỗi môi trường đã loại trừ:** lần chạy song song 3 dev server trong cùng worktree gây hỏng cache `.next`/timeout; đã dừng, xóa `.next`, chạy tuần tự và PASS. Không phải lỗi sản phẩm.

---

## 4. MIGRATION PRODUCTION

### 4.1. Danh sách áp dụng (theo thứ tự)

| # | Migration | Nội dung | Ghi chú |
|---|---|---|---|
| 1 | `20261023120000_v3_phase_a_planning` | Unique index idempotency + NULL hóa khóa trùng | Phải audit khóa trùng trước |
| 2 | `20261023150000_v3_phase_b_revenue` | Cột target/baseline, bảng revision, quyền `metrics.config/entry_all` | Additive, có `IF NOT EXISTS` |
| 3 | `20261023160000_v3_phase_b_data_source` | `data_source` + backfill DEMO + check constraints | Backfill một lần; audit số DEMO |
| 4 | `20261023170000_v3_task_participant_results` | Participant result/event/snapshot + cột `task_updates` | **Không idempotent** — chỉ chạy khi object chưa có |
| 5 | `20261023180000_v3_approval_quality` | `quality_percent` + bảng adjustment | **Không idempotent** — chỉ chạy khi object chưa có |
| 6 | `20261023190000_v3_approval_precheck_route` | Bảng `approval_route_snapshots` cho pre-check/final | **Không idempotent** — chỉ chạy khi object chưa có |

### 4.2. Checksum migration (đối chiếu trước khi chạy)

| Migration | SHA-256 |
|---|---|
| `20261023120000_v3_phase_a_planning` | `bf93ca6ef2e6d42f1722942a97231d94d0bac4f7fcd278155b08bd2902062a83` |
| `20261023150000_v3_phase_b_revenue` | `c7f8c02748c4e6923065a887a34cb6503a71e3495ee8e8df4708d3dbe1ffb0a9` |
| `20261023160000_v3_phase_b_data_source` | `ce09367c84bd3d25650b44f3b7d56952f93ea357d5b9cd56b7414e80e685c8bf` |
| `20261023170000_v3_task_participant_results` | `1dc4160d9b9efec309c8166d8007cfb7a63b0bd622a6791ef1e72265c7158108` |
| `20261023180000_v3_approval_quality` | `0e186f397b3cee67d76d27609b9421d7abd7087146c76b198f390affcdd0c9e8` |
| `20261023190000_v3_approval_precheck_route` | `33c26117e2899804f87890c094b488028614ec57cecb7d5a557128f6896259ce` |

**Thứ tự lệnh (chạy từng file, dừng ngay nếu lỗi):**

```bash
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/20261023120000_v3_phase_a_planning/migration.sql
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/20261023150000_v3_phase_b_revenue/migration.sql
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/20261023160000_v3_phase_b_data_source/migration.sql
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/20261023170000_v3_task_participant_results/migration.sql
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/20261023180000_v3_approval_quality/migration.sql
psql "$PROD_WRITE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/migrations/20261023190000_v3_approval_precheck_route/migration.sql
```

Sau mỗi file: chạy lại preflight đúng section, ghi kết quả; nếu lỗi/partial → STOP, restore backup.

### 4.3. Quy tắc tuyệt đối

- **KHÔNG** chạy `prisma migrate deploy`: Production không có `_prisma_migrations`, sẽ chạy `0_init` và phá dữ liệu.
- **KHÔNG** chạy `prisma db push` / `--accept-data-loss` trên Production.
- Chỉ chạy SQL sau khi: backup → restore thử → preflight audit → S0/ops duyệt.
- Migration 4, 5, 6: nếu preflight thấy **một phần object đã tồn tại**, **DỪNG**, không tự sửa; lập phương án riêng.
- Không chạy migration trong transaction tự động nếu công cụ không hỗ trợ; theo runbook ops.
- Ghi lại statement, thời gian, số dòng ảnh hưởng, người thực hiện.

### 4.4. Thứ tự triển khai

1. DB migration (backup + apply tuần tự).
2. Xác minh schema.
3. Deploy code RC.
4. Health/smoke/UAT.
5. Theo dõi 24h.

---

## 5. PREFLIGHT AUDIT

Chạy **read-only**:

```bash
psql "$PROD_READONLY_URL" -f docs/release/PREFLIGHT_PRODUCTION_AUDIT.sql
```

Lưu kết quả vào biên bản release (không commit credential).

### 5.1. Cách cấp quyền nhanh

**Cách A — không tạo role (nhanh nhất):**
1. Supabase Dashboard → project Production → SQL Editor → New query.
2. Dán toàn bộ `docs/release/PREFLIGHT_SUPABASE_2026-10-24.sql`.
3. Run; copy kết quả (hoặc screenshot) gửi S0. Không gửi connection string/mật khẩu.

**Cách B — cấp read-only URL cho S0:**
1. Trong Supabase SQL Editor, tạo role tạm:
```sql
create role release_readonly login password 'MAT_KHAU_TAM_MANH';
grant pg_read_all_data to release_readonly;
grant connect on database postgres to release_readonly;
```
2. Lấy connection string **Direct** (port 5432) từ Supabase Dashboard → Connect; thay user bằng `release_readonly`, password vừa tạo.
3. Lưu vào file ngoài repo, ví dụ
`C:\Users\thanhnx\AppData\Local\Temp\opencode\prod-readonly.env`:
```env
PROD_READONLY_URL="postgresql://release_readonly:...@...:5432/postgres?sslmode=require"
```
4. Báo S0 “đã đặt file”; S0 dùng xong sẽ xóa file/role. Không commit, không gửi vào chat.

**Cách C — ops chạy trực tiếp:** ops chạy `PREFLIGHT_PRODUCTION_AUDIT.sql` bằng `psql` và gửi output.

**Ma trận quyết định:**

| Kết quả audit | Hành động |
|---|---|
| Tất cả object của migration đã có | Không chạy DDL; ghi nhận “already applied”; chỉ chạy code |
| Chưa có object nào của migration | Chạy đúng migration SQL sau backup |
| Có một phần object | **STOP** — không release; lập kế hoạch sửa drift |
| Có khóa idempotency trùng | Backup + xác định bản giữ; migration Phase A sẽ NULL hóa bản cũ hơn |
| Có dữ liệu DEMO ngoài dự kiến | Dừng, xác nhận với chủ dự án trước backfill |

---

## 6. BACKUP / RESTORE

- Backup full bằng công cụ ops được duyệt (`pg_dump` custom format hoặc script chuẩn).
- Lưu ngoài repo; ghi kích thước, SHA-256, thời điểm, người thực hiện.
- Restore thử vào database clone **không phải Production**; đối chiếu số bảng/dòng/FK.
- Chỉ release khi `restore_mismatches = 0`.
- Không xóa backup cũ; không restore đè Production nếu chưa có phê duyệt riêng.

---

## 7. UAT TỐI THIỂU TRÊN PREVIEW/STAGING

- Đăng nhập lần lượt: STAFF, DEPARTMENT_LEADER, UNIT_LEADER; SYSTEM_ADMIN chỉ kiểm tra bị chặn nghiệp vụ.
- Phase A: tạo kế hoạch, thêm/sửa đầu việc, gửi trùng idempotency, không tự duyệt.
- S2: Dashboard + `/giao-ban` hiển thị so sánh, 2 chữ số, kỳ trước/cùng kỳ “CHỜ CHỐT”; DEMO không lẫn vào số chính thức.
- S3: `/giao-ban/cau-hinh` target lifecycle; `/giao-ban` không hiện % chính thức; D5 ghi “chờ B-C-3”.
- S4: task WAITING_REVIEW → duyệt/trả lại; collaborator không duyệt; lịch sử đúng.
- S5: roster desktop/mobile, ghi chú per-person, audit; không tràn ngang.
- S6 Phase 1: collaborator báo phần việc; owner nộp chung; một ApprovalCase; participant summary.
- S6 Phase 2: **flag OFF** — không thấy quality select/history; nếu bật thử trên Staging phải có picker và adjustment.
- S6 Phase 3: **flag OFF** — luồng duyệt giữ hành vi cũ; nếu bật thử trên Staging phải có pre-check panel, route snapshot và final chặn pre-checker. Không bật Production khi `person_supervisions` chưa được xác minh read-only.
- Mobile 390px: Dashboard, `/giao-ban`, task detail, roster, approvals không tràn ngang.

---

## 8. DEPLOY & SMOKE

### 8.1. Trước deploy

- [ ] RC `ede75cb` đóng băng; không commit mới.
- [ ] Backup/restore PASS; preflight audit PASS.
- [ ] Migration đã rehearsal trên snapshot gần Production.
- [ ] UAT sign-off.
- [ ] Lệnh release riêng.
- [ ] `V3_YC10_QUALITY` và `V3_YC11_PRECHECK` OFF/unset trên Production.

### 8.2. Deploy

**Production target:** Vercel project `tlqm/task-cus` — `https://task-cus.vercel.app` (health hiện tại `4c7eb52`, `env=production`, `db=up`).  
**Lưu ý:** `DATABASE_URL`/`DIRECT_URL` là Vercel Sensitive, CLI không đọc được; phải dùng Cách A/B/C ở mục 5.1.

- [ ] Dừng ghi/ thông báo cửa sổ bảo trì (nếu cần).
- [ ] Chạy migration theo thứ tự mục 4.
- [ ] Xác minh schema: cột/bảng/index/FK; `prisma migrate diff` nếu có thể.
- [ ] Deploy code `ede75cb`.
- [ ] `/api/health`: `status=ok`, `db=up`, `commit=ede75cb`, `env=production`.
- [ ] Đăng nhập 3 vai trò; smoke các màn hình chính.
- [ ] Kiểm tra log 5xx, auth, storage, notification.

### 8.3. Sau deploy

- [ ] Theo dõi 24h: 5xx, login, approval, migration errors.
- [ ] Xác nhận không có dữ liệu DEMO mới hoặc quality value ngoài ý muốn.
- [ ] Ghi biên bản release + SHA + thời gian + người thực hiện.

---

## 9. ROLLBACK

**Ưu tiên rollback code, giữ schema additive.**

1. Rollback Vercel/deployment về commit Production trước release (xác minh `4c7eb52` hoặc SHA thực tế).
2. Tắt `V3_YC10_QUALITY` và `V3_YC11_PRECHECK` ngay nếu có bật nhầm.
3. Schema additive tương thích code cũ; **không drop bảng/cột** trừ khi có lệnh riêng + backup.
4. Nếu migration lỗi giữa chừng: dừng, restore backup, rollback code; không chạy lại mù.
5. Nếu phải rollback schema Phase 1/2: chấp nhận mất dữ liệu phát sinh sau release; chỉ làm khi có phê duyệt và backup đã kiểm tra.
6. Phase A rollback tối thiểu: `DROP INDEX IF EXISTS personal_work_items_person_idempotency_key;` — không khôi phục khóa đã NULL hóa nếu không restore backup.

**Điều kiện rollback ngay:** P0 bảo mật/tự duyệt/leo quyền/lộ dữ liệu; mất dữ liệu; migration partial; health sai commit/db; 5xx tăng; UAT fail nghiêm trọng.

---

## 10. GO / NO-GO

| Vai trò | Trách nhiệm | Trạng thái |
|---|---|---|
| Chủ dự án | Chốt scope, UAT, lệnh release | **PENDING** |
| S0 | RC, migration plan, regression, release package | **DONE một phần** |
| S1 | Final regression trên RC, release checklist | **PENDING** |
| Ops/DBA | Read-only access, backup/restore, migration execution | **BLOCKED** |
| Dev | Code rollback/hotfix | Standby |

**Kết luận hiện tại:** `NO-GO` — thiếu Production read-only/backup, UAT sign-off và lệnh release.  
**Khi có đủ G1–G6:** có thể deploy trong **1–2 ngày làm việc** theo runbook này.

---

## 11. VIỆC CẦN CHỦ DỰ ÁN CUNG CẤP NGAY

1. URL/credential **read-only** Production DB hoặc người có quyền chạy preflight audit.
2. Người/phê duyệt backup + restore thử.
3. Lịch UAT 0,5 ngày trên Preview/Staging đúng RC.
4. Xác nhận scope: chấp nhận S2 B1/B2/C1 “CHỜ CHỐT”, S3 không có % chính thức, YC-10 và YC-11 OFF.
5. Lệnh release Production riêng (bằng văn bản) sau khi UAT PASS.

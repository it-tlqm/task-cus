# SỔ MIGRATION PRODUCTION — 24/10/2026

- **Trạng thái:** `LEDGER THỦ CÔNG — 7/7 MIGRATION PASS — PROVIDER BACKUP/PITR CHƯA XÁC MINH`
- **Production:** `tlqm/task-cus` — `https://task-cus.vercel.app`
- **Quy tắc bắt buộc:** [`docs/release/MIGRATION_RULES.md`](./MIGRATION_RULES.md)
- **Biên bản backup/restore:** [`docs/evidence/release/BACKUP_RESTORE_REMEDIATION_2026-10-24.md`](../evidence/release/BACKUP_RESTORE_REMEDIATION_2026-10-24.md)
- **Nguồn dữ liệu:** `docs/evidence/release/PRODUCTION_DEPLOY_2026-10-24.md`, `docs/evidence/release/PRODUCTION_DEPLOY_V32_2026-10-24.md`, `docs/release/PRODUCTION_RELEASE_PLAN_2026-10-23.md` mục 4.2
- **Cập nhật:** 24/10/2026

> **Production không có bảng `_prisma_migrations`.** Preflight V3.1 trả `NULL` cho `to_regclass('public._prisma_migrations')`. Vì vậy sổ này là nguồn ghi nhận migration duy nhất; không có lịch sử do Prisma tự sinh. Không chạy `prisma migrate deploy` trên Production (xem `MIGRATION_RULES.md`).

---

## 1. TÌNH TRẠNG KIỂM SOÁT MIGRATION

| Hạng mục | Thực tế ghi nhận | Nguồn |
|---|---|---|
| Bảng lịch sử Prisma | **Không tồn tại** (`NULL` tại preflight V3.1) | Biên bản V3.1 mục 1 |
| Công cụ áp migration | Theo kế hoạch release: `psql -v ON_ERROR_STOP=1`, từng file; biên bản V3.1 chỉ ghi áp thủ công, tuần tự | Kế hoạch release mục 4.2; biên bản V3.1 mục 3 |
| Phạm vi đã áp | 6 migration V3.1 + 1 migration V3.2 = **7** | Biên bản V3.1 mục 3; biên bản V3.2 mục 3 |
| Kết quả | **7/7 PASS**, không partial apply | Biên bản V3.1/V3.2 |
| Rollback schema | **Không có ghi nhận** rollback schema | Biên bản không ghi nhận |
| Baseline Prisma | Không có tại preflight V3.1; release dùng `psql` thủ công, không dùng Prisma Migrate | Biên bản V3.1 mục 1 |

---

## 2. LEDGER 7 MIGRATION ĐÃ ÁP

> Biên bản V3.1/V3.2 chỉ ghi **ngày 24/10/2026**, không ghi giờ và không ghi tên cá nhân. Cột dưới đây phản ánh đúng mức chi tiết đó; không suy đoán thêm.

| # | Migration | SHA-256 (file `migration.sql`) | Thời điểm / người | Kết quả / row count | Ghi chú |
|---|---|---|---|---|---|
| 1 | `20261023120000_v3_phase_a_planning` | `bf93ca6ef2e6d42f1722942a97231d94d0bac4f7fcd278155b08bd2902062a83` | 24/10/2026 · V3.1 · Ops/DBA | **PASS** — unique index đã tạo; duplicate groups **0** trước khi chạy; counts không đổi | `UPDATE` NULL hóa khóa trùng + `CREATE UNIQUE INDEX IF NOT EXISTS` |
| 2 | `20261023150000_v3_phase_b_revenue` | `c7f8c02748c4e6923065a887a34cb6503a71e3495ee8e8df4708d3dbe1ffb0a9` | 24/10/2026 · V3.1 · Ops/DBA | **PASS** — counts không đổi | Additive; `IF NOT EXISTS`, `WHERE NOT EXISTS`, `ON CONFLICT DO NOTHING` |
| 3 | `20261023160000_v3_phase_b_data_source` | `ce09367c84bd3d25650b44f3b7d56952f93ea357d5b9cd56b7414e80e685c8bf` | 24/10/2026 · V3.1 · Ops/DBA | **PASS** — backfill `data_source`; counts không đổi | Backfill DEMO một lần; `DO $$` guard constraint; **`audit_events` INSERT không guard** → chạy lại sẽ thêm bản ghi audit |
| 4 | `20261023170000_v3_task_participant_results` | `1dc4160d9b9efec309c8166d8007cfb7a63b0bd622a6791ef1e72265c7158108` | 24/10/2026 · V3.1 · Ops/DBA | **PASS** — counts không đổi | **Không idempotent**: `CREATE TABLE`/`UNIQUE INDEX`/`FK` không có `IF NOT EXISTS` |
| 5 | `20261023180000_v3_approval_quality` | `0e186f397b3cee67d76d27609b9421d7abd7087146c76b198f390affcdd0c9e8` | 24/10/2026 · V3.1 · Ops/DBA | **PASS** — counts không đổi | **Không idempotent**: `CREATE TABLE`/index/FK không guard |
| 6 | `20261023190000_v3_approval_precheck_route` | `33c26117e2899804f87890c094b488028614ec57cecb7d5a557128f6896259ce` | 24/10/2026 · V3.1 · Ops/DBA | **PASS** — counts không đổi | **Không idempotent**: `CREATE TABLE`/index/FK không guard |
| 7 | `20261023200000_v32_metrics_decisions` | `bc969a193edf37a396f35f0511b8d86183d7b9c7fec4014a1ed6d3d0fe9fea0d` | 24/10/2026 · V3.2 · Ops/DBA | **PASS** — tạo `metric_target_rules`; **17 rules**; counts không đổi | `CREATE TABLE` không `IF NOT EXISTS`; `INSERT ... ON CONFLICT DO NOTHING`; additive |

**Về cột “row count”:** biên bản V3.1/V3.2 chỉ ghi counts tổng trước/sau, **không ghi số dòng theo từng migration**. Sổ giữ đúng mức chi tiết đó, không bổ sung số liệu không có nguồn.

---

## 3. MỐC DỮ LIỆU ĐỐI CHIẾU

| Bảng | Trước V3.1 (preflight) | Sau V3.1 | Sau V3.2 |
|---|---:|---:|---:|
| `people` | 37 | không đổi | 37 |
| `accounts` | 37 | không đổi | 37 |
| `tasks` | 14 | không đổi | 14 |
| `task_updates` | 7 | không đổi | không đổi (*) |
| `approval_cases` | 3 | không đổi | không đổi (*) |
| `approval_decisions` | 3 | không đổi | không đổi (*) |
| `personal_work_items` | 26 | không đổi | 26 |
| `metric_plan_targets` | 0 | không đổi | 0 |
| `metric_baselines` | 0 | không đổi | 0 |
| `metric_daily_entries` | 23 | không đổi | 23 |
| `person_supervisions` | 0 | 0 | **0** |

(*) Biên bản V3.2 chỉ liệt kê 7 bảng và kết luận “counts sau migration không đổi”; migration 7 chỉ `INSERT` vào `metric_target_rules`, không ghi vào 3 bảng này.

**Schema sau migration (theo biên bản):**

- Sau V3.1: 7 bảng V3 mới tồn tại; các cột `quality_percent`, `subject_person_id`, `participant_event_id`, `data_source`, `comparison_kind` tồn tại; permissions `metrics.config`, `metrics.entry_all` tồn tại.
- Sau V3.2: `metric_target_rules` tồn tại với 17 quy tắc; chỉ `THU_NSNN` YEAR/MONTH có `target_applicable = true`.

---

## 4. ĐỐI CHIẾU CHECKSUM

- 7 SHA-256 ở mục 2 là checksum **đã ghi trong kế hoạch release** mục 4.2.
- Ngày 24/10/2026, băm lại 7 file `prisma/migrations/<migration>/migration.sql` tại HEAD `ddc6f22` bằng `Get-FileHash -Algorithm SHA256`: **khớp 7/7**.
- Đây là kiểm tra **file trong repo**, không phải kiểm tra trạng thái object trong DB Production. Checksum không chứng minh migration đã áp đúng; cần preflight read-only để xác minh object.

---

## 5. MỨC ĐỘ IDEMPOTENT CỦA 7 FILE ĐÃ ÁP

| # | Mức | Chi tiết |
|---|---|---|
| 1 | Có guard | `UPDATE` chỉ tác động bản trùng; `CREATE UNIQUE INDEX IF NOT EXISTS` |
| 2 | Có guard | `ADD COLUMN`/`CREATE TABLE`/`CREATE INDEX` đều `IF NOT EXISTS`; permission `WHERE NOT EXISTS`; `ON CONFLICT DO NOTHING` |
| 3 | Có guard một phần | Cột/constraint có guard; backfill lặp lại không đổi kết quả; **audit INSERT lặp lại sinh bản ghi mới** |
| 4 | **Không** | `CREATE TABLE`/`UNIQUE INDEX`/`FK` không guard |
| 5 | **Không** | `CREATE TABLE`/index/FK không guard |
| 6 | **Không** | `CREATE TABLE`/index/FK không guard |
| 7 | Idempotent một phần | `CREATE TABLE`/index/FK không guard; `INSERT` rules có `ON CONFLICT DO NOTHING` |

> Không sửa 7 file đã áp. Nếu cần guard cho môi trường mới, tạo migration **mới** có kiểm tra object trước (xem `MIGRATION_RULES.md`).

---

## 6. BACKUP TỰ ĐỘNG / PITR — CHƯA XÁC MINH

Theo **audit ngày 24/10/2026**, `sbc backups list` trả **danh sách trống** và **PITR đang tắt** (chưa xác minh lại). Task 1.4 **không chạy lại** lệnh audit, **không truy cập Production**, **không tạo backup**.

| Hạng mục | Trạng thái tại 24/10/2026 | Ghi chú |
|---|---|---|
| PITR | **CHƯA XÁC NHẬN** — audit ghi nhận đang tắt | Ops phải xác nhận lại và quyết định bật/chấp nhận rủi ro bằng văn bản |
| Danh sách backup provider | **CHƯA XÁC NHẬN** — audit ghi nhận trống | Không có backup ID để ghi vào sổ |
| Backup thủ công (schema + data) | **CÓ** cho V3.1 và V3.2, lưu ngoài repo | Xem biên bản backup/restore; không có đường dẫn trong repo |
| Restore rehearsal | **PASS** cho V3.1 và V3.2 | Xem biên bản backup/restore |

**Không được coi Production đã có PITR/backup tự động** cho đến khi ops xác nhận và ghi bằng chứng (thời điểm, backup ID, retention).

---

## 7. VIỆC OPS CẦN CHỐT

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Xác nhận PITR đang bật hay tắt; nếu tắt, quyết định bật hoặc chấp nhận rủi ro bằng văn bản | **PENDING** |
| 2 | Xác nhận danh sách backup provider; nếu trống, lập lịch backup hoặc bật PITR | **PENDING** |
| 3 | Ghi backup ID + nơi lưu + thời hạn giữ + người phụ trách | **PENDING** |
| 4 | Tạo backup mới sau V3.2 trước khi bật flag hoặc chạy migration tiếp theo | **PENDING** |
| 5 | Diễn tập restore định kỳ (tối thiểu trước mỗi release có DDL) | **PENDING** |
| 6 | Ghi giờ + tên người thực hiện cho mỗi migration tiếp theo | **PENDING** |

---

## 8. QUY ƯỚC CẬP NHẬT SỔ

- Mỗi migration mới: **sau khi áp** migration (đã có kết quả + counts trước/sau), thêm **một dòng** vào mục 2, rồi commit dòng đó cùng biên bản release trước khi đóng release.
- Không sửa/xóa dòng cũ; nếu sai, thêm dòng đính chính hoặc ghi chú có ngày.
- Dòng mới phải có: tên migration, SHA-256, ngày + giờ (giờ Việt Nam), người thực hiện, kết quả, counts trước/sau, ghi chú partial/rollback nếu có.
- Sổ chỉ có giá trị khi đi kèm biên bản backup/restore và preflight read-only tương ứng.

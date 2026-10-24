# BIÊN BẢN BACKUP / RESTORE PRODUCTION — 24/10/2026

- **Trạng thái:** `LOGICAL BACKUP + RESTORE REHEARSAL PASS — PROVIDER BACKUP/PITR CHƯA XÁC MINH`
- **Production:** `tlqm/task-cus` — `https://task-cus.vercel.app`
- **Phạm vi:** backup trước migration V3.1 và V3.2; diễn tập restore trên database local
- **Nguồn:** `PRODUCTION_DEPLOY_2026-10-24.md` mục 2 · `PRODUCTION_DEPLOY_V32_2026-10-24.md` mục 2 · audit `sbc backups list` ngày 24/10/2026
- **Liên quan:** [`PRODUCTION_MIGRATION_LEDGER_2026-10-24.md`](../../release/PRODUCTION_MIGRATION_LEDGER_2026-10-24.md) · [`MIGRATION_RULES.md`](../../release/MIGRATION_RULES.md)

> Tài liệu này **lập lại từ biên bản deploy đã có**. Task 1.4 **không truy cập Production, không tạo backup, không restore, không chạy SQL**. Không có backup ID, kích thước file, hay thời hạn lưu nào được ghi thêm vì nguồn không có.

---

## 1. TÓM TẮT

| Lần | Thời điểm | Schema SHA-256 | Data SHA-256 | Restore target | Restore | Migration rehearsal | `migrate diff` |
|---|---|---|---|---|---|---|---|
| Trước V3.1 | 24/10/2026 | `f6a41ba1ac26a51a1e33aa188ba7a6b23477315f977e044141db16e4ed0635e0` | `1ba3e8496b3caebaf44b57c6e50ddbbfec79e06fe7f62db3bbc8e4c1431656fe` | `talung_v3_prod_rehearsal_20261024` | **PASS** | 6 migration V3.1 **PASS** | **No difference** |
| Trước V3.2 | 24/10/2026 | `a948a1440d6147c2358cbd734cb4c351dc3be2d28b1a926a862d06e0b645af5e` | `9fbad61f560cf91c1865a8780f469ce1101d851f45b87cf44d1e1d452fb1c306` | `talung_v3_v32_rehearsal` | **PASS** | migration `20261023200000_v32_metrics_decisions` **PASS** | **No difference** |

- Công cụ: logical backup bằng Supabase CLI (schema + data), theo biên bản V3.1.
- Lưu trữ: **ngoài repo**, ACL chỉ user hiện tại.
- Không dùng `prisma migrate deploy`, không `db push`, không reset.
- Đường dẫn file backup, kích thước, backup ID và thời hạn lưu **không được ghi trong repo** — thuộc quyền quản lý của ops.

---

## 2. CHI TIẾT V3.1

1. Backup logical schema + data trước migration.
2. SHA-256:
   - schema `f6a41ba1ac26a51a1e33aa188ba7a6b23477315f977e044141db16e4ed0635e0`
   - data `1ba3e8496b3caebaf44b57c6e50ddbbfec79e06fe7f62db3bbc8e4c1431656fe`
3. Restore vào `talung_v3_prod_rehearsal_20261024`: **PASS**, counts khớp Production.
4. Áp 6 migration V3.1 trên bản restore: **PASS**.
5. `prisma migrate diff` với schema: **No difference**.
6. Sau đó mới áp 6 migration trên Production; kết quả **6/6 PASS**, counts nghiệp vụ không đổi.

---

## 3. CHI TIẾT V3.2

1. Backup logical schema + data trước migration 7.
2. SHA-256:
   - schema `a948a1440d6147c2358cbd734cb4c351dc3be2d28b1a926a862d06e0b645af5e`
   - data `9fbad61f560cf91c1865a8780f469ce1101d851f45b87cf44d1e1d452fb1c306`
3. Restore vào `talung_v3_v32_rehearsal`: **PASS**.
4. Áp `20261023200000_v32_metrics_decisions` trên bản restore: **PASS**, counts không đổi.
5. `prisma migrate diff`: **No difference**.
6. Sau đó áp migration 7 trên Production: **PASS**; `metric_target_rules` có 17 rules; counts không đổi.

---

## 4. ĐÃ CHỨNG MINH / CHƯA CHỨNG MINH

**Đã chứng minh tại thời điểm 24/10/2026:**

- Có backup logical đọc được cho cả hai lần, có SHA-256 schema và data.
- Restore vào database clone **PASS**; V3.1 counts khớp Production, V3.2 counts sau rehearsal không đổi.
- Migration rehearsal trên bản restore **PASS**; `prisma migrate diff` **No difference**.
- Migration Production **PASS** 7/7, không partial apply, counts nghiệp vụ không đổi.

**Chưa chứng minh (không được suy diễn thành “đã có”):**

- **Không** chứng minh Production có backup tự động hoặc PITR.
- **Không** có backup ID, danh sách backup provider, hay retention được ghi nhận.
- **Không** có backup mới sau migration V3.2; backup gần nhất theo biên bản là **trước** migration 7.
- **Không** diễn tập restore từ backup provider (danh sách trống tại audit).
- **Không** đo RPO/RTO; không có số liệu để công bố.
- **Không** chứng minh backup còn nguyên vẹn tại thời điểm đọc tài liệu này — cần ops kiểm tra lại file/SHA.

---

## 5. BACKUP PROVIDER / PITR

Theo **audit ngày 24/10/2026**:

- `sbc backups list`: **danh sách trống**.
- **PITR: tắt** (theo audit; chưa xác minh lại trong task này).

Task 1.4 **không chạy lại** audit này. Trạng thái hiện tại:

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| PITR | **CHƯA XÁC NHẬN** | Audit ghi nhận tắt; ops phải xác nhận lại và quyết định |
| Backup provider | **CHƯA XÁC NHẬN** | Audit ghi nhận trống; không có backup ID để ghi |
| Backup logical thủ công | CÓ (V3.1, V3.2) | Ngoài repo, ACL user; không có đường dẫn trong repo |

**Không ghi “PITR đã bật” hay “đã có backup tự động” ở bất kỳ tài liệu release nào** cho đến khi ops cung cấp bằng chứng.

---

## 6. RỦI RO HIỆN TẠI

1. **Không có lớp backup thứ hai:** nếu file logical backup ngoài repo bị mất/hỏng, không có backup provider để fallback.
2. **Cửa sổ mất dữ liệu:** dữ liệu phát sinh sau lần backup 24/10/2026 (đặc biệt sau V3.2/UAT) chưa có bản backup mới theo biên bản.
3. **Chưa có restore định kỳ:** backup chỉ được chứng minh dùng được một lần cho mỗi phiên.
4. **PITR tắt (theo audit):** không có khả năng tua về thời điểm trước sự cố.
5. **Thiếu danh tính backup:** không có backup ID/retention nên không thể kiểm toán vòng đời backup.

---

## 7. VIỆC OPS CẦN LÀM

| # | Việc | Bằng chứng cần lưu | Trạng thái |
|---|---|---|---|
| 1 | Xác nhận PITR bật/tắt; quyết định bật hoặc chấp nhận rủi ro bằng văn bản | Ảnh Dashboard/CLI + ngày giờ | **PENDING** |
| 2 | Chạy lại `sbc backups list`; nếu trống, lập lịch backup hoặc bật PITR | Output lệnh + ngày giờ | **PENDING** |
| 3 | Ghi backup ID, nơi lưu, retention, owner | Bảng trong biên bản này | **PENDING** |
| 4 | Backup mới sau V3.2, trước khi bật flag hoặc migration tiếp theo | SHA-256 schema/data | **PENDING** |
| 5 | Diễn tập restore định kỳ; lưu kết quả counts + `migrate diff` | Biên bản restore | **PENDING** |
| 6 | Kiểm tra lại SHA-256 của 2 bộ backup V3.1/V3.2 còn khớp | Output `Get-FileHash`/`sha256sum` | **PENDING** |

---

## 8. KẾT LUẬN

- Backup/restore **đã diễn tập thành công** cho V3.1 và V3.2; đây là bằng chứng đủ để nói “có thể restore từ backup logical tại 24/10/2026”.
- **Không** đủ để nói “Production đã có backup tự động/PITR”. Trạng thái đó vẫn là **CHƯA XÁC MINH** và phải được ops chốt trước release/migration tiếp theo.
- Không xóa bộ backup V3.1/V3.2 cho đến khi có UAT sign-off **và** có lớp backup thay thế đã được xác minh.

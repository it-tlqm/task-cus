# TALUNG-CUS-WORK — BÁO CÁO GO/NO-GO CUỐI (CLEAN RESET V3)

**Ngày:** 22/10/2026 · **Nhánh:** `feature/v3-demo` · **Production:** `d524576` — **CHƯA chạy EXECUTE**
**Kết luận: 🔴 NO-GO cho EXECUTE Production** — còn 5 blocker cần chủ dự án xác nhận/xử lý (mục 8).

> **Cập nhật 23/10/2026:** Production đã nâng cấp `/roster` (tiếp nối `1e6a070`).
> Rollback riêng bản nâng cấp giao diện: về **`25f9de6`**; rollback toàn bộ V3: vẫn theo mốc **`d524576`** trong tài liệu triển khai.

---

## 1. ĐỐI CHIẾU BACKUP 7.598 vs RESTORE-TEST 7.575 ✅ ĐÃ LÀM RÕ

| Khoản | Giá trị |
|---|---|
| Restore-test cũ (7.575) | chạy từ file backup **15:40 hôm trước** (trước lần đồng bộ dữ liệu thật 03:02) |
| Backup mới (7.598) | chạy **sau** lần đồng bộ ⇒ **+23 bản ghi** = **+3 org_units +1 people +18 person_assignments +1 audit_events** |
| **Restore-test mới** | chạy lại từ **đúng file backup mới** (`prod-pre-reset-2026-10-22-120532.json`, sha256 `510d7274…`) vào DB riêng `talung_restore_check` |
| Kết quả | ✅ **74/74 bảng khớp** · **7.598/7.598 bản ghi** · **0 bảng thiếu** · **0 vi phạm khóa ngoại** |
| Phục hồi lịch sử | ✅ audit 1.478 · kết quả tháng 15 · đầu việc 32 · nhiệm vụ 23 · nhật ký tác nghiệp 19 · bằng chứng 16+76 · tệp nhiệm vụ 1 — **đều khớp** |

Chi tiết từng bảng + checksum: `scripts/verify-archive.mjs` (bấm 74/74, 0 vi phạm FK).

## 2. ĐỐI CHIẾU 348 DÒNG TX → 320 MÃ ✅

| Bộ | Kết quả | File |
|---|---|---|
| Giữ | **320 mã** (mã nguồn từ danh mục cũ: `NV-01`, `TH-85`, `CBL-18`…) | `demo-ops/reset/reconciliation/tx-348-dong-320-ma.csv` |
| **Loại 28 dòng** | **lý do: trùng (bộ phận + nội dung) với dòng Excel đã có** — đủ thông tin: dòng Excel, bộ phận, nội dung, hệ số, dòng trùng đầu tiên, mã nguồn | `tx-28-dong-bi-loai.csv` |
| Hệ số lệch | **0** (môi trường sạch đã lấy hệ số theo Excel) | `tx-4-ma-he-so-leh.csv` (0 dòng) |

> **Không tự loại công việc có ý nghĩa nghiệp vụ riêng**: 28 dòng bị loại đều là bản lặp **cùng bộ phận + cùng nội dung**; các công việc **cùng tên nhưng khác bộ phận** đều được giữ (mã khác nhau).

## 3. SNAPSHOT ĐỘC LẬP QĐ1277 ✅ (+ cảnh báo)

| Bộ | Kết quả |
|---|---|
| Sản phẩm | **3.386** (2.838 có hệ số · **548 NULL**) — CSV đầy đủ: mã, tên nhiệm vụ, sản phẩm đầu ra, hệ số, nhóm, đơn vị, trạng thái, phiên bản, STT nguồn → `qd1277-3386-san-pham.csv` |
| Nhóm | **80** → `qd1277-80-nhom.csv` |
| Manifest | `qd1277-snapshot-manifest.json` (sha256 của cả 2 CSV, số lượng, version `DM-SP-2026-V1`) |
| ⚠️ **Nguồn chính thức** | **CHƯA CÓ file Excel QĐ1277 trong workspace** — đang dùng **bản trích xuất từ DB nguồn đã kiểm chứng**. Hệ số **giữ nguyên, không suy luận**. **Cần bàn giao file gốc để đối chiếu lần cuối (blocker B-1).** |

## 4. ARCHIVE TỆP ĐÍNH KÈM ⚠️ MỘT PHẦN

| Phần | Trạng thái |
|---|---|
| **CSDL** (74 bảng / 7.598 bản ghi / audit / cấu hình) | ✅ **ĐÃ archive** + restore-test PASS (mục 1) |
| **Đối tượng tệp** (Supabase Storage) | ⚠️ **1 tệp** trong Production (`task-NV-2026-0011/27_KV16HQ100002_NGUYENTUANANH.jpg`, 2.185.864 B, storageKey + checksum đã lưu trong backup DB) — **chưa tải được về máy**: môi trường **không có `SUPABASE_SERVICE_ROLE_KEY`** (chỉ có publishable key) ⇒ không tải được đối tượng bucket private. **Cần owner cung cấp service-role key hoặc tải từ Supabase Dashboard** (blocker B-8) |

## 5. AN TOÀN TÀI KHOẢN SUPER ADMIN ✅

| Yêu cầu | Thực hiện |
|---|---|
| Mật khẩu không hardcode | ✅ sinh ngẫu nhiên 18 ký tự (`crypto.randomBytes`), **không** in ra log |
| Không lộ mật khẩu trong báo cáo/git | ✅ file `demo-ops/reset/super-admin-credentials-2026-10-22.txt` — **git-ignored** (`.gitignore:60 demo-ops/`), **không** có trong báo cáo này |
| Quyền truy cập file credential | ✅ **ACL siết**: chỉ tài khoản hiện tại (`IT-TLQM\thanhnx:(R,W)`), đã gỡ kế thừa |
| Yêu cầu thay mật khẩu ban đầu | ✅ file credential ghi rõ *"Đổi mật khẩu ngay sau lần đăng nhập đầu tiên"*; ứng dụng có sẵn hộp **Đổi mật khẩu** (Header → menu tài khoản) |
| Cơ chế phục hồi quyền quản trị | ✅ **không cần**: `scripts/reset-and-init.mjs` tạo lại `admin.tk` (idempotent) + ghi credential mới; ngoài ra có thể cấp thêm grant `SYSTEM_ADMIN` trực tiếp qua SQL (có audit) |
| Không gắn lãnh đạo / không quyền duyệt nghiệp vụ | ✅ `admin.tk` không có assignment; `SYSTEM_ADMIN` không nằm trong `canReviewAsDirectLeader` và không có `tasks.approve` |

## 6. ĐỐI CHIẾU 433/433 vs 452/452 ✅ ĐÃ LÀM RÕ

- Lần **433/433** chạy **14 bộ** — **thiếu bộ `test-yc38-datetime-tz` (19 kiểm tra)** ⇒ 433 + 19 = **452** ✔
- Lần **452/452** chạy **15 bộ** trên **DB fixture độc lập** `talung_v3_fixture` (dựng từ snapshot demo, **tách biệt** môi trường vận hành sạch) ⇒ **0 suite fail**
- Môi trường **sạch** (`talung_v3_rehearsal`, `talung_v3_demo`) **không** chứa dữ liệu thử ⇒ 7 bộ cần fixture nghiệp vụ không chạy được ở đó (đã tách riêng, **không** đưa dữ liệu mẫu vào môi trường vận hành)

## 7. KIỂM TRA BẢN V3 SẠCH ✅

| Hạng mục | Kết quả |
|---|---|
| Cơ cấu tổ chức | **8 đơn vị**: HQCK Tà Lùng · Lãnh đạo đơn vị · **Bộ phận Nghiệp vụ Hải quan** · CNTT · điều tra CBL · **Phúc tập & KTSTQ** · **TH & Báo cáo** · Công tác Đảng — ⚠️ *"TH & Báo cáo"** và "Phúc tập & KTSTQ" **KHÔNG bị gộp** (đúng yêu cầu) |
| Nhân sự | 36 (35 từ Excel + 1 admin) · 31 phân công · **chưa tạo tài khoản cho cán bộ** ✔ |
| Danh mục TX | **320 mã** / 6 nhóm ✔ |
| Danh mục QĐ1277 | **3.386 SP** (2.838 có hệ số) / 80 nhóm ✔ |
| Dữ liệu nghiệp vụ | **0** kế hoạch · 0 nhiệm vụ · 0 đầu việc · 0 nhật ký tác nghiệp · 0 kết quả tháng · 0 mẫu cũ · 0 thông báo ✔ |
| Tài khoản | **1** (admin.tk / SYSTEM_ADMIN) ✔ |
| **Tuyến phê duyệt chưa có phân công** | ✅ `person_supervisions` = **0** ⇒ hồ sơ **chờ phân tuyến**, **không tự duyệt** (không cấp quyền) ✔ |
| Biểu mẫu F19 | ✅ trang Nhật ký tác nghiệp **không còn** selector 48 mẫu cũ; chỉ có `RoutineCatalogPicker` (TX + SP nhiều mã); mã giả `KPS-01`/`TTHQ-01` chỉ còn trong **comment** ✔ |

## 8. BÁO CÁO GO/NO-GO

### 🔴 NO-GO cho EXECUTE — 5 blocker cần xử lý

| # | Blocker | Chủ dự án cần làm |
|---|---|---|
| **B-1** | **File Excel QĐ1277 gốc chưa có** trong workspace | Bàn giao file gốc → đối chiếu 3.386 SP + 2.838 hệ số với bản trích xuất (`qd1277-3386-san-pham.csv`) |
| **B-8** | **Đối tượng tệp trong Storage chưa archive** (1 tệp) | Cung cấp `SUPABASE_SERVICE_ROLE_KEY` hoặc tải tện từ Supabase Dashboard vào `demo-ops/reset/reconciliation/prod-files/` |
| **B-3** | **Tuyến phê duyệt chưa có** (`person_supervisions` = 0) | Xác nhận *Trưởng nhóm* theo từng bộ phận → ghi vào `person_supervisions`; **không tự suy từ chức danh** |
| **B-2** | **Chưa có ràng buộc đơn vị ↔ biểu mẫu** (schema chưa có trường liên kết) | Quyết định cơ chế cấu hình biểu mẫu theo bộ phận/loại nghiệp vụ (hiện dùng biểu mẫu ghi nhận cơ bản) |
| **B-6** | **Chưa cấp tài khoản cho 35 cán bộ** | Quy trình cấp tài khoản theo từng đợt (Super Admin thực hiện) |

### Manifest dữ liệu (đã sinh)

| File | Nội dung |
|---|---|
| `demo-ops/reset/reset-manifest-rehearsal-*.json` | Đối chiếu reset (bảng đã xoá, bảng đã tạo, ghi chú lệch) |
| `demo-ops/reset/reconciliation/tx-348-dong-320-ma.csv` | 320 mã TX giữ (mã nguồn, hệ số Excel, hệ số cũ) |
| `demo-ops/reset/reconciliation/tx-28-dong-bi-loai.csv` | 28 dòng loại + lý do + dòng trùng + mã nguồn |
| `demo-ops/reset/reconciliation/qd1277-3386-san-pham.csv` / `qd1277-80-nhom.csv` | Snapshot SP + nhóm (có sha256) |
| `demo-ops/reset/reconciliation/prod-files-manifest.json` | Manifest tệp đính kèm |
| `demo-ops/yc38c-backup/prod-pre-reset-2026-10-22-*.json` | **Archive Production** (74 bảng / 7.598 bản ghi / sha256 `510d7274…`) |
| `demo-ops/yc38c-backup/demo-before-reset-*.json` | Snapshot DB demo trước khi dọn |

### Phiên bản cần phát hành

| Thành phần | Phiên bản |
|---|---|
| Mã ứng dụng | `feature/v3-demo` @ `67a2e84` (F18) + `0d5cb21` (reset/F19) + commit PREPARE này — **chưa merge, chưa deploy** |
| Schema | migration `20261021160000_v3_work_item_review` + `20261021200000_v3_multi_product` (F18) + `20261022120000_v3_routine_f18` ⇒ **3 migration phải chạy** (hoặc 1 migration gộp, cần chủ dự án chọn) |
| Kích thước DB mới | ~8 đơn vị · 36 người · 320 TX · 3.386 SP · 1 tài khoản · 0 nghiệp vụ |

### Maintenance window (đề xuất)

1. **T-1 ngày**: duyệt checklist (§9) + bàn giao file QĐ1277 gốc + key storage.
2. **T-0 (30–45 phút)**: maintenance notice → dừng luồng ghi (chặn ingress hoặc cờ `MAINTENANCE_MODE`) → backup cuối (`pg-backup-restore.mjs backup`) → **restore-test lần cuối** → chạy `reset-and-init.mjs --mode=production --confirm=RESET-2026-10-22` → đối soát manifest → smoke test (đăng nhập admin, tạo 1 hồ sơ thử, xoá) → bỏ maintenance → theo dõi log 30 phút.
3. **Rollback dữ liệu**: `pg-backup-restore.mjs restore --db=<Production> --file=prod-pre-reset-<...>.json` (đã kiểm chứng 74/74 bảng) — thời gian đo được: **restore 7.598 bản ghi ≈ 2–4 phút** → nằm trong maintenance window.
4. **Rollback mã về đúng `d524576`** (nếu cần gỡ toàn bộ V3): xem `docs/V3/DEPLOY_PRODUCTION_V3_2026-10-22.md` §6 — phương án A `git revert --no-commit d524576..6b0fa94` (đã kiểm chứng: cây mã sau revert giống hệt `d524576`, không cần force-push) hoặc phương án B `git reset --hard d524576 && git push --force-with-lease origin main`. **Không** dùng `git revert 6b0fa94` (chỉ gỡ commit PREPARE, mã V3 vẫn còn).

## 9. CHECKLIST PHẢI PHÊ DUYỆT TRƯỚC EXECUTE

- [ ] Bàn giao **file QĐ1277 gốc** → đối chiếu với `qd1277-3386-san-pham.csv` (B-1)
- [ ] Cung cấp `SUPABASE_SERVICE_ROLE_KEY` **hoặc** tải 1 tệp đính kèm về `prod-files/` (B-8)
- [ ] Xác nhận **8 đơn vị** + **35 nhân sự** (tên, chức danh, kiêm nhiệm) + 31 phân công
- [ ] Xác nhận **320 mã TX** (file `tx-348-dong-320-ma.csv`) + 28 dòng loại (`tx-28-dong-bi-loai.csv`)
- [ ] Chốt **tuyến phê duyệt** (`person_supervisions`) theo từng bộ phận (B-3)
- [ ] Quyết định cơ chế **biểu mẫu theo bộ phận** (B-2)
- [ ] Chốt **quy trình cấp tài khoản** cho 35 cán bộ (B-6)
- [ ] Xác nhận **mật khẩu Super Admin** (đọc từ file credential cục bộ) + kế hoạch đổi mật khẩu
- [ ] Phê duyệt **3 migration** (hoặc gộp) + `maintenance window` + backup cuối + phương án rollback
- [ ] Phát lệnh **EXECUTE** riêng (`--mode=production --confirm=RESET-2026-10-22`)

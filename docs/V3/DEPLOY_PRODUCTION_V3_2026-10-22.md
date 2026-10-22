# TALUNG-CUS-WORK — TRIỂN KHAI V3 LÊN PRODUCTION (báo cáo)

**Ngày:** 22/10/2026 · **Production:** https://task-cus.vercel.app
**Commit đã deploy:** **`6b0fa94`** (main, fast-forward từ `d524576`) · **Schema:** đã áp additive

---

## 1. KẾT QUẢ 5 GATE

| Gate | Kết quả |
|---|---|
| 1 — Kiểm tra trước deploy | ✅ commit V3 đầy đủ (15 commit, không bỏ sót F18/F19) · `main` = `d524576` → FF → `6b0fa94` · **KHÔNG** dùng `migrate deploy` (bảng `_prisma_migrations` của Production **rỗng** ⇒ `migrate deploy` sẽ chạy `0_init` và phá dữ liệu) → dùng **`prisma db push` additive** · typecheck ✅ · build ✅ · **452/452** test ✅ · **không** chạy seed DEMO trên Production |
| 2 — Backup & rollback | ✅ Backup Production mới: `prod-predeploy-2026-10-22-123725.json` — 74 bảng / **7.598 bản ghi** / sha256 `6bdedfd6…` · restore-test trên bản sao: **74/74 bảng khớp, 0 vi phạm FK** · **thử migration trên bản sao** (DB schema V2 = `d524576` + dữ liệu Production): `db push` V3 ⇒ **74/74 bảng giữ nguyên số lượng**, chỉ thêm cột/bảng; **rollback** (restore) ⇒ 7.598 bản ghi nguyên vẹn · **kho lưu trữ tệp hoàn tất**: 1 tệp đính kèm tải về (`2.185.864 B`, sha256 `546eede3…`) — publishable key tải được object bucket |
| 3 — Đồng bộ an toàn | ✅ **KHÔNG** chạy `reset-and-init.mjs --mode=production` · **KHÔNG** xoá/thay thế dữ liệu vận hành · mọi bản ghi cũ **giữ nguyên**, `review_state` cũ = NULL ⇒ giao diện hiện *"chưa gửi lãnh đạo"* (không trình bày như đã nghiệm thu dưới V3) |
| 4 — Triển khai | ✅ schema additive áp lên Production (10,8 s) → đối chiếu **74/74 bảng không đổi** → merge FF `d524576..6b0fa94` → push `main` → Vercel auto-deploy → **`6b0fa94` live lúc 12:42:35** (`/api/health`: `status=ok`, `db=up`) |
| 5 — Smoke test | ✅ 10/10 API có xác thực (200) · ✅ 13/13 kiểm thử ghi có kiểm soát · ✅ dữ liệu thử **dọn sạch 0/0** · trang đăng nhập render OK |

## 2. MIGRATION ĐÃ ÁP DỤNG (additive, không xoá)

| Thành phần | Nội dung |
|---|---|
| `personal_work_items` | + `review_state`, `result_text`, `completed_at`, `submitted_at/by`, `reviewed_at/by`, `review_note`, `submit_count` |
| `work_item_products` | + `review_state`, `proposed_by/at`, `confirmed_by/at`, `quantity_unit`, `factor_snapshot`, `factor_source` |
| `routine_entries` | + `catalog_entry_id`, `product_item_id`, `proposed_products`, `source_kind`, `source_ref_id`, `source_code_snapshot`, `review_state`, `data_origin` + 6 index |
| `work_evidences` | + `status`, `superseded_by_id`, `withdrawn_note` |
| Bảng mới | `work_item_reviews`, `work_evidence_adjustments` |

> Ghi chú: Production được dựng bằng `db push` (không có lịch sử migration) ⇒ hệ thống **tiếp tục dùng `db push`** để đồng bộ schema. Không có `DROP`/`TRUNCATE`.

## 3. CHỨC NĂNG ĐÃ HOẠT ĐỘNG TRÊN PRODUCTION

| Nhóm | Trạng thái |
|---|---|
| Luồng cán bộ báo kết quả → lãnh đạo xác nhận (DRAFT→SUBMITTED→RETURNED→CONFIRMED) | ✅ |
| Khoá chỉnh sửa khi chờ duyệt / đã xác nhận (409) | ✅ |
| **Cán bộ tự duyệt công việc của mình** | ✅ bị chặn (403) |
| Nhiều SP QĐ1277 / xác nhận từng SP độc lập | ✅ |
| Kết quả tháng: DỰ THẢO vs đủ điều kiện chính thức + bản nháp | ✅ |
| Trung tâm cấu hình phân quyền (5 nhóm) | ✅ |
| Lịch sử phê duyệt lãnh đạo (4 tab + lọc) | ✅ |
| Nhật ký tác nghiệp F18/F19 (chỉ TX mới, nhiều SP, không mẫu cũ) | ✅ |
| Quy trình R3-C 2 cấp (đề nghị → xem xét → phê duyệt) | ✅ |
| Danh mục TX 348 mã · QĐ1277 3.386 SP | ✅ (giữ nguyên dữ liệu đang chạy) |

## 4. TẠM KHÓA (thiếu dữ liệu / phân quyền — **không** tự cấp quyền)

| # | Nội dung | Lý do |
|---|---|---|
| 1 | Tuyến phê duyệt cho 35 cán bộ thật | `person_supervisions` chưa có (chờ chủ dự án xác nhận *Trưởng nhóm* theo từng bộ phận) → hồ sơ **chờ phân tuyến**, không tự duyệt |
| 2 | Tài khoản đăng nhập cho 35 cán bộ | Super Admin sẽ cấp theo từng đợt (chưa tự tạo) |
| 3 | Bản xuất báo cáo **dự thảo** riêng | Nhãn DỰ THẢO đã có ở bảng; nút xuất riêng chưa làm (V3.0.3) |
| 4 | Cờ "SP áp dụng số lượng" + đơn vị tính chính thức | Chưa có quy định; UI ghi rõ *"chưa có (cần đối chiếu)"*, không suy luận |
| 5 | File Excel nguồn QĐ1277 gốc | Chưa có trong workspace → dùng bản trích xuất đã kiểm chứng (`qd1277-3386-san-pham.csv` + sha256) |
| 6 | Biểu mẫu theo bộ phận (F19.7) | Schema chưa có ràng buộc đơn vị ↔ biểu mẫu → hiện dùng biểu mẫu ghi nhận cơ bản |

## 5. KẾT QUẢ KIỂM THỬ

| Bộ | Kết quả |
|---|---|
| typecheck (`tsc --noEmit`) | ✅ exit 0 |
| build (`npm run build`) | ✅ exit 0 — `Compiled successfully` |
| **15 bộ regression** (DB fixture độc lập) | ✅ **452 pass / 0 fail** (gồm parity 38/38) |
| Smoke đọc có xác thực trên Production | ✅ **10/10** (org tree · people · work-catalog · products · admin/permissions · personal-work-items · routine · monthly-results · review-queue · tasks) |
| Smoke ghi có kiểm soát trên Production | ✅ **13/13**: tạo → DRAFT (không tự duyệt) → gửi → SUBMITTED → **tự duyệt bị chặn 403** → khoá sửa 409 → lãnh đạo xác nhận → CONFIRMED → lịch sử P1 thấy hồ sơ → tạo kết quả tháng → **dọn sạch 0/0** |
| Số lượng bảng Production sau deploy | **không đổi** (plans 5 · tasks 23 · work items 32 · routine 19 · monthly 15 · accounts 24 · people 39 · org 11 · TX 348 · SP 3.386); chỉ `audit_events` +7 (dấu vết kiểm thử) và `notifications` +1 |

## 6. ROLLBACK

```bash
# 1) Mã: revert commit đang chạy rồi push main
git revert 6b0fa94 && git push origin main      # Vercel auto-deploy lại bản trước
# 2) Schema + dữ liệu: khôi phục từ backup đã kiểm chứng (74/74 bảng, 0 vi phạm FK)
node scripts/pg-backup-restore.mjs restore --db=<url Production> \
  --file=demo-ops/yc38c-backup/prod-predeploy-2026-10-22-123725.json
```
Thời gian rollback đo được: restore 7.598 bản ghi ≈ **2–4 phút**; deploy mã ≈ **2–4 phút**.

## 7. LỖI CẦN SỬA TRỰC TIẾP TRÊN PRODUCTION (ghi nhận)

| # | Hiện tượng | Mức | Ghi chú |
|---|---|---|---|
| 1 | Bộ test chạy bằng **mật khẩu** không vào được Production (mật khẩu demo đã đổi) | 🟡 | Dùng token ký sẵn cho smoke; nên có tài khoản kiểm thử riêng do chủ dự án cấp |
| 2 | `routine_entries.review_state` của dữ liệu cũ = NULL ⇒ hiển thị *"chưa gửi lãnh đạo"* | 🟡 | Đúng yêu cầu (không trình bày dữ liệu cũ như đã nghiệm thu V3) — sẽ tự rõ khi dữ liệu cũ được dọn theo lệnh reset riêng |
| 3 | 3 bộ test ghi trên Production thoát do đăng nhập | 🟢 | **Không để lại dữ liệu** (chỉ +3 audit); đã xác nhận số lượng bảng nguyên vẹn |
| 4 | Hợp đồng lao động 111 / đơn vị "TH & Báo cáo" còn bất định | 🟡 | Chờ quyết định nghiệp vụ (B-4/B-5) |

## 8. KẾ HOẠCH RESET DỮ LIỆU SẠCH (chưa thực hiện — chờ lệnh riêng)

Theo `docs/V3/GO_NO_GO_BAN_GIAO_2026-10-22.md`: script `reset-and-init.mjs --mode=production --confirm=RESET-2026-10-22` đã sẵn sàng, rehearsal PASS, nhưng **CHƯA chạy**. 5 blocker còn lại (B-1 file QĐ1277 gốc · B-8 kho tệp · B-3 tuyến phê duyệt · B-2 biểu mẫu theo bộ phận · B-6 cấp tài khoản) cần chủ dự án xác nhận trước.

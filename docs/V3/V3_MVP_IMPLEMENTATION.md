# TALUNG-CUS-WORK — V3 MVP KẾ HOẠCH TRIỂN KHAI (V3.0.1 → V3.0.3)

**Nhánh:** `feature/v3-demo` (từ `d524576`) · **Môi trường demo:** DB local riêng `talung_v3_demo` (khởi tạo từ bản sao backup Production, **không** dùng kết nối Production) · **Kết quả:** V3.0.1 **đã chạy được & đã kiểm thử**.

---

## 1. V3.0.1 — LUỒNG CÁN BỘ → LÃNH ĐẠO TRỰC TIẾP (ĐÃ XONG)

### 1.1. Thay đổi mã nguồn

| File | Nội dung |
|---|---|
| `prisma/schema.prisma` | +9 cột trên `personal_work_items` (`review_state`, `result_text`, `completed_at`, `submitted_at`, `submitted_by_id`, `reviewed_at`, `reviewed_by_id`, `review_note`, `submit_count`); + model `work_item_reviews` (lịch sử) |
| `prisma/migrations/20261021160000_v3_work_item_review/migration.sql` | SQL **additive** (thêm cột + tạo bảng + index + FK), **không** sửa dữ liệu cũ |
| `src/server/work-item-review.ts` | **MẠI LÕI**: máy trạng thái, nhãn hiển thị, quyền lãnh đạo trực tiếp (A1), ghi lịch sử, thông báo, audit |
| `src/app/api/personal-work-items/[id]/review/route.ts` | API gửi / xác nhận / trả lại (`POST`, action = SUBMIT \| RETURN \| CONFIRM) |
| `src/app/api/personal-work-items/review-queue/route.ts` | Hàng đợi hồ sơ chờ xác nhận (chỉ trả về phần người đăng nhập có quyền) |
| `src/app/api/personal-work-items/route.ts` | PATCH ⇒ **409** khi hồ sơ `SUBMITTED`/`CONFIRMED` (D1-A) |
| `src/app/api/work-evidence/route.ts`, `.../[id]/route.ts` | Thêm/xoá minh chứng ⇒ **409** khi `SUBMITTED`/`CONFIRMED` (R3) |
| `src/app/my-work/WorkItemReviewBox.tsx` | **MỚI**: nhãn trạng thái + hộp thoại "Báo hoàn thành & gửi lãnh đạo" (nội dung kết quả **bắt buộc** + ngày hoàn thành thực tế) |
| `src/app/my-work/MyWorkItemsSection.tsx` | Gắn `WorkItemReviewBox` vào thẻ công việc; nhận thêm trường trạng thái V3 |
| `src/app/work-item-reviews/page.tsx` | **MỚI**: trang lãnh đạo — xem hồ sơ chờ, **Xác nhận** / **Trả lại** (bắt buộc lý do) |
| `src/config/navigation.ts` | Thêm mục "Xác nhận công việc" (`/work-item-reviews`, chỉ lãnh đạo) |
| `scripts/v3-demo-seed.ts` | **MỚI**: chuẩn bị dữ liệu demo (mật khẩu demo, quan hệ phụ trách, đầu việc thử) |
| `scripts/test-v3-review-flow.ts` | **MỚI**: 38 kiểm tra tích hợp toàn luồng |

### 1.2. Kết quả kiểm thử

| Bộ | Kết quả |
|---|---|
| `test-v3-review-flow` (luồng V3.0.1) | **38 / 0** |
| `test-yc38-f12-date-mapping` | 30 / 0 |
| `test-yc38-datetime-tz` | 19 / 0 |
| `test-yc38-locked-task` | 15 / 0 |
| `test-yc38-submit-approval` | 36 / 0 |
| `test-yc38c-linkage` | 28 / 0 |
| `test-yc38-uat-origin-tx` | 23 / 0 |
| `test-yc33-scoring-parity` | **38 / 0** (parity không đổi) |
| `test-yc30-regression` | 56 / 0 |
| typecheck / build | exit 0 / `Compiled successfully` |

### 1.3. Đã kiểm tra thực tế trên giao diện (trình duyệt)

1. Cán bộ chọn đầu việc → bấm **"Báo hoàn thành & gửi lãnh đạo"** → nhập nội dung kết quả + ngày 21/10/2026 → gửi ⇒ thẻ công việc hiện **"Đã gửi — chờ lãnh đạo xác nhận"**, hoàn thành **21/10/2026**.
2. Lãnh đạo mở `/work-item-reviews` ⇒ thấy hồ sơ kèm nội dung kết quả → **Trả lại** (có lý do) ⇒ hồ sơ rời hàng đợi.
3. Cán bộ thấy **"Lãnh đạo trả lại: …"** → **Sửa kết quả & gửi lại** ⇒ `submitCount = 2`.
4. Lãnh đạo **Xác nhận hoàn thành** ⇒ `reviewState = CONFIRMED`, hàng đợi trống.
5. API kiểm tra bằng chứng: sửa khi chờ/đã xác nhận ⇒ **409**; thêm minh chứng ⇒ **409**; người không phải lãnh đạo trực tiếp ⇒ **403**; gửi trùng ⇒ **409**.

---

## 2. MÔI TRƯỜNG DEMO (tách biệt tuyệt đối)

| Thành phần | Production | Demo V3 |
|---|---|---|
| DB | Supabase pooler (`.env`) | PostgreSQL local `talung_v3_demo` (khởi tạo từ bản sao backup) |
| Storage | Supabase Storage | `./.local-storage` (`STORAGE_DRIVER=local` theo `.env.local`) |
| Biến môi trường | `.env` | `DATABASE_URL`/`DIRECT_URL` ghi đè khi khởi động server |
| Tài khoản demo | mật khẩu đã đổi | `democb01` / `democb02` / `demold01` — `LocalTest@2026` |
| Lệnh chạy | — | `$env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"; $env:DIRECT_URL=$env:DATABASE_URL; npx next start -p 3100` |
| Chuẩn bị dữ liệu | — | `npx tsx scripts/v3-demo-seed.ts` |

> **Không** có Preview Vercel nào trỏ tới DB/storage Production. Cấu hình tách biệt cho Preview **chưa công bố** — chỉ mở sau khi chủ dự án xác nhận an toàn.

---

## 3. V3.0.2 — NHIỀU SẢN PHẨM QĐ1277 / XÁC NHẬN TỪNG SP (KẾ HOẠCH)

**Bối cảnh hiện có (tái sử dụng, không viết lại):** `work_item_products` (1 đầu việc ↔ N sản phẩm) đã có từ YC-38C; `work_evidence.productItemId` chưa có → cần thêm cột liên kết SP; bộ chọn TX/SP dùng chung đã có.

| Hạng mục | Việc cần làm | Ghi chú |
|---|---|---|
| Nhiều SP trên 1 công việc | Dùng `work_item_products`; cho phép thêm nhiều SP | Không đụng `src/server/scoring/**` |
| Xác nhận **từng SP** | Trạng thái xác nhận **riêng theo từng SP** (bảng `work_item_product_reviews` hoặc cột trạng thái trên `work_item_products`) | Chỉ khi tất cả SP xác nhận ⇒ công việc `CONFIRMED` |
| SP chưa có | Công việc vẫn ghi nhận được, phần SP để **"chờ đối chiếu"** (`PENDING_RULE` sẵn có) | Không tự chọn hệ số |
| Công chức **đề xuất mã SP** | Cho phép cán bộ chọn/đề xuất SP; lãnh đạo xác nhận hoặc sửa | Không tự sửa hệ số gốc danh mục |
| Bổ sung SP **sau nghiệm thu** | Quy trình riêng: đề nghị → lãnh đạo trực tiếp → trưởng bộ phận (theo R3-C) | Không tự ý mở khóa |
| **Điểm dự thảo** tách khỏi điểm chính thức | Tận dụng `status`/`reasons` sẵn có của `bang1.ts`; chỉ thêm ranh giới & nhãn | **Không** viết lại bộ máy tính điểm |
| Hệ số | Không đặt công thức/hệ số chưa được phê duyệt | Chờ Q-B4 |

**Tiêu chí nghiệm thu:** 1 công việc 3 SP → lãnh đạo xác nhận SP1, SP2, còn SP3 chờ ⇒ trạng thái hiển thị đúng; điểm dự thảo ≠ điểm chính thức; parity tính điểm **không đổi**.

---

## 4. V3.0.3 — KẾT QUẢ THÁNG, BIỂU MẪU, MINH CHỨNG & R3-C (KẾ HOẠCH)

| Hạng mục | Việc cần làm | Ghi chú |
|---|---|---|
| Kết quả tháng ↔ Bảng 1 ↔ 01A/01B/02A/02B | Nối trạng thái xác nhận của đầu việc vào luồng tính điểm & xuất biểu | Chỉ `CONFIRMED` mới vào điểm chính thức (A) |
| Xuất báo cáo **dự thảo** | Biểu dự thảo có nhãn, **không** dùng để trình ký | Cần chốt ngưỡng (E1-A) |
| Quản lý minh chứng + **R3-C** | Quy trình 2 cấp: đề nghị điều chỉnh → lãnh đạo trực tiếp xem xét → trưởng bộ phận phê duyệt; **bảo toàn** phiên bản cũ; ghi đủ lý do/người/mốc thời gian; `SYSTEM_ADMIN` không có quyền phê duyệt nghiệp vụ | Bảng `work_evidence_adjustments` (đề nghị) + `work_evidence_versions` (phiên bản) |
| Lịch sử, chống trùng, hoàn thiện phân quyền | Lịch sử hồ sơ hiển thị cho lãnh đạo; chống trùng kết quả tháng; ma trận quyền đầy đủ | Chống trùng đã có 3 lớp ở V1/V2 — giữ nguyên |
| F1-A / G1-A | Bước lãnh đạo xác nhận **mã SP + hệ số**; trường **đơn vị tính** + cờ "SP áp dụng số lượng" | Cờ danh mục cần Hải quan xác nhận |

**Ngoại lệ R3-C chưa chốt (cần đặc tả trước khi lập trình):** lãnh đạo trực tiếp kiêm trưởng bộ phận; người xác nhận vắng mặt/chuyển công tác/hết quyền; kỳ đã chốt; cơ chế từ chối/hủy/rút; thời hạn lưu vết.

---

## 5. THỨ TỰ & ĐIỀU KIỆN

```
V3.0.1  ✔ xong  (luồng cán bộ → lãnh đạo trực tiếp)
   │
   ├─► V3.0.2  (nhiều SP, xác nhận từng SP, điểm dự thảo)   ← cần: danh sách "SP áp dụng số lượng" từ Hải quan
   │      │
   │      └─► V3.0.3 (kết quả tháng, biểu mẫu, minh chứng, R3-C)  ← cần: ngoại lệ R3-C, ngưỡng E1-A
   │
   └─► Mỗi đợt: code → test local/scratch → UAT giao diện → báo cáo → DỪNG chờ phê duyệt
```

**Ràng buộc bất biến:** không merge vào `main`, không push/deploy Production, không sửa schema/dữ liệu Production, không tự chốt quy tắc điểm hay thẩm quyền chưa được phê duyệt.

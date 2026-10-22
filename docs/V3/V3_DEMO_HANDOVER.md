# TALUNG-CUS-WORK — V3 DEMO · BÀN GIAO CHO UAT

**Ngày:** 21/10/2026 · **Nhánh:** `feature/v3-demo` · **Production:** `d524576` (**không đụng**)
**Trạng thái:** V3.0.1 → V3.0.3 (điểm dừng tại mốc DEMO) — **không merge `main`, không push, không deploy**.

---

## 1. MÔI TRƯỜNG DEMO

| Hạng mục | Giá trị |
|---|---|
| **URL** | **http://localhost:3100** |
| **DB** | `talung_v3_demo` — bản sao local của dữ liệu Production + schema V3 (**không** phải Production) |
| **Kho minh chứng** | `./.local-storage` (local) — **không** dùng Supabase Storage |
| **Tài khoản cán bộ** | `democb01` / `LocalTest@2026` — Cán bộ DEMO 01 (chủ công việc) |
| **Tài khoản lãnh đạo** | `demold01` / `LocalTest@2026` — Lãnh đạo trực tiếp (Quản trị đơn vị) |
| **Tài khoản thứ 2** | `democb02` / `LocalTest@2026` — dùng để thử **sai vai trò** |
| **Tài khoản quản trị demo** | `demold01` (UNIT_LEADER, có `org.manage`) — vào **Quản trị hệ thống → Phân quyền** |

**Khởi động lại (nếu server tắt):**
```powershell
cd D:\thanhnx\OpenCode\talung-cus-work
demo-ops\start-v3-demo.cmd
```
> Lệnh này đặt sẵn `DATABASE_URL=…talung_v3_demo`, `STORAGE_DRIVER=local`, `ALLOW_LOCAL_EVIDENCE=1`.
> **Không** khởi động server mà không đặt biến môi trường — `.env` mặc định trỏ **Production**.
> Chuẩn bị lại dữ liệu demo: `npx tsx scripts/v3-demo-seed.ts` (đặt mật khẩu demo, quan hệ phụ trách, đầu việc + 3 mã SP đề xuất).

---

## 2. TÍNH NĂNG ĐẠT ✅ / CHƯA ĐẠT ❌

| Hạng mục | Trạng thái | Bằng chứng |
|---|---|---|
| Cán bộ tạo/nhận công việc, cập nhật tiến độ | ✅ | `test-v3-review-flow` |
| Báo hoàn thành: **bắt buộc nội dung kết quả** + **chọn ngày thực tế** | ✅ | 400 khi thiếu nội dung/ngày |
| Gửi lãnh đạo trực tiếp; **khoá chỉnh sửa + khoá minh chứng** khi chờ | ✅ | 409 khi sửa/thêm minh chứng |
| Lãnh đạo **xác nhận** hoặc **trả lại** (bắt buộc lý do) | ✅ | 400 khi thiếu lý do |
| Trả lại ⇒ cán bộ sửa & gửi lại (đếm số lần gửi) | ✅ | `submitCount` tăng dần |
| Xác nhận ⇒ khoá kết quả + ghi lịch sử đầy đủ | ✅ | bảng `work_item_reviews` |
| **Nhiều mã SP QĐ1277** trên một công việc | ✅ | `test-v3-multi-product` (3 SP) |
| **Xác nhận từng SP độc lập** (xác nhận SP1 không xác nhận SP2) | ✅ | kiểm tra trạng thái từng SP |
| Công chức **đề xuất mã SP**, lãnh đạo xác nhận mã + hệ số (chụp hệ số, không sửa danh mục) | ✅ | `factorSnapshot` |
| SP chưa xác nhận ⇒ **không** đủ điều kiện tính điểm chính thức | ✅ | `officialState = SP_PENDING` |
| Bổ sung SP **sau nghiệm thu** | ⚠️ **MỞ** | đã khoá đúng (409) + hướng dẫn; **quy trình riêng chưa có** (xem blocker B1) |
| Kết quả tháng: **bản nháp** tự hình thành, không tạo trùng | ✅ | `drafts` trong API, không ghi bản ghi |
| Phân biệt **DỰ THẢO** vs **đủ điều kiện chính thức** | ✅ | nhãn trên từng dòng (8/8 dòng lịch sử = DỰ THẢO) |
| Tái sử dụng bộ máy Bảng 1, **parity 38/38 giữ nguyên** | ✅ | `test-yc33-scoring-parity` |
| **Trung tâm cấu hình phân quyền** (5 nhóm A–E) | ✅ | kiểm tra trình duyệt: 24 tài khoản, 2 ma trận, 25 lượt cấp quyền |
| Cấp/thu hồi vai trò qua API có kiểm tra, có nhật ký, có thời hạn | ✅ | 24 kiểm tra bảo mật |
| **Sửa lỗ hổng**: role hết hạn vẫn có hiệu lực | ✅ | đã sửa ở `src/server/auth.ts` |
| R3-C: đề nghị → lãnh đạo xem xét → trưởng bộ phận phê duyệt, giữ bản cũ | ✅ | 21 kiểm tra; 2 cấp trùng người ⇒ **khoá** |
| **Xuất báo cáo dự thảo** (bản riêng có nhãn DỰ THẢO) | ❌ **CHƯA** | dùng được nhãn DỰ THẢO trên bảng; **chưa** có nút xuất bản dự thảo riêng (B2) |
| Bảng 1 / 01A / 01B / 02A / 02B dùng **điểm chính thức** | ⚠️ **MỘT PHẦN** | engine không đổi (parity giữ nguyên) nhưng chưa tách cờ "đủ điều kiện" vào phép tổng hợp (B3) |
| Cờ "SP áp dụng số lượng" lấy từ danh mục | ❌ **CHƯA** | chưa có quy tắc danh mục được phê duyệt (B4) |

---

## 3. KỊCH BẢN UAT THEO VAI TRÒ (≈15 phút)

### Vai trò CÁN BỘ — `democb01` / `LocalTest@2026`
1. Vào **Nhật ký công việc** → tìm thẻ **`[V3-DEMO] Kiểm tra hồ sơ thu nghiệm V3.0.1`** (hạn = **hôm nay**, đã cập nhật theo ngày chạy demo).
2. Mở mục **"3 sản phẩm"** → xem 3 mã SP ở trạng thái *"Chờ lãnh đạo xác nhận"*.
3. Bấm **"Báo hoàn thành & gửi lãnh đạo"** → nhập nội dung kết quả + ngày hoàn thành thực tế → **Gửi lãnh đạo xác nhận**.
   - **Kỳ vọng**: thẻ hiện *"Đã gửi — chờ lãnh đạo xác nhận"*; nút sửa hạn / thêm minh chứng **bị khoá** (409).
4. Thử lại **"Báo hoàn thành & gửi lãnh đạo"** → hệ thống báo đã gửi rồi (chống trùng).

> **Lưu ý F01 (đã sửa):** công việc **tự ghi nhận** **không còn** nút "Đánh dấu hoàn thành" — chỉ còn **một** luồng *"Báo hoàn thành & gửi lãnh đạo"*. Nút đánh dấu hoàn thành cũ chỉ còn với công việc **đã gắn nhiệm vụ** (lãnh đạo duyệt theo luồng nhiệm vụ). API cũng **khoá** việc tự gán ngày hoàn thành/trạng thái COMPLETED cho công việc tự ghi nhận (409) để không tự xác nhận nghiệp vụ.

### Vai trò LÃNH ĐẠO — `demold01` / `LocalTest@2026`
5. Menu **"Xác nhận công việc"** (`/work-item-reviews`) → thấy hồ sơ của Cán bộ DEMO 01.
6. Mục **"Sản phẩm QĐ1277"** → **xác nhận từng SP riêng**; bấm "Xác nhận mã SP" cho 1 SP → kiểm tra **SP khác vẫn chờ**.
7. Bấm **"Trả lại để chỉnh sửa"** (nhập lý do) → hồ sơ rời hàng đợi.
8. Quay lại `democb01` → thấy *"Lãnh đạo trả lại: …"* → **"Sửa kết quả & gửi lại"** → gửi lại.
9. Quay lại `demold01` → **"Xác nhận hoàn thành"** → hồ sơ rời hàng đợi, kết quả **khoá**.

### Vai trò SAI (kiểm tra phân quyền)
10. Đăng nhập `democb02` → mở **"Xác nhận công việc"** → **không thấy** hồ sơ của người khác; thao tác trực tiếp qua API cũng bị **403**.

### Quản trị phân quyền — `demold01`
11. **Quản trị hệ thống → Phân quyền** (`/admin/permissions`):
    - **Tài khoản**: 24 tài khoản, vai trò, phạm vi, thời hạn hiệu lực.
    - **Vai trò & quyền**: ma trận quyền theo chức năng + ma trận thao tác.
    - **Phạm vi quản lý**: đơn vị + quan hệ quản lý trực tiếp (nền của quyền xác nhận).
    - **Cấp & thu hồi**: cấp vai trò (có thời hạn) / thu hồi; **"Quản trị hệ thống" bị khóa** (chưa có quy định ai được cấp).
    - **Nhật ký phân quyền**: ai làm gì, trước/sau, thời điểm.

### Kết quả tháng
12. **Kết quả & báo cáo → Kết quả công tác tháng** (tháng 10/2026) → mỗi dòng có nhãn **"DỰ THẢO — chưa đủ điều kiện tổng hợp chính thức"** (vì lịch sử chưa có công việc nào được lãnh đạo xác nhận trong hệ thống cũ).

---

## 4. BLOCKER CÒN LẠI (cần quyết định của chủ dự án)

| # | Blocker | Ảnh hưởng | Đề xuất |
|---|---|---|---|
| **B1** | **Quy trình bổ sung SP sau nghiệm thu** (Q-B4/A-2) chưa có; hiện hệ thống **khoá** đúng (409) và hướng dẫn người dùng | Không thêm SP cho công việc đã xác nhận | Tái dùng quy trình 2 cấp của R3-C (đề nghị → lãnh đạo → trưởng bộ phận) cho bổ sung SP |
| **B2** | **Báo cáo dự thảo** chưa có bản xuất riêng có nhãn DỰ THẢO (hiện chỉ có nhãn ở bảng) | Báo cáo in ra chưa phân biệt dự thảo/chính thức | Thêm lựa chọn "Bản dự thảo" ở bảng xuất 01A/02A, in nhãn DỰ THẢO |
| **B3** | Chưa đưa cờ "đủ điều kiện tổng hợp" vào phép tổng hợp điểm (bộ máy Bảng 1 **không sửa** để giữ parity) | Điểm hiện tại chưa tự động loại dòng chưa xác nhận | Chỉ thực hiện khi Q-B4 chốt điều kiện "đủ xác nhận để vào điểm chính thức" |
| **B4** | Chưa có quy tắc danh mục "SP áp dụng số lượng" + đơn vị tính chính thức | Đơn vị tính do người nhập khai, gắn nhãn *"cần đối chiếu"* | Hải quan xác nhận danh sách SP + đơn vị |
| **B5** | **`Q-B4/A, A-1…A-4`**: không tìm thấy bản gốc trong workspace (đã quét toàn bộ `docs/`) | Cơ sở định nghĩa 4 quyết định V3.0.2 còn là diễn giải từ sổ tay | Chủ dự án chỉ dẫn nguồn để đối chiếu lại |
| **B6** | Ngoại lệ R3-C chưa chốt: lãnh đạo trực tiếp kiêm trưởng bộ phận; người xác nhận vắng mặt; kỳ đã chốt; cơ chế từ chối/hủy | Bước phê duyệt bị **khoá** khi trùng người (đã kiểm thử 409) | Cần quy định bố trí hai cấp |
| **B7** | **Preview/Staging Vercel**: chưa cấu hình biến môi trường tách biệt ⇒ **không push nhánh V3** (Vercel tạo Preview dùng env Production) | Chưa có URL demo trên mạng | Tạo môi trường Preview với DB + storage riêng, xác minh, rồi mới push/công bố |

---

## 5. FILE & COMMIT

| Commit | Nội dung |
|---|---|
| `49bed84` | V3.0.1 — luồng cán bộ → lãnh đạo trực tiếp (xác nhận/trả lại), khoá theo trạng thái, lịch sử |
| `974e219` | V3.1 — Trung tâm cấu hình phân quyền (5 nhóm) + **sửa lỗi role hết hạn** |
| `7102c48` | V3.2 — nhiều SP QĐ1277, xác nhận từng SP, nhãn DỰ THẢO ở kết quả tháng + bản nháp |
| `67a2e84` | V3.3 — quy trình R3-C 2 cấp (đề nghị → xem xét → phê duyệt), giữ bản minh chứng cũ |

**Tài liệu:** `docs/V3/V3_MASTER_SPEC.md` · `docs/V3/V3_MVP_IMPLEMENTATION.md` · `docs/V3/V3_DEMO_HANDOVER.md` (file này)
**Bộ kiểm thử:** `scripts/test-v3-review-flow.ts` (38) · `test-v3-permissions.ts` (24) · `test-v3-multi-product.ts` (33) · `test-v3-evidence-adjustment.ts` (21) · `test-v3-f01-f05.ts` (22) + 7 bộ hồi quy V1/V2 (245) = **383 kiểm tra, 0 fail**, parity **38/38**.

**Đợt sửa lỗi UAT (F01 + F05) — commit `f0e25c2`:**
- **F05** (nút khó nhìn): nguyên nhân gốc là theme **thiếu token `status-primary`** ⇒ class `bg-status-primary` không được sinh ⇒ nền trong suốt + chữ trắng. Đã sửa **tại theme** (dùng chung cho mọi nút) + bổ sung trạng thái hover/focus/disabled đồng nhất. Đo trên trình duyệt: nền `rgb(0,29,54)` + chữ trắng ⇒ **tương phản 7.45:1** (WCAG AAA).
- **F01** (bỏ đường hoàn thành bypass, P0): công việc tự ghi nhận chỉ còn **một** luồng "Báo hoàn thành & gửi lãnh đạo"; API khoá tự gán ngày hoàn thành/COMPLETED (409); khoá sửa khi chờ duyệt/đã xác nhận; kết quả tháng gắn công việc chưa xác nhận được đánh dấu "chờ đối chiếu". Luồng nhiệm vụ V1/V2 **giữ nguyên**.

---

## 6. PHƯƠNG ÁN PREVIEW / STAGING TÁCH BIỆT (chưa thực hiện)

1. Tạo **DB staging riêng** (Supabase project mới hoặc schema riêng) + **bucket Storage riêng** (private).
2. Tạo **Preview environment trên Vercel** với biến môi trường riêng: `DATABASE_URL`/`DIRECT_URL` (staging), `STORAGE_DRIVER=supabase` + `SUPABASE_EVIDENCE_BUCKET` (bucket riêng), `NEXT_PUBLIC_SUPABASE_URL`/key riêng.
3. Nạp dữ liệu demo từ bản sao (đã có `scripts/yc38c-restore-test.mjs` + backup) — **không** dùng dữ liệu Production.
4. Kiểm chứng: `/api/health` báo `env=preview`, `db=up`; kiểm tra kết nối DB/storage không trùng Production; rà log không có request ra Supabase Production.
5. **Chỉ khi đó** mới push nhánh `feature/v3-demo` và công bố URL Preview.
6. Rollback: xoá Preview environment + nhánh; dữ liệu Production **không** bị đụng.

---

## 7. XÁC NHẬN

- ✅ Không merge `main`; `origin/main` vẫn `d444b8e`; **không** push nhánh V3; **không** deploy Production.
- ✅ Không sửa dữ liệu/schema Production; **không** chạy test ghi vào Production; **không** reset mật khẩu Production.
- ✅ Không tự chốt quy tắc điểm hay thẩm quyền chưa được phê duyệt (Q-B4, ngoại lệ R3-C vẫn để mở, đã ghi ở mục 4).
- ✅ Sổ tay & tài liệu gốc **không** bị sửa/xoá.

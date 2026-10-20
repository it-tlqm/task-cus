# BÁO CÁO GIAI ĐOẠN 2 — YC-33 → YC-37 (đêm 20→21/10/2026)

**Base:** `efe2bde` (Giai đoạn 1) · **Production:** `https://task-cus.vercel.app`
**Commit triển khai:** `9633a43` (YC-37) · `91bd9f8` (YC-33) · `2f6f6f5` (YC-34/35/36) · `f6fb85e` (sửa hydration)

> Báo cáo này mô tả **kết quả kiểm thử tự động**. UAT nghiệp vụ do người phụ trách thực hiện sau; **không** tuyên bố UAT đã được phê duyệt.

---

## 1. YC nào đã deploy và kiểm thử đạt

| YC | Nội dung | Trạng thái | Bằng chứng kiểm thử |
|---|---|---|---|
| **YC-37** | Xem trước hồ sơ trước khi chấp thuận · Đồng ý / Không đồng ý / Yêu cầu giải trình · vòng lặp giải trình · RBAC · audit · chống bấm lặp | `DEPLOYED_AUTO_VERIFIED` | Luồng đầy đủ **25/25** (local) · Xem trước trên Production **18/18** |
| **YC-33** | Bộ máy tính điểm Bảng 1 (thuần, decimal-safe, có trạng thái) · phân biệt hệ số TX ↔ QĐ1277 · không tính trùng · snapshot kỳ | `DEPLOYED_AUTO_VERIFIED` | **Parity 38/38** với workbook gốc · Luồng DB **20/20** · Smoke Production **23/23** (chung YC-33→36) |
| **YC-34** | Xem trước + xuất Excel 01A/01B (tháng), 02A/02B (quý) theo mẫu gốc | `DEPLOYED_AUTO_VERIFIED` (bản **DỰ THẢO**) | **32/32** (chung YC-34/35/36) · Xuất file .xlsx thành công trên Production |
| **YC-36** | Tự đánh giá · gợi ý điểm tiêu chí chung · ưu điểm/hạn chế · nhận xét lãnh đạo · mức xếp loại đề xuất | `DEPLOYED_AUTO_VERIFIED` | **32/32** · Phân quyền theo từng trường được kiểm chứng trên Production |
| **YC-35** | Quan hệ phụ trách theo kỳ + bình quân lãnh đạo (đệ quy) | `DEPLOYED_AUTO_VERIFIED` (**chưa có dữ liệu phụ trách**) | **32/32** · Màn *Quản trị hệ thống → Quan hệ phụ trách* để quản trị viên tự nhập |
| YC-33 **phần quý** | Công thức tổng hợp tháng → quý | `BLOCKED_BUSINESS_RULE` | Chưa có công thức được Hải quan công bố |
| **Ngưỡng xếp loại** | Điểm → mức xếp loại | `BLOCKED_BUSINESS_RULE` | Chưa có bảng ngưỡng được phê duyệt |
| **Gợi ý tiêu chí chung** | Cơ chế gợi ý điểm | `BLOCKED_BUSINESS_RULE` | Chưa có quy tắc được phê duyệt |

---

## 2. YC nào mới là bản nháp

- **Toàn bộ biểu mẫu 01A/01B/02A/02B** là **DỰ THẢO**: ô nào chưa đủ căn cứ để trống và gắn nhãn
  `DỰ THẢO — CHƯA ĐỦ CĂN CỨ`; phần nhận xét cấp có thẩm quyền và chữ ký để trống.
- **Điểm tính thử** trên màn *Kết quả công tác tháng* là điểm **tham khảo**, chưa phải kết quả đánh giá chính thức.
- **Không có điểm xếp loại nào** được hệ thống tự đặt; mức xếp loại chỉ là lựa chọn của cán bộ.

---

## 3. YC nào thiếu công thức / cần Hải quan xác nhận

Xem `docs/TALUNG_CUS_WORK_OVERNIGHT_20261020/OPEN_QUESTIONS.md` (9 mục). Tóm tắt:

1. **Ngưỡng xếp loại** — mẫu 02A có 4 mức nhưng không có bảng điểm → mức xếp loại.
2. **Gợi ý điểm tiêu chí chung** — mẫu 01A để trống cột điểm, không có công thức gợi ý.
3. **Công thức quý** — 02A nhập tay a/b/c; chưa biết quý tổng hợp từ 3 tháng ra sao.
4. **Quan hệ phụ trách** — cần Hải quan xác nhận cơ cấu để điền vào bảng `person_supervisions`.
5. **Ánh xạ 6 nhóm danh mục TX → bộ phận** (còn từ Giai đoạn 1).
6. **Hai tên ngắn nhiều ứng viên** trong phân công bộ phận.
7. **Tên nhóm sai chính tả** trong file gốc ("Bộ **phân** Nghiệp vụ Hải quan").
8. **12 cặp tên trùng hoàn toàn** trong nhóm Nghiệp vụ Hải quan (giữ đủ 12 dòng).
9. **Số lượng nhân sự**: file 32 dòng vs sheet "Cơ cấu tổ chức" ghi 35.

---

## 4. Kết quả kiểm thử thực tế

| Bộ kiểm thử | Nơi chạy | Kết quả |
|---|---|---|
| `test-yc30-navigation.ts` | local | 192/192 |
| `test-yc30-ui.ts` (desktop + mobile) | local | 55/55 |
| `test-yc30-regression.ts` (YC-23→32) | **Production** | **56/56** |
| `test-yc30-ui.ts` | **Production** | **55/55** (sau khi sửa lỗi hydration #418 ở `/my-work`) |
| `test-yc37-approval-preview.ts` (chỉ đọc) | **Production** | **18/18** |
| `test-yc37-approval-flow.ts` (đầy đủ, có fixture) | DB local | **25/25** |
| `test-yc33-scoring-parity.ts` (đối chiếu workbook gốc) | local | **38/38** |
| `test-yc33-scoring-flow.ts` | DB local | **20/20** |
| `test-yc34-36-eval.ts` | DB local | **32/32** |
| `test-yc33-36-production-smoke.ts` (chỉ đọc) | **Production** | **23/23** |
| `tsc --noEmit` / `next build` | local | 0 lỗi / build thành công |
| DDL idempotent | local + Production | lần 2 `schema_changed=false`, `checks_failed=0` |

**Parity YC-33 — đối chiếu trực tiếp workbook gốc** (`Dữ liệu.zip` → sheet *Bảng 1 (tính điểm CC)* dòng 12–20 và *Biểu 01A (CC)* dòng 28–39):

| Chỉ số | File gốc | Hệ thống |
|---|---:|---:|
| G19 (tổng quy đổi giao) | 1719.16 | 1719.16 ✅ |
| H19 (tổng số lượng) | 660 | 660 ✅ |
| I19 | 1719.16 | 1719.16 ✅ |
| L19 | 1396.01 | 1396.01 ✅ |
| N19 | 1719.16 | 1719.16 ✅ |
| I20 (% số lượng) | 100 | 100 ✅ |
| L20 (% tiến độ) | 81.203029 | 81.203029 ✅ |
| N20 (% chất lượng) | 100 | 100 ✅ |
| 01A D37 (d) | 93.734343 | 93.734343 ✅ |
| 01A D38 (d×70%) | 65.61404 | 65.61404 ✅ |
| 01A D39 (tổng) | 94.11404 | 94.11404 ✅ |

---

## 5. Commit và deployment

| Commit | Nội dung |
|---|---|
| `9633a43` | YC-37 — bước xem trước, 3 quyết định, vòng lặp giải trình, RBAC, audit |
| `91bd9f8` | YC-33 — engine Bảng 1 decimal-safe, API, UI trạng thái |
| `2f6f6f5` | YC-34/35/36 — biểu mẫu, quan hệ phụ trách, tự đánh giá, màn quản trị |
| `f6fb85e` | Sửa lỗi hydration React #418 trên `/my-work` (nhãn ngày phụ thuộc múi giờ) |
| `d85ebd2` | Tài liệu checkpoint |

**Schema áp Production** bằng `scripts/apply-yc33-37-ddl.ts` (chỉ CREATE TABLE/INDEX, idempotent, `checks_failed=0`).
**Không chạy** `prisma migrate deploy` (Production không có `_prisma_migrations`).

---

## 6. Đối chiếu dữ liệu trước / sau

| Đối tượng | Trước | Sau |
|---|---:|---:|
| `people` / `accounts` | 38 / 24 | 38 / 24 |
| `work_catalog_versions` / `entries` | 1 / 348 | 1 / 348 |
| `work_catalog_department_mappings` | 0 | 0 |
| `activity_templates` | 48 | 48 |
| `tasks` / `plans` | 18 / 5 | 18 / 5 |
| `personal_work_items` / `monthly_work_results` / `work_evidences` | 26 / 15 / 0 | 26 / 15 / 0 |
| `approval_cases` / `approval_decisions` | — | 0 / 0 |
| `score_runs` / `score_run_items` | — | 0 / 0 |
| `evaluation_assessments` | — | 0 / 0 |
| `person_supervisions` | — | 0 / 0 |

> Hai phiếu đánh giá nháp sinh ra khi smoke test đã được **xoá**; Production không còn dữ liệu test.

---

## 7. Những gì đã đối chiếu từ nguồn Hải quan

- **CV 2431** (PDF trong `Dữ liệu.zip`) — chưa trích được nội dung chữ; chưa dùng làm căn cứ công thức.
- **Bảng 1** — công thức lấy trực tiếp từ sheet gốc (đối chiếu 1:1 ở bảng mục 4).
- **QĐ1277** — danh mục sản phẩm có cột *Hệ số quy đổi*; hệ số này **không** bị trộn với hệ số TX.
- **Biểu 01A/01B/02A/02B** — bố cục lấy từ workbook gốc; phần quý nhập tay a/b/c, phần 01B có cột bình quân chia theo số công chức thực tế.

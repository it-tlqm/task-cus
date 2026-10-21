# TALUNG-CUS-WORK — V3 MASTER SPEC (đặc tả nghiệp vụ gộp)

**Phiên bản:** V3.0.1 · **Ngày:** 21/10/2026 · **Nhánh:** `feature/v3-demo` (từ `d444b8e` → `d524576`)
**Nguồn:** sổ tay V3 (Phần 1+2), Phần 3 (R3 / R3-C), báo cáo Q-B4 đối chiếu 7 file Excel, YC39 GAP Analysis.
**Sổ tay gốc KHÔNG bị sửa/xoá** — tài liệu này chỉ là bản tổng hợp phục vụ lập trình.

> **Nguyên tắc ưu tiên:** khi tài liệu cũ và tài liệu mới khác nhau → **lấy quyết định đã chốt mới nhất** (Phần 3 R3-C chốt 21/10/2026; các quyết định Phần 1 giữ nguyên).

---

## 1. SỔ ĐĂNG KÝ QUYẾT ĐỊNH NGHIỆP VỤ (bắt buộc tuân thủ)

| Mã | Quyết định (nguyên văn) | Hiện thực ở đâu |
|---|---|---|
| **A** | Công việc tự ghi nhận chỉ đủ điều kiện tính điểm **chính thức** sau khi được **xác nhận hợp lệ**. | `personal_work_items.reviewState = CONFIRMED` là điều kiện vào điểm chính thức (V3.0.3 dựng ranh giới trên `score_runs`). V3.0.1 đã có cổng xác nhận + khóa. |
| **A1** | Người xác nhận là **lãnh đạo bộ phận trực tiếp quản lý công chức**. | `src/server/work-item-review.ts` → `canReviewAsDirectLeader()`: nguồn chính `person_supervisions` (CONFIRMED, còn hiệu lực); **không** có quan hệ phụ trách mới lùi về phạm vi đơn vị; `SYSTEM_ADMIN` **không** có quyền nghiệp vụ. |
| **B2** | **Bắt buộc ghi nội dung kết quả**; tệp minh chứng **linh hoạt** (không bắt buộc mọi loại việc phải có tệp). | `submitWorkItemForReview()` bắt buộc `resultText` ≥ 5 ký tự (400 nếu thiếu). Minh chứng: `work_evidence` (tệp) + `evidenceRef` (số hiệu văn bản) — không bắt buộc tệp. |
| **C1** | Công chức được **chọn ngày hoàn thành thực tế**; mặc định giờ VN; **thời điểm thao tác lưu riêng**. | Form báo hoàn thành có ô ngày (mặc định hôm nay theo `Asia/Ho_Chi_Minh`); `completed_date` = ngày lịch, `completed_at` = thời điểm thao tác (cột riêng). |
| **D1-A** | Sau khi gửi xác nhận → **khóa sửa và bỏ hoàn thành**; lãnh đạo **trả lại** thì được sửa & gửi lại; sau xác nhận thì **khóa kết quả**. | `isWorkItemReviewLocked()` (SUBMITTED/CONFIRMED ⇒ 409) áp cho PATCH đầu việc; vòng `DRAFT → SUBMITTED → (RETURNED → SUBMITTED)* → CONFIRMED` kiểm ở server. |
| **E1-A** | Việc **chưa xác nhận** vẫn hiện trong kết quả tháng ở dạng **dự thảo**, có thể có **điểm gợi ý** nhưng **không** cộng vào điểm chính thức. | Lớp trạng thái trên bản ghi kết quả tháng + ranh giới "chính thức" khi tính điểm — **V3.0.3** (V3.0.1 chỉ tạo nguồn trạng thái ở lớp đầu việc). |
| **F1-A** | Lãnh đạo xác nhận **kết quả** và **mã SP + hệ số**; sai thì trả lại. | Bước xác nhận ở V3.0.2–3 (hiển thị `factorSource`/mã SP, nút "Sai, trả lại"); **không** sửa hệ số gốc danh mục. |
| **G1-A** | Khi SP **có áp dụng số lượng**: công chức khai **số lượng thực tế và đơn vị tính**; lãnh đạo xác nhận cùng kết quả, mã SP, hệ số. | Trường `quantityUnit` + cờ "SP áp dụng số lượng" ở danh mục — **V3.0.2/3**; chưa có quy tắc danh mục được phê duyệt ⇒ **không tự suy đơn vị**. |
| **R3** (nguyên tắc) | Trước khi gửi ⇒ **được** bổ sung/thay thế/xoá minh chứng. **Đã gửi/chờ xác nhận ⇒ khóa** minh chứng. **Bị trả lại ⇒ được** bổ sung/điều chỉnh. **Đã xác nhận ⇒ khóa hồ sơ + minh chứng**, muốn điều chỉnh phải qua quy trình có thẩm quyền và phải lưu lịch sử. | `POST/DELETE /api/work-evidence` trả **409** khi `reviewState ∈ {SUBMITTED, CONFIRMED}`; mở lại khi `RETURNED`. Kiểm ở **server**, không chỉ ở giao diện. |
| **R3-C** | Điều chỉnh minh chứng **sau khi đã xác nhận/nghiệm thu** phải qua **hai cấp**: (1) người phụ trách **đề nghị** (nêu nội dung, lý do, minh chứng đề xuất — *không* tự mở khóa); (2) **lãnh đạo trực tiếp đã xác nhận** xem xét (chưa phải phê duyệt cuối); (3) **Trưởng bộ phận phê duyệt cuối cùng** hoặc từ chối; (4) **bảo toàn** phiên bản cũ + ghi lý do/người đề nghị/người xem xét/người phê duyệt/thời điểm/nội dung thay đổi; (5) **SYSTEM_ADMIN không tự động có quyền phê duyệt nghiệp vụ**. | **V3.0.3** (đã đặc tả ở `V3_MVP_IMPLEMENTATION.md` §4). V3.0.1 chỉ **khoá**; chưa mở quy trình điều chỉnh. |
| **Q-B4** | Công thức quy đổi điểm chính thức theo SP/hệ số/số lượng; thứ tự ưu tiên TX vs QĐ1277; điều kiện đủ điều kiện tính điểm. | **CHƯA CHỐT** — xem §2. |
| **Q-B4/A, A-1, A-2, A-3, A-4** | Nhóm quyết định chi tiết của Q-B4. | **KHÔNG TÌM THẤY bản gốc trong workspace** (đã quét toàn bộ `docs/`, kể cả gói tài liệu) ⇒ **cần chủ dự án chỉ dẫn nguồn**; trong lúc chờ, áp dụng nguyên tắc an toàn ở §2. |

---

## 2. Q-B4 — NGUYÊN TẮC ÁP DỤNG TRONG LÚC CHỜ CHỐT

Nguồn: `docs/YC38_QB4_DOI_CHIEU_CONG_THUC_TU_7_FILE_EXCEL_2026-10-21.md` (phân tích chứng cứ, **không phải quy định đã phê duyệt**).

1. **Không tự đặt công thức, hệ số, ngưỡng hay đơn vị tính** chưa được phê duyệt. Mọi hệ số lấy từ **nguồn đã khai** (có `productItemId` ⇒ `QD1277_PRODUCT`; không có ⇒ `TX_CATALOG`).
2. **Điểm gợi ý ≠ điểm chính thức.** Chưa có lãnh đạo xác nhận thì chỉ được hiển thị là **gợi ý**, tuyệt đối không cộng vào điểm chính thức.
3. **Thiếu số liệu ≠ 0.** Không tự điền 0; áp dụng kiểm tra thiếu dữ liệu độc lập với phép tính (`INSUFFICIENT_DATA` / `PENDING_RULE` sẵn có trong `src/server/scoring/bang1.ts` — **không sửa**).
4. **Hệ số phải gắn sản phẩm CHI TIẾT** (mã khác nhau có thể trùng tên nhiệm vụ mẹ) ⇒ hiển thị đủ để phân biệt.
5. **Không dùng bảng tổng hợp phụ bị lỗi** trong file Excel làm nguồn tính điểm; chỉ dùng cột tỷ lệ G/I/L/N và tổng 70 điểm mà Biểu 01A dùng.
6. **Chưa chốt:** nguồn hệ số ưu tiên khi không có QĐ1277; số lần chậm/làm lại & giới hạn phép trừ; số lượng/đơn vị tính; điều kiện công việc đủ xác nhận để vào điểm chính thức; phương pháp tính quý & công thức điểm lãnh đạo; cách xử lý thiếu dữ liệu / chỉnh sửa sau khi chốt kỳ.

---

## 3. VÒNG ĐỜI HỒ SƠ CÔNG VIỆC TỰ GHI NHẬN (V3.0.1)

```
        ┌───────────── trả lại (RETURNED) ◄──────────┐
        │                                              │
   DRAFT ──gửi──► SUBMITTED ──xác nhận──► CONFIRMED
  (chưa gửi)      (chờ xác nhận)         (đã khóa)
```

| Trạng thái | Ý nghĩa nghiệp vụ | Cán bộ | Lãnh đạo trực tiếp | Hệ thống |
|---|---|---|---|---|
| **DRAFT** | Công việc đang thực hiện, chưa gửi | sửa được; báo hoàn thành & gửi lên | không thấy | mở |
| **SUBMITTED** | Đã gửi, đang chờ lãnh đạo xác nhận | **khóa sửa + khóa minh chứng** | xem; xác nhận hoặc trả lại | khóa |
| **RETURNED** | Lãnh đạo trả lại để chỉnh sửa | sửa được (nội dung + minh chứng); gửi lại | xem lý do | mở lại |
| **CONFIRMED** | Đã được lãnh đạo xác nhận | **khóa** (mọi thao tác) | xem lịch sử | khóa |

**Luật bất di bất dịch:**
- Mỗi hồ sơ có **một** vòng duyệt. Công việc **đã gắn nhiệm vụ** (`taskId`) thì **do quy trình của nhiệm vụ xử lý** — hệ thống **không** mở thêm vòng duyệt riêng (API trả 409 với thông báo rõ ràng).
- Gửi lại nhiều lần được (`submitCount` tăng dần), nhưng **chỉ một hồ sơ chờ** tại một thời điểm.
- Mọi chuyển trạng thái ghi vào `work_item_reviews` (SUBMITTED / RETURNED / CONFIRMED) + `audit_events`.
- Lãnh đạo trả lại **bắt buộc có lý do**; cán bộ gửi lên **bắt buộc có nội dung kết quả** và **ngày hoàn thành thực tế**.

---

## 4. PHẠM VI & RANH GIỚI (để lập trình)

| Nằm trong V3.0.1 (đã xong) | Nằm trong V3.0.2 | Nằm trong V3.0.3 |
|---|---|---|
| Lớp trạng thái đầu việc tự ghi nhận + lịch sử | 1 công việc ↔ **nhiều SP QĐ1277** | Kết quả tháng ↔ Bảng 1 ↔ 01A/01B/02A/02B |
| Gửi / khóa / trả lại / xác nhận | Xác nhận **từng SP** độc lập | Xuất báo cáo **dự thảo** |
| Bắt buộc nội dung kết quả + ngày thực tế | SP chưa có vẫn ghi nhận, chờ đối chiếu | Quản lý minh chứng + **quy trình R3-C** 2 cấp |
| Lãnh đạo trực tiếp theo `person_supervisions` | Công chức **đề xuất mã SP**, lãnh đạo xác nhận | Lịch sử, chống trùng, hoàn thiện phân quyền |
| Khoá minh chứng theo trạng thái (R3 mục 3.1) | Bổ sung SP sau nghiệm thu qua quy trình riêng | Ranh giới **điểm dự thảo / điểm chính thức** (E1-A) |
| Giao diện cán bộ + trang lãnh đạo | | Xác nhận mã SP + hệ số (F1-A), đơn vị tính (G1-A) |

**Nguyên tắc kỹ thuật bắt buộc:** mọi kiểm tra quyền & trạng thái thực hiện **phía server**; giao diện chỉ hiển thị; **không** sửa bộ máy tính điểm (`src/server/scoring/**` là bất biến cho tới khi Q-B4 chốt); **không** tạo bảng/sao chép dữ liệu khi đã có bảng tương đương.

# OPEN QUESTIONS — cần Hải quan xác nhận

Cập nhật 21/10/2026. Mỗi mục ghi rõ **đã biết gì**, **vì sao chưa tự quyết**, và **hệ thống đang xử lý thế nào trong lúc chờ**.

---

## 1. Ngưỡng xếp loại (YC-36) — `BLOCKED_BUSINESS_RULE`

**Biết:** Mẫu 02A Quý III có mục *"5. Cá nhân tự đề xuất mức xếp loại"* với **4 lựa chọn**: Hoàn thành xuất sắc / Hoàn thành tốt / Hoàn thành / Không hoàn thành. Đây là **bằng chứng mẫu**, không phải quy tắc đã được phê duyệt.

**Chưa biết:** Điểm → mức xếp loại ánh xạ thế nào (ví dụ ≥ 90 điểm = Hoàn thành xuất sắc?). CV 2431 (file PDF trong `Dữ liệu.zip`) chưa được trích xuất nội dung chữ.

**Hệ thống đang làm:** `self_grade_suggestion` (gợi ý hệ thống) và `self_grade_choice` (lựa chọn của cán bộ) là **hai trường tách biệt**. Chỉ khi có bảng ngưỡng được phê duyệt mới ghi `self_grade_suggestion`; hiện để `NULL` kèm lý do `PENDING_RULE`. Không coi lựa chọn của cá nhân là kết quả chính thức.

---

## 2. Điểm tiêu chí chung gợi ý (YC-36) — `BLOCKED_BUSINESS_RULE`

**Biết:** Mẫu 01A: `I. Phẩm chất chính trị…` tối đa 10 điểm (2 nhóm con: 5 + 5), `II. Năng lực chuyên môn…` tối đa 10 điểm (4 nhóm con: 2.5 + 2.5 + 2.5 + 2.5), `III. Tinh thần trách nhiệm…` tối đa 10 điểm. **Tổng tiêu chí chung tối đa 30 điểm** (khớp `C31 = D28`).

**Chưa biết:** Cơ chế **gợi ý** điểm tiêu chí chung dựa trên dữ liệu nào (lịch sử điểm? đánh giá trước? quy tắc định mức theo cấp bậc?). Trong file mẫu, cột `D` của tiêu chí chung đều là **giá trị nhập tay** (5, 2.5, …), không có công thức.

**Hệ thống đang làm:** `common_criteria_suggested` = `NULL` + lý do `PENDING_RULE`; `common_criteria_score` là điểm cán bộ tự chấm (được sửa). Không tự đặt ngưỡng.

---

## 3. Công thức quý (YC-33 / YC-34) — `BLOCKED_BUSINESS_RULE`

**Biết:** Mẫu 02A Quý III: `D34/D35/D36` là **giá trị nhập tay** (100 / 70.67 / 100), `D37 = (D34+D35+D36)/3`, `D38 = D37*70/100`, `D39 = D33 + C31`.

**Chưa biết:** Quý được **tổng hợp từ 3 tháng** như thế nào — trung bình có trọng số theo số ngày làm việc? Lấy điểm tháng cuối? Tổng rồi chia? Hải quan **chưa công bố** công thức này (đặc tả YC-33 yêu cầu "Không tự lấy trung bình tháng để ra quý").

**Hệ thống đang làm:** `periodType = QUARTER` được hỗ trợ về mặt kỹ thuật nhưng **không** tự tính điểm quý từ điểm tháng. Biểu 02A/02B sinh ở trạng thái **DỰ THẢO** với các ô `a/b/c` để trống và nhãn cảnh báo.

---

## 4. Quan hệ phụ trách (YC-35) — `BLOCKED_BUSINESS_RULE`

**Biết:** Tin nhắn Hải quan 19/10: *"Đội trưởng được tính điểm trung bình của hai Đội phó; Đội phó được tính điểm trung bình từ các công chức thuộc phạm vi phụ trách"*. Mẫu 01B lãnh đạo: cột `F` = *"Điểm trung bình các công chức thuộc thẩm quyền giao phụ trách từng mảng công việc"*, chia theo **số công chức thực tế trong ví dụ** (`/24`) — con số 24 là của ví dụ, **không** được hard-code.

**Chưa biết:** Ai là "Đội trưởng / Đội phó" của ai trong cơ cấu mới (3 nhóm: Tổng hợp / CBL / Nghiệp vụ). Sheet *"Cơ cấu tổ chức"* trong `Danh mục TX1.xls` liệt kê 6 nhóm khác (Nghiệp vụ Hải quan / CNTT / CBL / Phúc tập & KT STQ / TH & Báo cáo / Công tác Đảng) — **không tự kết luận 1:1**.

**Hệ thống đang làm:** bảng `person_supervisions` (quan hệ theo kỳ, có `effectiveFrom/To`, `status`, `confirmedById`) sẵn sàng nhưng **chưa ghi dữ liệu nào**. Tính bình quân chỉ chạy khi (a) quan hệ phụ trách đủ cho kỳ và (b) công thức chia mẫu số đã được xác nhận. Nếu chưa đủ → `PENDING_RULE` / `INSUFFICIENT_DATA`, tuyệt đối không coi điểm thiếu là 0.

---

## 5. Ánh xạ 6 nhóm danh mục TX ↔ bộ phận nhân sự — `BLOCKED_BUSINESS_RULE` (còn từ Giai đoạn 1)

**Biết:** Yêu cầu 20/10 nói rõ *"Sáu nhóm trong Excel là cấu trúc phân loại của file nguồn. Không tự động kết luận chúng tương ứng 1:1 với sáu bộ phận nhân sự đang hoạt động."*

**Hệ thống đang làm:** `work_catalog_versions.selectionMode = ALL` → mọi cán bộ chọn được đầu việc của cả 6 nhóm (không đình trệ). Khi Hải quan xác nhận mapping → chuyển về `MAPPED` và gán từng nhóm tại màn *Danh mục công việc*.

---

## 6. Hai tên ngắn nhiều ứng viên trong phân công bộ phận — chờ xác nhận

| Nhóm | Tên ngắn | Ứng viên trong `danh.xlsx` |
|---|---|---|
| Bộ phận Tổng hợp | "Hoàng" | Hoàng Văn Bằng · Đinh Đức Hoàng · Hoàng Đức Trung · Hoàng Đức Hạnh · Hoàng Văn Bách |
| Bộ phận CBL | "Minh" | Đặng Minh Được · Lã Trần Minh · Đặng Minh Tuấn |

**Hệ thống đang làm:** 14 hồ sơ mới đã tạo **chưa gán bộ phận**; nhóm đã ghi trong `notes` để quản trị viên gán tại màn *Tổ chức & Nhân sự*.

---

## 7. Tên nhóm trong file gốc có lỗi chính tả

File `Danh mục TX1.xls` ghi **"Bộ phân Nghiệp vụ Hải quan"** (thiếu dấu ật ở "phân", đáng lẽ "phận"). Hệ thống **giữ nguyên** theo file nguồn (nguyên tắc "giữ đúng thứ tự và nội dung gốc") và hiển thị nhãn chuẩn ở lớp trên. Cần xác nhận có muốn hiển thị đúng lỗi chính tả của file hay không.

---

## 8. 12 cặp tên trùng hoàn toàn trong nhóm "Nghiệp vụ Hải quan"

File gốc có 12 cặp tên **trùng hoàn toàn** trong cùng nhóm (vd dòng 78/93/97/117/163 đều là *"Kiểm tra hồ sơ hải quan (luồng vàng, đỏ)"*). Yêu cầu 20/10: *"Không bỏ qua đầu việc có tên dài, trùng tên"* → hệ thống giữ **đủ 12 dòng**, mỗi dòng một mã riêng. Ngoài ra có các cặp chỉ khác **chữ hoa đầu câu** (dòng 131 *"về việc…"* vs 135 *"Về việc…"*) → **không gộp** (nội dung gốc khác nhau). Cần xác nhận giữ đủ là đúng ý.

---

## 9. Số lượng nhân sự: 32 dòng file vs 35 trong sheet "Cơ cấu tổ chức"

`danh.xlsx` có **32** dòng; sheet *"Cơ cấu tổ chức"* trong `Danh mục TX1.xls` ghi tổng **35** (Lãnh đạo đơn vị **3**). Hai tên được bổ sung (`Phạm Linh Thuận`, `Tô Văn Thụ`) **đã có sẵn** trong Production (CB-015, CB-011) nhưng **không** có trong `danh.xlsx`. Cần Hải quan xác nhận danh sách đầy đủ 35 người và cơ cấu 3 lãnh đạo đơn vị (DB hiện có 4 người ở `BAN_LANH_DAO`, gồm 1 tài khoản DEMO).

---

## 21/10/2026 — Câu hỏi còn mở sau YC-38B/38C

| # | Câu hỏi | Trạng thái | Khuyến nghị |
|---|---|---|---|
| Q-B1 | 1 việc giao nhiều người → 1 việc gốc + bảng phân công? | ⛔ Chờ xác nhận (đã triển khai theo khuyến nghị) | 1 work_item + `work_item_assignments` |
| Q-B2 | Đầu mối chủ trì: cá nhân hay bộ phận, có cả hai không? | ⛔ Chờ xác nhận (đã triển khai: 1 trong 2) | 1 trong 2, không cả hai, không rỗng |
| Q-B3 | 1 việc gắn nhiều sản phẩm QĐ1277? | ⛔ Chờ xác nhận (đã triển khai 0..n) | Có, không cộng điểm |
| **Q-B4** | **Hệ số TX hay QĐ1277 khi việc có cả hai?** | ⛔ **PENDING_RULE — hệ thống KHÔNG tự chọn** | Hệ số công việc = TX; SP chỉ dùng khi không có TX |
| Q-B5 | Mẫu 2C/2D/2E | ⛔ Ngoài phạm vi đợt này | — |
| Q-B6 | Ca trực có tính điểm không? | ⛔ Ngoài phạm vi đợt này | — |
| Q-M1 | 48 mẫu cũ — ẩn khỏi form tạo mới? | ⛔ Chưa ẩn, cần rà phụ thuộc | Ẩn sau khi rà 8 bản ghi dùng mẫu cũ |
| Q-M2 | 2 phiếu `evaluation_assessments` DRAFT rỗng | ⛔ Chờ duyệt để dọn | Xác nhận rồi xoá |
| Q-M3 | 2 `approval_cases` do bộ test YC-37 tạo | ⚠️ Chờ rà/dọn | Xác nhận rồi dọn |
| Q-M4 | Có làm UI phân công tiếp trong đợt này? | ⛔ Chưa có UI | Chốt phạm vi đợt sau |
| Q-M5 | Backfill `work_item_id` cho 15 kết quả tháng DEMO? | ⛔ **Không** tự làm | Cần Hải quan quyết từng dòng |

---

## 21/10/2026 — Câu hỏi còn mở (sau khi sửa lỗi UAT)

| # | Câu hỏi | Trạng thái | Khuyến nghị |
|---|---|---|---|
| Q-B4 | Hệ số TX hay QĐ1277 khi việc có cả hai? | ⛔ PENDING_RULE — không tự chọn | TX cho công việc; SP khi không có TX |
| Q-U1 | Hiệu chỉnh 6 nhiệm vụ lệch 7h? | ⛔ Chưa sửa, chờ duyệt từng dòng | Không sửa — điểm dùng date-only nên không ảnh hưởng |
| Q-U2 | Gán `origin_kind` cho 2 bản ghi UAT đã xác minh tự khởi tạo? | ⛔ Chưa UPDATE | Duyệt thì cập nhật đúng 2 dòng, có backup |
| Q-U3 | Hiện hệ số ở bảng danh sách? | ⚠️ Đang hiện rút gọn | Nếu nhiễu → chỉ hiện ở chi tiết |
| Q-B5/Q-B6 | Mẫu 2C/2D/2E · ca trực | ⛔ Ngoài phạm vi | — |
| Q-M1..M5 | 48 mẫu · dọn phiếu DRAFT · UI phân công tiếp · backfill work_item_id DEMO | ⛔ Chưa làm | Xem báo cáo bàn giao YC-38B/38C |

---

## 21/10/2026 — Câu hỏi còn mở (sau B4)

| # | Câu hỏi | Trạng thái | Khuyến nghị |
|---|---|---|---|
| Q-B4-1 | Trình duyệt sớm khi tiến độ <100%? | ⛔ Chưa triển khai (checkbox khoá, API bỏ qua, trả ghi chú) | Chốt quy tắc rồi mới làm |
| Q-B4-2 | Cán bộ tự kết luận "đạt kết quả" ở <100% rồi nộp duyệt? | ⛔ Chưa có nút riêng | Nếu cần → thêm nút "Nộp duyệt kết quả hiện tại" |
| Q-B4-3 | Tạo hồ sơ approval_case ngay khi nộp duyệt? | ⚠️ Hiện chỉ tạo khi lãnh đạo mở xem trước (YC-37) | Chốt theo quy trình |
| Q-B4-4 | Quy tắc 100% ⇒ tự trình duyệt | ✅ Đã áp dụng theo hướng dẫn cũ | Xác nhận để chốt |
| Q-U1/Q-U2 | 6 nhiệm vụ lệch 7h · gán origin_kind cho 2 bản ghi UAT | ⛔ Chưa sửa | Không sửa (khuyến nghị) |

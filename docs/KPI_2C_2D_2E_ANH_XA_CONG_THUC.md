# ÁNH XẠ CHỈ TIÊU & CÔNG THỨC — MẪU 2C / 2D / 2E

**Ngày lập:** 17/10/2026 · **Người lập:** Agent (theo chỉ đạo "CHƯA tự triển khai tính điểm KPI")
**Trạng thái:** ĐỀ XUẤT — chờ Hải quan xác nhận · **Nguyên tắc:** không tự đặt công thức, không tự chấm điểm/xếp loại, không suy diễn quy tắc Hải quan chưa xác nhận.

**Nguồn đối chiếu (file gốc đơn vị gửi, không sửa):**

| Mẫu | File gốc | Kèm theo |
| :-- | :-- | :-- |
| 2C | `Mẫu 2C Báo cáo KQ các lĩnh vực công tác của đơn vị (1).docx` | Công văn 892/HQTL ngày 02/10/2026 (Quý III/2026) |
| 2D | `Mẫu 2D theo CV 1601.xlsx` (2 sheet: bản tổng hợp + bản nháp) | CV 1601 |
| 2E | `Mẫu 2E.xlsx` | Công văn 892/HQTL ngày 02/10/2026 |

---

## 1. Làm rõ thuật ngữ "KPI 02C"

Trong hồ sơ nhận được **không có biểu mẫu nào tên "KPI"**. Ba mẫu chứa ba loại "điểm/chỉ số" khác nhau về bản chất:

| Cách hiểu "KPI" | Thuộc mẫu nào | Bản chất | Công thức nguồn |
| :-- | :-- | :-- | :-- |
| (i) Tỷ lệ hoàn thành chỉ tiêu kế hoạch | **2E** | % thực hiện so chỉ tiêu (đơn vị) | F = E/D; L..O = K/(G..J) — suy ra từ cấu trúc cột, **chưa lưu dạng formula trong file** |
| (ii) Điểm đánh giá + mức xếp loại cá nhân | **2D** | Điểm 0–100 và mức xếp loại theo người | Nguồn là **phiếu đánh giá cá nhân 02A/02B — KHÔNG có trong hồ sơ nhận được** → chưa có công thức chấm điểm |
| (iii) Đếm nhiệm vụ theo chương trình công tác trọng tâm | **2C mục 1** | Số đếm nhiệm vụ được giao / hoàn thành / chưa hoàn thành | Quy ước đếm chưa được ghi thành công thức trong file |

➡️ **Đề nghị đơn vị xác nhận "KPI 02C" đang muốn nói đến (i), (ii) hay (iii)** trước khi triển khai bất kỳ tính điểm nào.

---

## 2. Mẫu 2C — Báo cáo kết quả các lĩnh vực công tác của đơn vị

### 2.1. Kiểm tra tính nhất quán mục 1 (nhiệm vụ trọng tâm) — ⚠️ có vênh

| Chỉ số trong file gốc | Giá trị | Kiểm tra |
| :-- | --: | :-- |
| Số nhiệm vụ được giao có thời hạn trong quý | 162 | |
| Số nhiệm vụ đã hoàn thành | 149 | 130 trước hạn + 19 đúng hạn + 0 chậm = **149 ✔** |
| — Hoàn thành trước hạn | 130 | |
| — Hoàn thành đúng hạn | 19 | |
| — Hoàn thành chậm tiến độ | 0 | |
| Số nhiệm vụ chưa hoàn thành | 0 | |

**Vênh:** 162 − 149 − 0 = **13 nhiệm vụ không được giải thích** trong báo cáo.
Quy ước ngầm "được giao = hoàn thành + chưa hoàn thành" **không thỏa** với số liệu đã gửi.
→ Câu hỏi: 13 nhiệm vụ còn lại thuộc trường hợp nào (gia hạn sang kỳ sau, chưa đến hạn trong quý, chuyển đánh giá kỳ sau…)? **Không tự suy diễn** khi xây công thức tỷ lệ hoàn thành.

### 2.2. Các số khác trong 2C và công thức suy luận (có kiểm chứng số học)

| Nội dung | Số trong file | Công thức suy luận | Kiểm chứng |
| :-- | :-- | :-- | :-- |
| Tỷ lệ ĐTCBL so kế hoạch | "43 vụ (33 chủ trì + 10 phối hợp); đạt 184,2% kế hoạch (giao 19 vụ); trong 33 vụ có 08 vụ thời hạn không tính vào chỉ tiêu" | ((33 − 8) + 10) ÷ 19 | 35 ÷ 19 = **184,2% ✔** (khớp chính xác) |
| Giải ngân kinh phí chống buôn lậu | dự toán 500, đã thanh toán 410, "đạt 82%" | 410 ÷ 500 | = **82% ✔** |
| KTSTQ lũy kế | "đã kiểm tra 02 cuộc, tiền phạt khoảng 6 triệu đồng" | đếm + tổng tiền | khớp với 2E (K=2 cuộc; 0,006 tỷ) ✔ |
| Dịch vụ công trực tuyến | 36 hồ sơ quý; lũy kế 273; "giảm 3% so 2025" | — | không có công thức trong file |
| Mục 3 (báo cáo định kỳ) | **bỏ trống cả 3 số** | — | cần đơn vị bổ sung nếu muốn đưa lên hệ thống |

### 2.3. Công thức có căn cứ / còn thiếu (2C)

- **Có căn cứ (kiểm chứng số học khớp):** tỷ lệ ĐTCBL 184,2% = ((chủ trì − vụ thời hạn) + phối hợp)/giao; tỷ lệ giải ngân = đã thanh toán/dự toán; đếm nhiệm vụ phân rã 3 mức.
- **Còn thiếu:** quy ước 13 nhiệm vụ vênh; định nghĩa "vụ vi phạm thời hạn làm thủ tục không tính vào chỉ tiêu"; công thức "giảm 3%/38% cùng kỳ".

---

## 3. Mẫu 2D — Bảng tổng hợp kết quả đánh giá, xếp loại (Quý III/2026)

### 3.1. Cấu trúc

- **Sheet chính "Bảng tổng hợp…"** (36 người): `STT | Họ và tên | Chức vụ | Tổng điểm trung bình (#,##0.0) | Đơn vị đánh giá, đề xuất mức xếp loại | Ghi chú | T9 | Cá nhân tự nhận`.
- **Sheet nháp "Sheet1"** (41 dòng): cùng nội dung nhưng lệch ở một số dòng so với bản chính (ví dụ: 1 người ở nháp xếp một mức, bản chính đổi mức; 1 người nháp có đánh giá, bản chính ghi "**Chưa thực hiện đánh giá xếp loại QIII/2026. Chuyển sang đánh giá xếp loại vào QIV/2026**" kèm viện dẫn khoản 6 Hướng dẫn số 02-HD/BTCTW ngày 22/5/2026).
- Mức xếp loại dùng trong file: Hoàn thành xuất sắc nhiệm vụ / Hoàn thành tốt nhiệm vụ / Hoàn thành nhiệm vụ / (Chưa đánh giá — chuyển kỳ).

### 3.2. Công thức CÓ trong file

- **Chỉ duy nhất 6 dòng cuối** (Bảo vệ / Tạp vụ / Lái xe) cột D là công thức thật: **D = (tổng điểm 3 tháng) ÷ 3** (ví dụ f[265.033…/3] → 88,34).
- Tất cả các dòng công chức còn lại: cột D là **số tĩnh đã dán kết quả** — công thức tính điểm nằm ngoài file.
- Cột E (mức xếp loại) và H (cá nhân tự nhận: HT/HTT/HTXS) **nhập tay**, không có công thức.

### 3.3. Công thức CÒN THIẾU (quan trọng nhất)

1. Công thức tính điểm từng tháng của cá nhân (từ **phiếu 02A/02B** — chưa có trong hồ sơ).
2. **Ngưỡng điểm → mức xếp loại** (bao nhiêu điểm là HTXS/HTT/HT).
3. Trọng số các nhóm tiêu chí và quy tắc trừ điểm (nếu có).
4. Quy tắc chuyển kỳ đánh giá (trường hợp QIV/2026 trong file).

### 3.4. Hiện trạng app liên quan

- App có "Điểm tính thử — chưa chính thức" (KQ tháng) theo công thức mẫu **Bảng 1/01A**: d = (a+b+c)/3 với a=(9)/(7), b=(12)/(7), c=(14)/(7); giảm 25% trên đơn giá mỗi ngày chậm/lần làm lại; score70 = d×70%. **Đây KHÔNG phải công thức 2D** và đang gắn nhãn "chỉ tham khảo" — giữ nguyên nhãn, không dùng để xếp loại chính thức.

---

## 4. Mẫu 2E — Kết quả thực hiện chỉ tiêu kế hoạch các lĩnh vực công tác trọng tâm

### 4.1. Cấu trúc cột (16 cột)

`TT | Lĩnh vực/Nội dung | Đơn vị tính | D: Chỉ tiêu KH trong quý | E: Kết quả TH trong quý | F: Tỷ lệ (%) | G–J: Chỉ tiêu cả năm (BTC / Cục HQ / Chi cục / Phấn đấu) | K: Lũy kế từ đầu năm | L–O: Tỷ lệ lũy kế so chỉ tiêu năm (BTC / Cục / Chi cục / Phấn đấu) | P: Ghi chú`

**Công thức suy luận (cần xác nhận):** F = E/D; L..O = K/G..J. Trong file các ô này là **giá trị tĩnh** (không lưu formula) và định dạng hiển thị `0%` (ví dụ ô chứa 0.65 hiển thị 65%).

### 4.2. Đối chiếu từng chỉ tiêu 2E ↔ danh mục 49 chỉ tiêu trong app

| 2E — dòng | Chỉ tiêu | Trạng thái trong app |
| :-- | :-- | :-- |
| Giải ngân vốn NSNN | Tỷ đồng | ❌ **chưa có chỉ tiêu** — đề xuất bổ sung khi được xác nhận |
| Giải ngân vốn đầu tư công | Tỷ đồng | ❌ chưa có |
| Số thu NSNN | Tỷ đồng | ✅ `THU_NSNN` — nhưng tên app ghi "(số thuế phát sinh)", cần thống nhất nghĩa với 2C "thu nộp NSNN" |
| Số cuộc KTSTQ | Cuộc | ✅ `KT_CUOC` |
| Số thu NSNN từ KTSTQ | Tỷ đồng | ⚠️ app tách 3 khoản: `KT_TIEN_AN` (ấn định thuế) + `KT_TIEN_CN` (chậm nộp) + `KT_TIEN_XP` (phạt) — **cần xác nhận "số thu" gồm khoản nào** |
| Số vụ chủ trì phát hiện, bắt giữ, xử lý | Vụ | ⚠️ app có `KS_VPHC` (chủ trì xử lý VPHC), `KS_BG` (bắt giữ, xử lý) — cần xác nhận dùng chỉ tiêu nào |
| Tổng số vụ phát hiện, bắt giữ, xử lý | Vụ | ⚠️ như trên |
| Số vụ (không tính số vụ vi phạm về thời hạn) | Vụ | ❌ **chưa có chỉ tiêu riêng** — nếu muốn theo dõi 2E cần bổ sung |
| Số vụ khởi tố | Vụ | ✅ gần với `KS_HS` (chủ trì xử lý hình sự) — cần xác nhận |
| Số vụ chuyển nguồn tin kiến nghị khởi tố | Vụ | ❌ chưa có |
| Máy phát hiện ma tuý / Máy soi hành lý | Lượt | ⚠️ app gộp 1 chỉ tiêu `KS_MM` (sử dụng máy móc, thiết bị chuyên dùng) — cân nhắc tách |

### 4.3. Dị thường dữ liệu phát hiện khi kiểm tra file

- Dòng "Máy phát hiện ma tuý": ô F = "2,34" khi chỉ tiêu quý D = 0 → không rõ quy ước; dòng "Máy soi hành lý": F = 1, N = 1 khi không có D, G–J.
- Ô tỷ lệ lưu dạng số thập phân (0.65) với định dạng `0%` → dễ nhập nhầm giữa "65%" và "0,65" khi chuyển dữ liệu.
- ➡️ Đề nghị khi nhập vào app: **nhập theo đơn vị hiển thị** (hệ thống đã hỗ trợ quy ước 1.234 = 1234; nhập % theo thang 0–100 đã cấu hình sẵn theo chỉ tiêu).

---

## 5. Phân biệt "tỷ lệ hoàn thành chỉ tiêu" vs "điểm đánh giá/xếp loại"

| Tiêu chí | 2E | 2D |
| :-- | :-- | :-- |
| Đối tượng | Đơn vị (theo lĩnh vực) | Từng cá nhân |
| Đơn vị đo | % (và số lượng/kim ngạch) | Điểm 0–100 (1 chữ số thập phân) |
| Kết quả | Tỷ lệ TH so chỉ tiêu | Mức xếp loại + đề xuất |
| Công thức nguồn | F=E/D; L..O=K/(G..J) (suy luận) | 02A/02B (chưa có) + ngưỡng (chưa có) |
| Có được tự tính? | Chưa — chờ xác nhận | **KHÔNG** — chưa có công thức, không tự chấm |

---

## 6. Đơn vị đo & định dạng — checklist kiểm tra

- 2C: số đếm (nhiệm vụ, vụ, cuộc, hồ sơ); % kiểu Việt Nam (dấu phẩy thập phân: 184,2%; 65,16%).
- 2D: điểm `#,##0.0`; một số ô để nhiều chữ số thập phân thô (88.34444444444433) — khi nhập vào hệ thống sẽ làm tròn 2 chữ số.
- 2E: Tỷ đồng / Cuộc / Vụ / Lượt / %; số kiểu Việt Nam (1.781; 2.369,60).
- ➡️ Hệ thống đã có sẵn: `displayScale` + `decimals` theo từng chỉ tiêu (cấu hình UI), nhập theo đơn vị hiển thị — lưu đơn vị gốc.

---

## 7. Tổng hợp: công thức CÓ căn cứ vs CÒN THIẾU

**Có căn cứ toán học (đã kiểm chứng số học khớp file gốc):**
1. ((chủ trì − vụ thời hạn) + phối hợp) ÷ chỉ tiêu giao = 184,2% (2C).
2. Đã thanh toán ÷ dự toán = 82% (2C mục 6).
3. D = tổng 3 tháng ÷ 3 cho lao động gián tiếp (2D, 6 dòng).
4. F = E/D và L..O = K/(G..J) (2E — cấu trúc, chưa lưu formula).
5. Cross-check 2C ↔ 2E: KTSTQ 2 cuộc, tiền ~6 triệu; ĐTCBL 33 vụ chủ trì; giải ngân 0,41/0,5 tỷ = 82% — **khớp cả 4 cặp số**.

**Còn thiếu (không được tự đặt):**
1. Quy ước 13 nhiệm vụ vênh (2C mục 1).
2. Định nghĩa vụ "không tính vào chỉ tiêu" theo thời hạn.
3. Công thức điểm thành phần + ngưỡng xếp loại (2D — cần 02A/02B).
4. Công thức "giảm X% so cùng kỳ" (2C/2E).
5. Ý nghĩa chuẩn "Số thu NSNN" (phát sinh vs thực thu) và cấu trúc "số thu từ KTSTQ".

---

## 8. Thuế & Nợ thuế — hiện trạng app và câu hỏi nghiệp vụ

**Hiện trạng (không sửa gì):** app đang tách riêng **`THU_NSNN` ("Thu NSNN — số thuế phát sinh")** và các nhóm phí/lệ phí (`PHI_PS` phát sinh phải thu, `PHI_THU` đã thu, `PHI_LK_THU` lũy kế đã thu, `PHI_CON` còn phải thu cuối kỳ = PS − THU [+ mốc số dư]); **`NO_THUE` là chỉ tiêu số dư (BALANCE)** + `XOA_NO` lũy kế. Hệ thống **chưa gộp** "số thuế phát sinh" với "số thực thu" vào một cột.

**Câu hỏi cần Hải quan xác nhận:**
1. "Số thu nộp NSNN" trong 2C/2E là **số phát sinh** hay **số thực thu**? Nguồn số chuẩn từ đâu (phần mềm nghiệp vụ nào)?
2. Có cần tách 2 chỉ tiêu độc lập "Số thuế phát sinh" / "Số thực thu NSNN" trên app không? (làm được ngay bằng cấu hình, không sửa code)
3. "Số thu NSNN từ KTSTQ" = tổng những khoản nào (ấn định thuế / chậm nộp / phạt)?
4. Nợ thuế: theo dõi **số dư tại thời điểm** (đầu kỳ/cuối kỳ) + các khoản biến động nào (phát sinh mới, đã nộp, xóa nợ, gia hạn, miễn giảm)? Công thức số dư cuối kỳ chính thức?

---

## 9. Câu hỏi đề nghị xác nhận (trước khi triển khai bất kỳ tính điểm nào)

1. "KPI 02C" đang chỉ đến (i) tỷ lệ 2E, (ii) điểm/xếp loại 2D, hay (iii) đếm nhiệm vụ 2C? *(mục 1)*
2. 13 nhiệm vụ vênh trong 2C — quy ước đếm? *(mục 2.1)*
3. Công thức 184,2% như suy luận có đúng không; "08 vụ thời hạn không tính" áp dụng thế nào? *(mục 2.2)*
4. Gửi kèm **phiếu 02A/02B + hướng dẫn chấm điểm + ngưỡng xếp loại** (hiện chưa có trong hồ sơ)? *(mục 3.3)*
5. Xác nhận F=E/D, L..O=K/(G..J) và quy ước nhập %? *(mục 4.1)*
6. Các mục ❌/⚠️ ở bảng 4.2: bổ sung chỉ tiêu mới (giải ngân, vụ không tính thời hạn, chuyển nguồn tin) hay giữ nguyên danh mục? *(mục 4.2)*
7. Thuế & nợ thuế: 4 câu hỏi ở mục 8.

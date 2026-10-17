# ÁNH XẠ BIỂU MẪU ĐÁNH GIÁ — BẢN 2 (ĐÍNH CHÍNH NGÀY 17/10/2026 — ĐỢT 2)

**Phạm vi:** hệ chấm điểm cá nhân **01A/02A (công chức) · 01B/02B (lãnh đạo) · sheet nền "Bảng 1 (tính điểm CC)"** và nhóm tổng hợp theo đơn vị **2C/2D/2E**.
**Trạng thái:** TÀI LIỆU PHÂN TÍCH — **không nội dung nào đã được đưa vào hệ thống; không dùng để chấm điểm/xếp loại**.
**Thay thế:** bản 1 (`KPI_2C_2D_2E_ANH_XA_CONG_THUC.md` — đã đổi tên thành tài liệu này; đính chính ở mục 0).

> **Quy ước riêng tư:** tài liệu **không ghi tên cá nhân, không ghi điểm/kết quả thật** từ workbook. File gốc đối chiếu theo mã: **LĐ-1, LĐ-2** (workbook lãnh đạo), **CC-1, CC-2, CC-3** (workbook công chức) — nhận dạng theo cấu trúc sheet ở mục 2.

---

## 0. ĐÍNH CHÍNH so với báo cáo 17/10 (đợt 1)

| Kết luận bản cũ | Đính chính (đợt 2) |
| :-- | :-- |
| "Chưa có phiếu **02A/02B** trong hồ sơ; công thức tính điểm nằm ngoài file" | **SAI.** Các biểu **01A (CC), 01B (LĐ), 02A (CC), 02B (LĐ)** nằm **bên trong** các workbook cá nhân của `Dữ liệu.zip` dưới dạng **sheet** (không chỉ ở file đặt tên có chữ "Mẫu"). Đã đọc bằng công cụ và trích được **công thức Excel gốc thật** (mục 4). |
| "2D là mẫu duy nhất liên quan điểm cá nhân" | 2D chỉ là **bảng tổng hợp cuối**. Chuỗi thật: `Bảng 1 (tính điểm CC)` → `01A/01B` (3 tỷ lệ % + trọng số 70%) → `02A/02B` (quý) → `2D`. |
| "2C/2D/2E khác bản chất hệ chấm điểm" | **Giữ nguyên.** Có thêm căn cứ: nhóm 2C/2D/2E là **tổng hợp theo đơn vị** (2E: **0 ô công thức**; 2D: **6 ô** phụ trợ; 2C: văn bản docx) — khác hẳn hệ 01*/02* có công thức chấm điểm. |

**Phương pháp đợt 2:** giải nén **toàn bộ** `Dữ liệu.zip` (13 mục) → đọc từng sheet, từng ô bằng công cụ (ExcelJS) → liệt kê **100% ô chứa formula** của **mọi file**, không lọc theo tên file. Bản trích chi tiết giữ ở khu vực tạm, **không commit**.

## 1. Quy ước trạng thái xác nhận

| Nhãn | Nghĩa |
| :-- | :-- |
| **[GỐC]** | Công thức Excel thực có trong file gốc (trích nguyên văn bằng công cụ) |
| **[GỐC — biến thể]** | Cùng mục đích nhưng giữa các file ghi khác nhau → phải chốt 1 chuẩn |
| **[ĐỀ XUẤT / CHỜ XÁC NHẬN]** | Suy ra từ cấu trúc/tên cột — **chưa phải công thức chính thức**, không dùng để chấm |
| **[KHÔNG CÓ CÔNG THỨC]** | Ô nhập tay / không có formula trong file |
| **[KHÔNG NHẤT QUÁN]** | Dữ liệu mẫu giữa các file mâu thuẫn — không tự suy diễn |

## 2. Kiểm kê `Dữ liệu.zip` (đã kiểm tra toàn bộ)

| Mã | Mục trong zip | Sheet đáng chú ý | Ô công thức |
| :-- | :-- | :-- | :-- |
| LĐ-1 | workbook lãnh đạo (QIII) | `Danh mục sản phẩm` (~3.454 dòng) · `02B Quý III(LĐ)` · `01B tháng 9` · `Kế hoạch công tác tháng 10` · `PHỤ LỤC 3` | 02B/01B: đầy đủ; Danh mục: vài ô phụ |
| LĐ-2 | workbook lãnh đạo (QIII) | `02B Quý III (LĐ)` · `01B (LĐ)` · `Kế hoạch tháng 10` · `PHỤ LỤC 3` — **không có sheet Danh mục sản phẩm** | 02B/01B: đầy đủ |
| CC-1 | 3 workbook "Bảng theo dõi, đánh giá" tháng 7/8/9 (một nhân sự; riêng tháng 9 kèm biểu quý) | `Danh mục sản phẩm` · `Bảng 1 (tính điểm CC)` · `Biểu 01A (CC)` · (T9: `Biểu 02A Quý III (CC)`) · `Kế hoạch tháng …` · `PHỤ LỤC 3` | Bảng 1 + 01A: đầy đủ; 02A: **chỉ còn Mục I** |
| CC-2 | workbook công chức (tháng 9 + quý III) | `Danh mục sản phẩm` · `Bảng 1 (tính điểm CC)` · `Biểu 01A (CC) Tháng 9` · `Biểu 02A (CC) Quý III` · `Kế hoạch tháng 10` · `PHỤ LỤC 3` | đầy đủ (02A: 3 tỷ lệ Mục II là **số tĩnh**) |
| CC-3 | workbook "Bảng tính kết quả xếp loại tháng 9" | `Danh mục sản phẩm` · `Bảng 1 (tính điểm CC)` · `Biểu 01A (CC)` (nhãn "Mẫu 01A") · `Biểu 02A Quý III (CC)` (nhãn "Mẫu 02A") · `Kế hoạch tháng` · `PHỤ LỤC 3` | 01A: đầy đủ; 02A: **chỉ còn Mục I** |
| — | `Mẫu 2D theo CV 1601.xlsx` | `Bảng tổng hợp kết quả đánh giá ` + `Sheet1` (nháp) | 6 ô (chia 3) — mục 5.2 |
| — | `Mẫu 2E.xlsx` | `Sheet1` | **0 ô** |
| — | `Mẫu 2C … .docx` · `Công van.docx` · `CV 2431 … (bản cuối).pdf` · file tạm `~$…` | văn bản / rác Excel | — |

Ghi chú: `so phan cong nhiem vu.xls` (căn cứ YC-24) thuộc bộ dữ liệu kỳ trước, **không** nằm trong zip này.

## 3. Sơ đồ chuỗi công thức gốc đã trích xuất

```
[Bảng 1 (tính điểm CC)] — theo từng dòng sản phẩm/công việc
   G = E×F            (giao quy đổi)
   I = E×H            (hoàn thành quy đổi)
   J = C              (ngày hoàn thành — hiện gán bằng ngày hết hạn)
   K = J−C            (hoặc IF(J−C>0, J−C, 0) ở một số file)
   L = I − K×25%×I    (hoàn thành đạt tiến độ)
   N = I − M×25%×I    (hoàn thành đạt chất lượng; M = số lần làm lại)
   → hàng tổng SUM; 3 tỷ lệ %: I/tổngG · L/tổngG · N/tổngG (×100)
        │
        ▼
[01A/01B tháng] = Điểm Mục I (tự chấm) + 70% × (đầu vào Mục II)
        │           · CC: Mục II = TB 3 tỷ lệ từ Bảng 1
        │           · LĐ: Mục II = TB điểm tập thể đánh giá (6 tiêu chí con)
        ▼
[02A/02B quý]   = cùng khuôn; mức độ điền Mục II KHÔNG nhất quán giữa các file
        │
        ▼
[2D] = tổng hợp điểm + mức xếp loại (mức xếp loại nhập tay — không có ngưỡng)
```

## 4. BẢNG ÁNH XẠ CHI TIẾT — HỆ CHẤM ĐIỂM CÁ NHÂN

### 4.1. Sheet nền `Bảng 1 (tính điểm CC)` (CC-1, CC-2, CC-3)

| Nguồn file | Sheet | Ô/cột | Nội dung chỉ tiêu | Công thức Excel gốc (nếu có) | Công thức nghiệp vụ đề xuất | Trạng thái xác nhận |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| CC-1/2/3 | Bảng 1 (tính điểm CC) | Cột C | Ngày hết hạn | *(nhập tay)* | Hạn hoàn thành sản phẩm | [KHÔNG CÓ CÔNG THỨC] |
| CC-1/2/3 | idem | Cột E | Hệ số quy đổi | *(nhập tay — theo sheet `Danh mục sản phẩm`)* | Lấy hệ số theo danh mục QĐ1277 (mục 4.6) | [KHÔNG CÓ CÔNG THỨC] |
| CC-1/2/3 | idem | Cột F | Số lượng giao | *(nhập tay)* | Khối lượng giao theo sản phẩm | [KHÔNG CÓ CÔNG THỨC] |
| CC-1/2/3 | idem | Cột G | SL giao quy đổi | `=E*F` *(chính bảng tự ghi "(7)=(5)*(6)" ở dòng tiêu đề)* | Giao quy đổi = hệ số × SL giao | [GỐC] |
| CC-1/2/3 | idem | Cột H | SL hoàn thành thực tế | *(nhập tay — một số ô gõ kiểu "=F" copy)* | Khối lượng hoàn thành | [KHÔNG CÓ CÔNG THỨC] |
| CC-1/2/3 | idem | Cột I | SL hoàn thành quy đổi | `=E*H` *(bảng ghi "(9)=(5)*(8)")* | Hoàn thành quy đổi | [GỐC] |
| CC-1/2/3 | idem | Cột J | Ngày hoàn thành | `=C` — đang **copy cứng** bằng "Ngày hết hạn" | Theo thiết kế là ngày hoàn thành thực tế — cần chốt quy ước | [GỐC — biến thể] · **CHỜ XÁC NHẬN** |
| CC-1/2/3 | idem | Cột K | Chênh lệch so hạn | CC-2: `=J-C` (không chặn âm); CC-1/CC-3: `=IF(J-C>0,J-C,0)` (chặn âm) | "Số ngày/lần chậm" — chốt 1 chuẩn + đơn vị đo | [GỐC — biến thể] · **CHỜ XÁC NHẬN** |
| CC-1/2/3 | idem | Cột L | SL hoàn thành đạt tiến độ (quy đổi) | `=I-K*25%*I` *(bảng ghi "(12)=(9)-(11)*25%*(9)")* | Trừ 25% giá trị quy đổi cho mỗi đơn vị chậm | [GỐC] |
| CC-1/2/3 | idem | Cột M | Số lần yêu cầu làm lại | *(nhập tay)* | Đếm số lần làm lại | [KHÔNG CÓ CÔNG THỨC] |
| CC-1/2/3 | idem | Cột N | SL hoàn thành đạt chất lượng (quy đổi) | `=I-M*25%*I` *(bảng ghi "(14)=(9)-(13)*25%*(9)")* | Trừ 25% cho mỗi lần làm lại | [GỐC] |
| CC-1/2/3 | idem | Hàng tổng | Tổng các cột G/H/I/L/M/N | `=SUM(...)` | — | [GỐC] |
| CC-1/2/3 | idem | Hàng tỷ lệ % | 3 tỷ lệ: số lượng · đạt tiến độ · đạt chất lượng | `=tổng/tổngG*100` (ô I·L·N) | 3 đầu vào Mục II của biểu tháng | [GỐC] |
| CC-1/2/3 | idem | Vùng nháp cuối sheet | Ô phụ trợ (bị **lỗi tham chiếu**: trỏ cột H thay vì I ở thành phần đầu) | có ở cả 3 file; kết quả sai; **01A/02A không dùng vùng này** (tham chiếu trực tiếp hàng tỷ lệ I·L·N) | bỏ qua khi chuẩn hóa — không sao chép lỗi | [GHI NHẬN — không áp dụng] |

*Vị trí hàng thay đổi theo file: hàng tổng/tỷ lệ nằm ở 19–20 (CC-1) · 32–33 (CC-2) · 53–54 (CC-3) — cùng bản chất. Ô tham chiếu từ 01A/02A trỏ đúng hàng tỷ lệ của từng file (I·L·N).*

### 4.2. `Biểu 01A (CC)` và `01B (LĐ)` — biểu tháng

| Nguồn file | Sheet | Ô/cột | Nội dung chỉ tiêu | Công thức Excel gốc (nếu có) | Công thức nghiệp vụ đề xuất | Trạng thái xác nhận |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| CC-1/2/3 | Biểu 01A (CC) | Nhóm con 1 | Tổng điểm 2 tiêu chí con đầu | `=D16+D17` (CC-3 lệch 1 hàng) | Cộng điểm tiêu chí con | [GỐC] |
| CC-1/2/3 | idem | Nhóm con 2 | Tổng điểm 4 tiêu chí con giữa | `=D19+D20+D21+D22` (CC-3 lệch 1 hàng) | Cộng điểm tiêu chí con | [GỐC] |
| CC-1/2/3 | idem | Nhóm con 3 | Tổng điểm 4 tiêu chí con cuối | `=D24+D25+D26+D27` (CC-3 lệch 1 hàng) | Cộng điểm tiêu chí con | [GỐC] |
| CC-1/2/3 | idem | Dòng tổng Mục I | **Tổng điểm MỤC I (tự chấm)** | `=D23+D18+D15` (CC-3: `=D24+D19+D16`) | Điểm tự chấm Mục I | [GỐC] |
| CC-1/2/3 | idem | Dòng "nối tiếp" Mục I | Giá trị dùng cho công thức tổng | `=D28` (CC-3: `=D29`) | — | [GỐC] |
| CC-1/2/3 | idem | Các ô con | Điểm từng tiêu chí | *(nhập tay — có cột "Điểm tối đa" đối chiếu bên cạnh)* | Ô nhập; **thang tối đa Mục I chờ xác nhận** (suy luận 30 — câu hỏi 3) | [KHÔNG CÓ CÔNG THỨC] |
| CC-1/2/3 | idem | D34·D35·D36 | 3 tỷ lệ % kéo từ Bảng 1 | `='Bảng 1 (tính điểm CC)'!I20 / L20 / N20` — CC-2 trỏ I33·L33·N33; CC-3 trỏ I54·L54·N54 | Kéo 3 tỷ lệ: số lượng · tiến độ · chất lượng | [GỐC] |
| CC-1/2/3 | idem | D37 | Điểm Mục II (TB 3 tỷ lệ) | `=(D34+D35+D36)/3` (CC-3: `=(D35+D36+D37)/3`) | Trung bình cộng 3 tỷ lệ | [GỐC] |
| CC-1/2/3 | idem | D38 | Mục II quy đổi 70% | `=D37*70/100` (CC-3: `=D38*70/100`) | Trọng số 70% | [GỐC] |
| CC-1/2/3 | idem | D33 (CC-3: D34) | Nối tiếp | `=D38` (CC-3: `=D39`) | — | [GỐC] |
| CC-1/2/3 | idem | D39 (CC-3: D40) | **TỔNG ĐIỂM biểu** | `=D33+C31` (CC-3: `=D34+C32`) | = Mục I + 70%×Mục II | [GỐC] — tổng thang 100 (khi Mục I thang 30): **[ĐỀ XUẤT / CHỜ XÁC NHẬN]** |
| CC-* | 01A/02A | Vùng tên/vị trí (B8·B9; A8·A11) | Họ tên / vị trí tự điền | `='Bảng 1 (tính điểm CC)'!A4 / A5` | Liên kết dữ liệu nhân sự | [GỐC] |
| LĐ-1/2 | 01B (LĐ) | Mục I | như 01A | chuỗi `=D…+D…`; tổng `=D23+D18+D15`; nối tiếp `=D28` | như 01A | [GỐC] |
| LĐ-1/2 | 01B (LĐ) | F33..F38 | Điểm TB từng tiêu chí Mục II (tập thể đánh giá) | LĐ-1: `=SUM(G33:AD33)/24`; LĐ-2: `=SUM(G33:J33)/4`; một số dòng dùng cột phụ `=SUM(AF36:AH36)/3` | Điểm đánh giá tập thể — **chốt quy ước số chia** (24 vs 4 vs 3) + xử lý ô trống | [GỐC — biến thể] · **CHỜ XÁC NHẬN** |
| LĐ-1/2 | 01B (LĐ) | D33..D38 | Nối tiếp điểm TB | `=+F33..` / `=+AI36..` | — | [GỐC] |
| LĐ-1/2 | 01B (LĐ) | D39 | Điểm Mục II (TB 6 tiêu chí con) | `=SUM(D33:D38)/6` | Trung bình cộng 6 tiêu chí con | [GỐC] |
| LĐ-1/2 | 01B (LĐ) | D40 | Quy đổi 70% | `=D39*70/100` | Trọng số 70% | [GỐC] |
| LĐ-1/2 | 01B (LĐ) | D32 | Nối tiếp | `=D40` | — | [GỐC] |
| LĐ-1/2 | 01B (LĐ) | D41 | **TỔNG ĐIỂM biểu** | `=D32+C30` | = Mục I + 70%×Mục II | [GỐC] |

**Mức xếp loại (HTXS/HTT/HT…): không có bất kỳ ô công thức nào trong mọi file** → ngưỡng "điểm → mức xếp loại" là **[KHÔNG CÓ] — CHỜ XÁC NHẬN** (câu hỏi 2).

### 4.3. `Biểu 02A (CC)` và `02B (LĐ)` — biểu quý

| Nguồn file | Sheet | Ô/cột | Nội dung chỉ tiêu | Công thức Excel gốc (nếu có) | Công thức nghiệp vụ đề xuất | Trạng thái xác nhận |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| CC-2 | Biểu 02A (CC) Quý III | Mục I | như 01A | `=D23+D18+D15`; nối tiếp `=D28` | như 01A | [GỐC] |
| CC-2 | idem | D34..D36 | 3 tỷ lệ Mục II | **số tĩnh** (không tham chiếu nguồn) | cần chốt: lấy TB 3 tháng hay đánh giá riêng quý (câu hỏi 4) | **[KHÔNG NHẤT QUÁN]** · CHỜ XÁC NHẬN |
| CC-2 | idem | D37·D38·D33·D39 | TB → 70% → nối tiếp → tổng | `=(D34+D35+D36)/3`; `=D37*70/100`; `=D38`; `=D33+C31` | như 01A | [GỐC — một phần] |
| CC-1, CC-3 | Biểu 02A Quý III (CC) | Mục I | như 01A | `=D16+D17` … `=D23+D18+D15` | như 01A | [GỐC] |
| CC-1, CC-3 | idem | Mục II & tổng | **thiếu toàn bộ chuỗi Mục II/tổng** (kể cả các ô tỷ lệ) | — | không suy diễn — chờ xác nhận quy ước | **[KHÔNG NHẤT QUÁN]** · CHỜ XÁC NHẬN |
| LĐ-1/2 | 02B Quý III (LĐ) | toàn bộ | như 01B | `=SUM(G33:AD33)/24` / `=SUM(G33:J33)/4`; `=SUM(D33:D38)/6`; `=D39*70/100`; `=D32+C30` | như 01B | [GỐC — biến thể số chia] |

### 4.4. Sheet kế hoạch tháng (mọi workbook) — một số file có nhãn **"Mẫu 02C"** ở ô tiêu đề

| Nguồn file | Sheet | Ô/cột | Nội dung chỉ tiêu | Công thức Excel gốc (nếu có) | Công thức nghiệp vụ đề xuất | Trạng thái xác nhận |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| LĐ-*, CC-* | Kế hoạch tháng… / Kế hoạch công tác tháng… | Ô tiêu đề cột E | Nhãn mẫu | chữ **"Mẫu 02C"** (một số file) | Cần xác nhận đây có phải "KPI 02C" đơn vị nói tới (câu hỏi 1) | [KHÔNG CÓ CÔNG THỨC] · CHỜ XÁC NHẬN |
| LĐ-*, CC-* | idem | Cột A–F | STT · Nội dung nhiệm vụ · Sản phẩm · Thời gian hoàn thành · **Chỉ tiêu/KPI** · Ghi chú | — | Khung kế hoạch tháng cá nhân (không chấm điểm) | [KHÔNG CÓ CÔNG THỨC] |

> 📌 Đợt 2 làm rõ thuật ngữ: ngoài 3 khả năng đã nêu ở bản 1 ((i) tỷ lệ 2E / (ii) điểm-xếp loại 2D / (iii) đếm nhiệm vụ 2C), nay có **khả năng (iv): "02C" là nhãn của mẫu Kế hoạch công tác tháng cá nhân** (bên trong có cột "Chỉ tiêu/KPI").

### 4.5. Sheet `PHỤ LỤC 3` (mọi workbook) — tổng hợp & đề xuất xếp loại

| Nguồn file | Sheet | Nội dung | Công thức Excel gốc (nếu có) | Công thức nghiệp vụ đề xuất | Trạng thái xác nhận |
| :-- | :-- | :-- | :-- | :-- | :-- |
| LĐ-*, CC-* | PHỤ LỤC 3 | Bảng đề xuất/tổng hợp mức xếp loại cá nhân theo kỳ (dòng theo từng người, kèm cột tự đề xuất / đơn vị đánh giá / căn cứ) | **không có ô công thức** (nhập tay toàn bộ) | Là căn cứ nghiệp vụ cho phần "đề xuất mức xếp loại" — chưa tự động hóa | [KHÔNG CÓ CÔNG THỨC] |

### 4.6. Sheet `Danh mục sản phẩm` (kèm hầu hết workbook; ~3.450–3.484 dòng)

| Nguồn file | Sheet | Cột | Nội dung | Công thức Excel gốc (nếu có) | Công thức nghiệp vụ đề xuất | Trạng thái xác nhận |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Hầu hết workbook (không có ở LĐ-2) | Danh mục sản phẩm | A–I | STT · Nhiệm vụ · Công việc chi tiết · Sản phẩm đầu ra · Phân nhóm · Khung điểm tối đa · Điểm · **Hệ số quy đổi** · Ghi chú — tiêu đề "BẢNG TỔNG HỢP DANH MỤC SẢN PHẨM/CÔNG VIỆC VÀ HỆ SỐ QUY ĐỔI VỀ SẢN PHẨM CHUẨN" (chia mục A/B) | phần lớn giá trị tĩnh; **một số ô cột "Hệ số quy đổi": `=G/25`** (Điểm ÷ 25) | Danh mục gốc cho cột E của Bảng 1; đối chiếu với danh mục QĐ1277 v1 (YC-11) trên app khi đơn vị duyệt | [GỐC cục bộ] · CHỜ XÁC NHẬN nghĩa "=Điểm/25" (câu hỏi 8) |

*Dị thường nhỏ ghi nhận: có ô tính phụ ngoài bảng (dạng "=185/50" rồi nhân hệ số) — không thuộc quy trình, bỏ qua.*

## 5. NHÓM TỔNG HỢP ĐƠN VỊ: 2C / 2D / 2E (giữ nội dung bản 1, cập nhật đợt 2)

### 5.1. Mẫu 2C — Báo cáo kết quả các lĩnh vực công tác của đơn vị (docx)

**5.1.1. Kiểm tra nhất quán mục 1 (nhiệm vụ trọng tâm) — ⚠️ có vênh:**

| Chỉ số trong file gốc | Giá trị | Kiểm tra |
| :-- | --: | :-- |
| Số nhiệm vụ được giao có thời hạn trong quý | 162 | |
| Số nhiệm vụ đã hoàn thành | 149 | 130 trước hạn + 19 đúng hạn + 0 chậm = **149 ✔** |
| — Hoàn thành trước hạn | 130 | |
| — Hoàn thành đúng hạn | 19 | |
| — Hoàn thành chậm tiến độ | 0 | |
| Số nhiệm vụ chưa hoàn thành | 0 | |

**Vênh:** 162 − 149 − 0 = **13 nhiệm vụ không được giải thích**. Quy ước ngầm "được giao = hoàn thành + chưa hoàn thành" **không thỏa** số liệu đã gửi → câu hỏi 9 (không tự suy diễn khi xây tỷ lệ hoàn thành).

**5.1.2. Các số khác + công thức suy luận (đã kiểm chứng số học):**

| Nội dung | Số trong file | Công thức suy luận | Kiểm chứng |
| :-- | :-- | :-- | :-- |
| Tỷ lệ ĐTCBL so kế hoạch | "43 vụ (33 chủ trì + 10 phối hợp); đạt 184,2% kế hoạch (giao 19 vụ); trong 33 vụ có 08 vụ thời hạn không tính vào chỉ tiêu" | ((33 − 8) + 10) ÷ 19 | 35 ÷ 19 = **184,2% ✔** |
| Giải ngân kinh phí chống buôn lậu | dự toán 500, đã thanh toán 410, "đạt 82%" | 410 ÷ 500 | = **82% ✔** |
| KTSTQ lũy kế | "đã kiểm tra 02 cuộc, tiền phạt khoảng 6 triệu đồng" | đếm + tổng tiền | khớp với 2E (K=2 cuộc; 0,006 tỷ) ✔ |
| Dịch vụ công trực tuyến | 36 hồ sơ quý; lũy kế 273; "giảm 3% so 2025" | — | không có công thức trong file |
| Mục 3 (báo cáo định kỳ) | **bỏ trống cả 3 số** | — | cần đơn vị bổ sung nếu muốn đưa lên hệ thống |

**5.1.3. Có căn cứ / còn thiếu:**
- **Có căn cứ (khớp số học):** tỷ lệ ĐTCBL 184,2% = ((chủ trì − vụ thời hạn) + phối hợp) ÷ giao; tỷ lệ giải ngân = đã thanh toán ÷ dự toán; đếm nhiệm vụ phân rã 3 mức.
- **Còn thiếu:** quy ước 13 nhiệm vụ vênh; định nghĩa "vụ vi phạm thời hạn làm thủ tục không tính vào chỉ tiêu"; công thức "giảm 3%/38% cùng kỳ".

### 5.2. Mẫu 2D — Bảng tổng hợp kết quả đánh giá, xếp loại (Quý III/2026)

- **Sheet chính "Bảng tổng hợp…"** (36 người): `STT | Họ và tên | Chức vụ | Tổng điểm trung bình (#,##0.0) | Đơn vị đánh giá, đề xuất mức xếp loại | Ghi chú | T9 | Cá nhân tự nhận`.
- **Sheet nháp "Sheet1"** (41 dòng): cùng nội dung nhưng lệch một số dòng so với bản chính (có 1 người ở nháp một mức, bản chính đổi mức; 1 người bản chính ghi "Chưa thực hiện đánh giá xếp loại QIII/2026. Chuyển sang đánh giá xếp loại vào QIV/2026" + viện dẫn khoản 6 Hướng dẫn số 02-HD/BTCTW ngày 22/5/2026).
- Mức xếp loại dùng trong file: Hoàn thành xuất sắc nhiệm vụ / Hoàn thành tốt nhiệm vụ / Hoàn thành nhiệm vụ / (Chưa đánh giá — chuyển kỳ).
- **Công thức CÓ trong file:** chỉ **6 dòng cuối** (bảo vệ / tạp vụ / lái xe — lao động gián tiếp) cột D là công thức thật: **D = (tổng điểm 3 tháng) ÷ 3** (tử số là số tĩnh gõ cứng). Toàn bộ dòng công chức còn lại: cột D là **số dán tay**.
- **ĐÍNH CHÍNH mục 3.3 bản 1:** "công thức tính điểm cá nhân từ phiếu 02A/02B — chưa có trong hồ sơ" → **nay đã có và đã trích xuất** (mục 4). Còn thiếu THẬT SỰ: (1) **ngưỡng điểm → mức xếp loại**; (2) quy ước tổng hợp quý cho CC (Mục II của 02A — các file làm khác nhau); (3) quy tắc chuyển kỳ.
- Bằng chứng mới cho "ngưỡng chưa chuẩn hóa": trong cùng 1 file, giữa bản chính và bản nháp có trường hợp **cùng một mức điểm nhưng ghi hai mức xếp loại khác nhau** (không nêu chi tiết cá nhân/điểm).
- Cột D bản chính = dán từ kết quả 02A/02B → quy trình dán tay dễ sai; nếu tự động hóa phải theo đúng quy ước được duyệt.
- **Hiện trạng app:** "Điểm tính thử — chưa chính thức" (KQ tháng) dùng chuỗi **Bảng 1/01A**: d = (a+b+c)/3 với a·b·c là 3 tỷ lệ (G, L, N chia tổng giao); phạt 25% mỗi đơn vị chậm/lần làm lại; ×70%. **Chuỗi này đã được đối chiếu khớp với công thức gốc trích xuất đợt 2** — nhưng vẫn giữ nhãn "chỉ tham khảo", **không dùng để xếp loại chính thức** khi chưa có ngưỡng.

### 5.3. Mẫu 2E — Kết quả thực hiện chỉ tiêu kế hoạch các lĩnh vực công tác trọng tâm

- **Xác nhận lại đợt 2 bằng công cụ: 0 ô công thức** trong toàn sheet.
- Cấu trúc 16 cột: `TT | Lĩnh vực/Nội dung | Đơn vị tính | D: Chỉ tiêu KH trong quý | E: Kết quả TH trong quý | F: Tỷ lệ (%) | G–J: Chỉ tiêu cả năm (BTC / Cục HQ / Chi cục / Phấn đấu) | K: Lũy kế từ đầu năm | L–O: Tỷ lệ lũy kế so chỉ tiêu năm (BTC / Cục / Chi cục / Phấn đấu) | P: Ghi chú`.
- **[ĐỀ XUẤT / CHỜ XÁC NHẬN]:** F = E/D; L..O = K/(G..J) — trong file là **giá trị tĩnh**, định dạng hiển thị `0%` (ô chứa 0.65 hiển thị 65%).

**Đối chiếu từng chỉ tiêu 2E ↔ 49 chỉ tiêu trong app:**

| 2E — dòng | Chỉ tiêu | Trạng thái trong app |
| :-- | :-- | :-- |
| Giải ngân vốn NSNN | Tỷ đồng | ❌ **chưa có chỉ tiêu** — đề xuất bổ sung khi được xác nhận |
| Giải ngân vốn đầu tư công | Tỷ đồng | ❌ chưa có |
| Số thu NSNN | Tỷ đồng | ✅ `THU_NSNN` — nhưng app ghi "(số thuế phát sinh)", cần thống nhất nghĩa với 2C "thu nộp NSNN" |
| Số cuộc KTSTQ | Cuộc | ✅ `KT_CUOC` |
| Số thu NSNN từ KTSTQ | Tỷ đồng | ⚠️ app tách 3 khoản: `KT_TIEN_AN` (ấn định thuế) + `KT_TIEN_CN` (chậm nộp) + `KT_TIEN_XP` (phạt) — **cần xác nhận "số thu" gồm khoản nào** |
| Số vụ chủ trì phát hiện, bắt giữ, xử lý | Vụ | ⚠️ app có `KS_VPHC` + `KS_BG` — cần xác nhận dùng chỉ tiêu nào |
| Tổng số vụ phát hiện, bắt giữ, xử lý | Vụ | ⚠️ như trên |
| Số vụ (không tính số vụ vi phạm về thời hạn) | Vụ | ❌ **chưa có chỉ tiêu riêng** — nếu muốn theo dõi 2E cần bổ sung |
| Số vụ khởi tố | Vụ | ✅ gần với `KS_HS` (chủ trì xử lý hình sự) — cần xác nhận |
| Số vụ chuyển nguồn tin kiến nghị khởi tố | Vụ | ❌ chưa có |
| Máy phát hiện ma tuý / Máy soi hành lý | Lượt | ⚠️ app gộp 1 chỉ tiêu `KS_MM` — cân nhắc tách |

**Dị thường dữ liệu (khi chuyển vào app):** ô tỷ lệ có giá trị dù chỉ tiêu quý D=0 (không rõ quy ước); ô tỷ lệ lưu dạng thập phân với định dạng `0%` → dễ nhập nhầm "65%" và "0,65". ➡️ Khi nhập vào app: **nhập theo đơn vị hiển thị** (hệ thống đã hỗ trợ 1.234 = 1234; % theo thang 0–100 đã cấu hình theo chỉ tiêu).

### 5.4. Bảng phân biệt ba nhóm

| Tiêu chí | 01A/01B/02A/02B + Bảng 1 | 2E | 2D |
| :-- | :-- | :-- | :-- |
| Đối tượng | Từng cá nhân | Đơn vị (theo lĩnh vực) | Tổng hợp từng cá nhân |
| Đơn vị đo | Điểm 0–100 (Mục I thang 30 + Mục II ×70%) | % và số lượng/kim ngạch | Điểm + mức xếp loại |
| Công thức nguồn | **Có** — đã trích xuất 100% ô formula (mục 4) | Không (0 ô) — F/L..O là suy luận chờ xác nhận | 6 ô chia 3 (phụ trợ); còn lại số tĩnh |
| Tự động hóa | **KHÔNG tự triển khai** — chờ duyệt công thức + ngưỡng xếp loại | chờ xác nhận nhập liệu | chờ quy ước + ngưỡng |

## 6. Đơn vị đo & định dạng — checklist kiểm tra

- 2C: số đếm (nhiệm vụ, vụ, cuộc, hồ sơ); % kiểu Việt Nam (dấu phẩy thập phân: 184,2%; 65,16%).
- 2D: điểm `#,##0.0`; một số ô để nhiều chữ số thập phân thô — khi nhập vào hệ thống sẽ làm tròn 2 chữ số.
- 2E: Tỷ đồng / Cuộc / Vụ / Lượt / %; số kiểu Việt Nam (1.781; 2.369,60).
- ➡️ Hệ thống đã có sẵn: `displayScale` + `decimals` theo từng chỉ tiêu (cấu hình UI), nhập theo đơn vị hiển thị — lưu đơn vị gốc.

## 7. Tổng hợp: công thức CÓ căn cứ vs CÒN THIẾU (cập nhật đợt 2)

**Có căn cứ (đã kiểm chứng số học / trích xuất công thức gốc):**
1. ((chủ trì − vụ thời hạn) + phối hợp) ÷ chỉ tiêu giao = 184,2% (2C).
2. Đã thanh toán ÷ dự toán = 82% (2C mục 6).
3. D = tổng 3 tháng ÷ 3 cho lao động gián tiếp (2D, 6 dòng).
4. F = E/D và L..O = K/(G..J) (2E — cấu trúc, chưa lưu formula).
5. Cross-check 2C ↔ 2E: KTSTQ 2 cuộc, tiền ~6 triệu; ĐTCBL 33 vụ chủ trì; giải ngân 0,41/0,5 tỷ = 82% — **khớp cả 4 cặp số**.
6. **MỚI (đợt 2): chuỗi chấm điểm cá nhân đầy đủ** — Bảng 1 (G/I/J/K/L/N + tỷ lệ %) → 01A/01B (Mục I + 70%×Mục II) → 02A/02B quý (mục 4.1–4.3, công thức nguyên văn).

**Còn thiếu (không được tự đặt):**
1. Quy ước 13 nhiệm vụ vênh (2C mục 1).
2. Định nghĩa vụ "không tính vào chỉ tiêu" theo thời hạn.
3. **Ngưỡng điểm → mức xếp loại** + quy ước Mục II của 02A + quy tắc chuyển kỳ (2D).
4. Công thức "giảm X% so cùng kỳ" (2C/2E).
5. Ý nghĩa chuẩn "Số thu NSNN" (phát sinh vs thực thu) và cấu trúc "số thu từ KTSTQ".

## 8. Thuế & Nợ thuế — hiện trạng app và câu hỏi nghiệp vụ

**Hiện trạng (không sửa gì):** app đang tách riêng **`THU_NSNN` ("Thu NSNN — số thuế phát sinh")** và các nhóm phí/lệ phí (`PHI_PS` phát sinh phải thu, `PHI_THU` đã thu, `PHI_LK_THU` lũy kế đã thu, `PHI_CON` còn phải thu cuối kỳ = PS − THU [+ mốc số dư]); **`NO_THUE` là chỉ tiêu số dư (BALANCE)** + `XOA_NO` lũy kế. Hệ thống **chưa gộp** "số thuế phát sinh" với "số thực thu" vào một cột.

**Câu hỏi cần Hải quan xác nhận:**
1. "Số thu nộp NSNN" trong 2C/2E là **số phát sinh** hay **số thực thu**? Nguồn số chuẩn từ đâu (phần mềm nghiệp vụ nào)?
2. Có cần tách 2 chỉ tiêu độc lập "Số thuế phát sinh" / "Số thực thu NSNN" trên app không? (làm được ngay bằng cấu hình, không sửa code)
3. "Số thu NSNN từ KTSTQ" = tổng những khoản nào (ấn định thuế / chậm nộp / phạt)?
4. Nợ thuế: theo dõi **số dư tại thời điểm** (đầu kỳ/cuối kỳ) + các khoản biến động nào (phát sinh mới, đã nộp, xóa nợ, gia hạn, miễn giảm)? Công thức số dư cuối kỳ chính thức?

## 9. CÂU HỎI CHỜ XÁC NHẬN (tổng hợp đợt 2)

1. **"KPI 02C"** nghĩa là gì: (i) tỷ lệ 2E, (ii) điểm/xếp loại 2D, (iii) đếm nhiệm vụ 2C, hay **(iv) nhãn "Mẫu 02C" của sheet Kế hoạch công tác tháng** (có cột "Chỉ tiêu/KPI")? *(mới)*
2. **Ngưỡng xếp loại:** bao nhiêu điểm là HTXS/HTT/HT? (không có công thức trong mọi file; trong 2D còn có bằng chứng cùng điểm ghi 2 mức khác nhau) *(mới)*
3. **Thang tối đa của Mục I** = 30? Điểm từng tiêu chí con lấy theo cột "Điểm tối đa" nào? *(mới)*
4. **Mục II của 02A (quý):** lấy trung bình 3 tháng từ 01A hay tự đánh giá riêng quý? (file mẫu làm 3 kiểu khác nhau: có chuỗi TB / số tĩnh / thiếu hẳn) *(mới)*
5. **Cột K (chậm tiến độ):** "số ngày" hay "số lần"; hoàn thành sớm (âm) xử lý thế nào; phạt "25% × K" mỗi đơn vị K đúng chưa? *(mới)*
6. **LĐ (01B/02B):** số chia trong `=SUM(G:AD)/n` xác định thế nào (số thành viên đánh giá? số cột có điểm?); ô trống có bị tính 0? *(mới)*
7. **Cột J:** quy ước "Ngày hoàn thành = Ngày hết hạn" (=C) hay ghi ngày thực tế? *(mới)*
8. **Hệ số quy đổi "=Điểm/25":** quy ước "đơn vị sản phẩm chuẩn = 25 điểm"? *(mới)*
9. 13 nhiệm vụ vênh trong 2C — quy ước đếm? *(bản 1)*
10. Công thức 184,2% như suy luận có đúng; "08 vụ thời hạn không tính" áp dụng thế nào? *(bản 1)*
11. Xác nhận F=E/D; L..O=K/(G..J) và quy ước nhập % cho 2E? *(bản 1)*
12. Thuế & nợ thuế: 4 câu hỏi ở mục 8. *(bản 1)*
13. Các mục ❌/⚠️ ở bảng 2E (giải ngân, vụ không tính thời hạn, chuyển nguồn tin…): bổ sung chỉ tiêu mới hay giữ nguyên danh mục 49? *(bản 1)*

## 10. KHÔNG LÀM trong bước này

- Không thêm/sửa code, không đổi cấu hình, không bật tính điểm, **không đưa dữ liệu cá nhân/điểm thật vào Production**.
- Các công thức đã trích xuất **chỉ dùng để tham chiếu** — chờ đơn vị trả lời mục 9 trước khi triển khai bất kỳ tính năng tính điểm nào.

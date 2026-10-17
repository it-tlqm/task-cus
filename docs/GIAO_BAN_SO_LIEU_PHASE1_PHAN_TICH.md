# Phân tích Giai đoạn 1 — Số liệu giao ban & Dashboard thuế (YC-16 → YC-22)

Ngày: 17/10/2026 · Trạng thái: **CHỜ HẢI QUAN XÁC NHẬN trước khi triển khai Giai đoạn 2**

Nguồn đã đọc (đủ): `Mau_Tuan_42.docx` (toàn bộ 4 phần, 7 bảng), ảnh Excel "Tổng hợp số thu ngày 16/10/2026", ảnh menu mobile, phiếu yêu cầu YC-16 → YC-22.

---

## 1. Hiện trạng các module liên quan (đã kiểm tra trước khi bổ sung)

| Module | Hiện có | Liên quan yêu cầu | Kết luận |
|---|---|---|---|
| Bảng điều hành (dashboard) | KPI công việc + AI tóm tắt | YC-16: đưa số thuế lên trang chủ | **Bổ sung** khu vực "Tình hình thu NSNN"; không thay KPI hiện có |
| Giao ban (đang có: Biên bản giao ban) | Họp → kết luận → chuyển thành nhiệm vụ | YC-18: "mục riêng phục vụ giao ban" | **Mở rộng nhóm menu Giao ban**: giữ biên bản hiện có + thêm trang Số liệu / Nhập liệu / Báo cáo tuần. Không tạo hệ thống trùng chức năng |
| Báo cáo (reports) | Báo cáo tuần theo nhiệm vụ + xuất Excel + chốt kỳ | YC-20: xuất Word theo mẫu | **Giữ nguyên**; báo cáo giao ban số liệu là luồng riêng (xuất DOCX ở GĐ4) |
| Việc tháng (KQ tháng) | Công chức tự đánh giá kết quả tháng | YC-21: có đưa vào Giao ban? | **Không đụng** — chờ xác nhận cách hiểu YC-21 (Câu hỏi 9) |
| Danh mục SP, Nhiệm vụ | Đang chạy | Giới hạn XI: giữ nguyên | Không đổi |

Đã xác nhận trong DB: **chưa có bảng dữ liệu số liệu nghiệp vụ nào** → toàn bộ phần số liệu sẽ là **bảng mới (additive)**, không sửa/không reset dữ liệu hiện có.

---

## 2. Danh mục chỉ tiêu trích từ Mẫu Tuần 42 (đầy đủ)

### Phần đầu biên bản
- Thời gian họp giao ban: Bắt đầu / Kết thúc (giờ, ngày).

### I. CÔNG TÁC NGHIỆP VỤ HẢI QUAN

**1.1. Thu NSNN** — các cột: *Tuần · Lũy kế Tháng · Lũy kế Năm · Tăng/giảm % so cùng kỳ 2025 · % chỉ tiêu BTC giao · % chỉ tiêu UBND tỉnh giao · % chỉ tiêu KH tháng*.

**1.2. Miễn giảm – hoàn thuế** (2 dòng: Hoàn thuế, Không thu): *Phát sinh (số bộ hồ sơ) · Phát sinh (số tiền) · Lũy kế năm (số QĐ/bộ) · Lũy kế năm (số tiền) · Ghi chú*.

**1.3. Phí hải quan**: *Phải thu đầu kỳ · PS phải thu trong kỳ · Số đã thu trong kỳ · Lũy kế số đã thu · Còn phải thu cuối kỳ*.

**1.4. Nợ thuế**: chưa đặc tả trong mẫu — cần chốt cấu trúc (Câu hỏi 4).

**1.5. Xóa nợ thuế**: nội dung văn bản + số liệu (số công ty & số tiền đã xóa; tồn chưa xóa: tổng + chi tiết thuế NK / phạt chậm nộp).

**2. Kim ngạch**
- 2.1. Số lượng doanh nghiệp: *Phát sinh Tuần · Phát sinh trong tháng · Lũy kế Năm · Tăng/giảm so cùng kỳ*.
- 2.2. Kim ngạch XNK – Giám sát (2 khối × 2 dòng: số lượng tờ khai, kim ngạch USD): *Phát sinh Tuần · Phát sinh Tháng · Lũy kế Năm · Tăng/giảm % cùng kỳ*.
- 2.3. Cư dân biên giới (lượt hành khách XNC, tờ khai, kim ngạch USD): *Phát sinh Tuần · Lũy kế Tháng · Lũy kế Năm · Tăng/giảm cùng kỳ*.

**3. Tham vấn trị giá hải quan**: *Tờ khai tham vấn Tuần · Lũy kế Tháng · Lũy kế Năm · Ghi chú*; + *Tờ khai chờ tham vấn* (số dư thời điểm).

**4. Quản lý rủi ro**: bảng 3 dòng (Theo kế hoạch giao / Ngoài kế hoạch / Tổng) × *Hồ sơ đã thu thập XLTT Tuần · Lũy kế Tháng · Lũy kế Năm · Đạt % chỉ tiêu KH giao (44 DN)*; + *Số tin cung cấp thiết lập tiêu chí* (tuần + lũy kế).

**5. Số liệu kiểm soát chống buôn lậu** — 11 dòng chỉ tiêu, mỗi dòng: *Chỉ tiêu giao · Tuần · Tháng · Năm · Tỷ lệ % · Ghi chú*:
1. Bắt giữ, xử lý (vụ); 1.1. Chủ trì xử lý VPHC (vụ) gồm: vi phạm kiểm soát HQ, vi phạm thủ tục HQ, số tiền phạt VPHC; 1.2. Chủ trì xử lý hình sự (vụ); 1.3. Phối hợp bắt giữ, xử lý (vụ); 2. Tuyên truyền vận động quần chúng (cuộc); 3. Tuần tra hải quan (lượt); 4. Lập hồ sơ ĐTNCNTH (hồ sơ); 5. Xác lập chuyên án (hồ sơ); 6. Sử dụng máy móc, thiết bị chuyên dùng; 7. Huấn luyện chó nghiệp vụ — **tách 2 đại lượng: số giờ / số lần** (không gộp).

### II. Đánh giá công tác kiểm soát chống buôn lậu
- Văn bản theo kỳ (nhận xét, đánh giá định tính). Không biến thành chỉ tiêu số.

### III. CÔNG TÁC TỔNG HỢP, BÁO CÁO
1. **Phúc tập và KTSTQ**: văn bản + bảng 8 dòng (Số cuộc KTSTQ · QĐ KTSTQ · TB kết quả KTSTQ · QĐ Ấn định thuế · Số tiền ấn định · Số tiền chậm nộp · QĐ xử phạt VPHC · Số tiền phạt) × *Tuần · Tháng · Quý · Năm 2026* (đơn vị: đồng). Lũy kế năm không reset; cột Quý = lũy kế quý IV từ 01/10.
2. Công tác Văn phòng — văn bản.
3. Công tác hợp tác quốc tế — văn bản.
4. Công tác phát sinh khác trong kỳ — văn bản.

### IV. CÔNG TÁC ĐẢNG – ĐOÀN THỂ
- Văn bản theo kỳ.

### Bổ sung từ ảnh Excel "Tổng hợp số thu ngày" (nguồn nhập hằng ngày)
- **Ô tô**: số thuế phát sinh trong ngày; lũy kế tháng (lượng xe + số tiền thuế); lũy kế năm (số lượng xe, trị giá USD, tổng số thuế).
- **Hàng hóa khác (than cốc)**: số thuế phát sinh trong ngày; lũy kế tháng (trị giá USD + số tiền thuế); lũy kế năm (trị giá USD + tổng số thuế).
- **Tổng cộng** = Σ các phân loại (kiểm tra chéo: tổng số thuế ngày = Σ số thuế theo mặt hàng).
- Các ô tỷ lệ (%BTC, %UBND, %KH tháng, so tháng trước, so cùng kỳ 2025) — **hệ thống tự tính**, không nhập tay.

---

## 3. Phân loại chỉ tiêu (bắt buộc theo YC-19.4 — không cộng máy móc)

| Loại | Cách xử lý | Ví dụ trong mẫu |
|---|---|---|
| **Phát sinh theo ngày** (cộng dồn được) | Nhập hằng ngày (chọn ngày phát sinh); tuần/tháng/quý/năm = tổng | Thu NSNN; tờ khai & kim ngạch XNK/GS; cư dân biên giới; tham vấn; phí HQ (PS phải thu, đã thu); các vụ/tiền KSBL; KTSTQ; số xe ô tô; số bộ miễn giảm/hoàn thuế |
| **Số dư** (theo thời điểm) | Nhập mốc đầu kỳ hoặc chốt cuối kỳ; **không cộng dồn** | Phải thu đầu kỳ / còn phải thu cuối kỳ (phí HQ); nợ thuế; tờ khai chờ tham vấn; tồn chưa xóa nợ |
| **Kế hoạch / chỉ tiêu giao** | Cấu hình theo năm/tháng, có hiệu lực, phân quyền sửa | Chỉ tiêu BTC, UBND tỉnh, KH tháng; chỉ tiêu từng nhiệm vụ KSBL; 44 DN rủi ro |
| **Lũy kế** | Tính = **mốc đầu kỳ đã xác nhận** + phát sinh sau mốc | Lũy kế tháng/quý/năm các chỉ tiêu phát sinh; lũy kế số đã thu phí |
| **Tỷ lệ (%)** | Công thức; **chỉ tính khi đủ dữ liệu**, thiếu chỉ tiêu → không hiển thị | %BTC = LK năm ÷ chỉ tiêu năm; %UBND = LK năm ÷ chỉ tiêu năm; %KH tháng = LK tháng ÷ KH tháng; % nhiệm vụ KSBL = LK năm ÷ chỉ tiêu giao; tăng/giảm = so cùng kỳ |
| **Văn bản theo kỳ** | Người có thẩm quyền nhập/sửa, lưu vết | II đánh giá KSBL; III.2–4; IV đảng–đoàn thể; ghi chú xóa nợ; mô tả phúc tập |

**Đối chiếu công thức với số in sẵn trong tài liệu** (để không tự bịa công thức): tỷ lệ %BTC, %UBND, %KH tháng, % các nhiệm vụ KSBL tính theo các công thức trên đều **khớp** với số liệu trong Word và Excel (kiểm chéo ngày 16/10). Tỷ lệ tăng/giảm cùng kỳ chỉ hiển thị khi có dữ liệu năm trước tương ứng.

**Lưu ý đơn vị đo** (đưa vào danh sách xác minh): mẫu có ô ghi "triệu đồng" nhưng giá trị in là đơn vị đồng → đề xuất **lưu dạng số chính xác theo đồng**, đơn vị hiển thị theo từng chỉ tiêu, không quy đổi làm tròn khi cộng.

---

## 4. Bảng ánh xạ: chỉ tiêu → nguồn → đơn vị → công thức

Quy ước: LK = lũy kế; "Mốc" = số dư lũy kế đầu kỳ đã xác nhận (mục 5).

### A. Quản lý thuế

| # | Chỉ tiêu | Loại | Đơn vị | Nguồn nhập | Công thức tổng hợp |
|---|---|---|---|---|---|
| A1 | Thu NSNN — phát sinh | Phát sinh/ngày | đồng | Nhóm Quản lý thuế | Tuần = Σ ngày trong tuần; LK tháng = Σ từ 01 tháng; LK năm = Mốc + Σ sau mốc |
| A2 | Thu NSNN — Ô tô: số thuế | Phát sinh/ngày | đồng | Như trên | Σ lũy kế; tổng ngày phải = Σ phân loại (kiểm tra chéo) |
| A3 | Thu NSNN — Ô tô: lượng xe | Phát sinh/ngày | xe | Như trên | Σ tháng / Σ năm |
| A4 | Thu NSNN — Ô tô: trị giá USD | Phát sinh/ngày (*) | USD | Như trên | Σ lũy kế |
| A5 | Thu NSNN — Than cốc: số thuế | Phát sinh/ngày | đồng | Như trên | Σ lũy kế |
| A6 | Thu NSNN — Than cốc: trị giá USD | Phát sinh/ngày (*) | USD | Như trên | Σ lũy kế |
| A7 | Miễn giảm/hoàn thuế — số bộ, số tiền (2 dòng: Hoàn thuế, Không thu) | Phát sinh (theo ngày phát sinh) | bộ / đồng | Nhóm Quản lý thuế | Tuần = Σ ngày; LK năm = Mốc + Σ sau mốc |
| A8 | Phí HQ — PS phải thu | Phát sinh/ngày | đồng | Nhóm Quản lý thuế | Σ trong kỳ |
| A9 | Phí HQ — số đã thu | Phát sinh/ngày | đồng | Như trên | Σ trong kỳ; LK đã thu = Mốc + Σ sau mốc |
| A10 | Phí HQ — phải thu đầu kỳ | Số dư | đồng | Suy ra | = Còn phải thu cuối kỳ của kỳ liền trước |
| A11 | Phí HQ — còn phải thu cuối kỳ | Số dư (suy ra) | đồng | Công thức | = Đầu kỳ + A8 − A9 (công thức luân chuyển, không cộng dồn số dư) |
| A12 | Nợ thuế | Số dư (*) | đồng | *Cần chốt* | *Chờ Câu hỏi 4* |
| A13 | Xóa nợ thuế (đã xóa / tồn chưa xóa) | Văn bản + số | đồng | Nhóm Quản lý thuế | Số theo văn bản/quyết định; không tự cộng |

### B. Kim ngạch

| # | Chỉ tiêu | Loại | Đơn vị | Nguồn nhập | Công thức |
|---|---|---|---|---|---|
| B1 | Số lượng doanh nghiệp — phát sinh | Phát sinh (đếm DN lần đầu trong kỳ — *cần chốt quy ước chống trùng DN*, Câu hỏi 12) | DN | Nhóm Kim ngạch | Tuần = Σ ngày; tháng/năm = Σ lũy kế |
| B2 | XNK — số lượng tờ khai | Phát sinh/ngày | tờ khai | Nhóm Kim ngạch | Σ tuần/tháng/năm |
| B3 | XNK — kim ngạch | Phát sinh/ngày | USD | Như trên | Σ (thập phân chính xác, không làm tròn khi cộng) |
| B4 | Giám sát — số lượng tờ khai | Phát sinh/ngày | tờ khai | Như trên | Σ |
| B5 | Giám sát — kim ngạch | Phát sinh/ngày | USD | Như trên | Σ |
| B6 | Cư dân biên giới: lượt hành khách XNC / tờ khai / kim ngạch | Phát sinh/ngày | lượt / tờ khai / USD | Như trên | Σ tuần/tháng/năm |
| B7 | Tăng/giảm % cùng kỳ (B1–B6) | Tỷ lệ | % | Tính tự động | = (kỳ này − cùng kỳ) ÷ cùng kỳ × 100; chỉ khi có dữ liệu cùng kỳ |

### C. Tham vấn trị giá

| # | Chỉ tiêu | Loại | Đơn vị | Nguồn nhập | Công thức |
|---|---|---|---|---|---|
| C1 | Tờ khai tham vấn | Phát sinh/ngày | tờ khai | Nhóm Tham vấn | Σ tuần/tháng/năm |
| C2 | Tờ khai chờ tham vấn | Số dư | tờ khai | Nhập số dư thời điểm | Không cộng dồn |

### D. Quản lý rủi ro

| # | Chỉ tiêu | Loại | Đơn vị | Nguồn nhập | Công thức |
|---|---|---|---|---|---|
| D1 | Hồ sơ XLTT — theo KH giao / ngoài KH / tổng | Phát sinh/ngày | hồ sơ | Nhóm QLRR | Σ tuần/tháng/năm; Tổng = KH giao + ngoài KH (kiểm tra chéo) |
| D2 | % đạt chỉ tiêu KH giao | Tỷ lệ | % | Tính tự động | = LK năm ÷ 44 DN × 100 (chỉ tiêu cấu hình) |
| D3 | Số tin cung cấp thiết lập tiêu chí | Phát sinh/ngày | tin | Như trên | Tuần = Σ; lũy kế = Σ |

### E. Kiểm soát chống buôn lậu (KSBL)

| # | Chỉ tiêu | Loại | Đơn vị | Nguồn nhập | Công thức |
|---|---|---|---|---|---|
| E1 | Bắt giữ, xử lý | Phát sinh/ngày | vụ | Nhóm KSBL | Σ tuần/tháng/năm; % = LK năm ÷ chỉ tiêu giao |
| E2 | Chủ trì xử lý VPHC (gồm: vi phạm KS HQ, vi phạm thủ tục HQ, số tiền phạt) | Phát sinh/ngày | vụ / đồng (phạt ghi rõ đơn vị) | Như trên | Σ; % = LK năm ÷ chỉ tiêu |
| E3 | Chủ trì xử lý hình sự | Phát sinh/ngày | vụ | Như trên | Σ; % như trên |
| E4 | Phối hợp bắt giữ, xử lý | Phát sinh/ngày | vụ | Như trên | Σ; % |
| E5 | Tuyên truyền vận động quần chúng | Phát sinh/ngày | cuộc | Như trên | Σ; % |
| E6 | Tuần tra hải quan | Phát sinh/ngày | lượt | Như trên | Σ; % |
| E7 | Lập hồ sơ ĐTNCNTH | Phát sinh/ngày | hồ sơ | Như trên | Σ; % |
| E8 | Xác lập chuyên án | Phát sinh/ngày | hồ sơ | Như trên | Σ; % |
| E9 | Sử dụng máy móc, thiết bị chuyên dùng | Phát sinh/ngày | lượt | Như trên | Σ |
| E10 | Huấn luyện chó nghiệp vụ — **số giờ** | Phát sinh/ngày | giờ | Như trên | Σ (tách riêng) |
| E11 | Huấn luyện chó nghiệp vụ — **số lần** | Phát sinh/ngày | lần | Như trên | Σ (tách riêng) |

### F. Công tác tổng hợp (KTSTQ) & văn bản

| # | Chỉ tiêu | Loại | Đơn vị | Nguồn nhập | Công thức |
|---|---|---|---|---|---|
| F1 | 8 dòng KTSTQ (số cuộc, QĐ, TB kết quả, QĐ ấn định, số tiền ấn định, chậm nộp, QĐ xử phạt, số tiền phạt) | Phát sinh/ngày | đồng / sự kiện | Nhóm Tổng hợp | Cột Tuần/Tháng/**Quý**/Năm = lũy kế theo kỳ (quý IV từ 01/10); không reset |
| F2 | Mô tả phúc tập & KTSTQ | Văn bản/kỳ | — | Nhóm Tổng hợp | Lưu theo kỳ |
| F3 | Đánh giá KSBL (phần II) | Văn bản/kỳ | — | Người có thẩm quyền | Lưu theo kỳ |
| F4 | Văn phòng / Hợp tác quốc tế / Phát sinh khác (III.2–4) | Văn bản/kỳ | — | Văn phòng/được phân công | Lưu theo kỳ |
| F5 | Đảng – đoàn thể (IV) | Văn bản/kỳ | — | Được phân công | Lưu theo kỳ |
| F6 | Thời gian họp giao ban | Phiên bản báo cáo | — | Thư ký/lãnh đạo | Lưu theo phiên bản báo cáo |

(*) Trang bị USD và trị giá nhập theo ngày hay theo kỳ — chờ Hải quan xác nhận (Câu hỏi 2). Đề xuất nhập hằng ngày cùng số thuế để lũy kế tự động chuẩn.

---

## 5. Xử lý mốc lũy kế & dữ liệu lịch sử (YC-19.2)

Cơ chế **"Mốc lũy kế đã xác nhận"**:

1. Lãnh đạo (hoặc người được ủy quyền) tạo mốc: *chỉ tiêu + giá trị + ngày mốc + nguồn* (VD: "Số thật hết Tuần 41 (01–11/10) theo báo cáo giao ban Tuần 41") + người xác nhận + thời điểm.
2. Công thức chung: **Lũy kế (đến ngày d) = Mốc gần nhất (ngày ≤ d) + tổng phát sinh SAU ngày mốc đến d**. Mọi bản ghi ≤ ngày mốc bị loại khỏi tổng → chống cộng trùng.
3. Hệ thống **không tự lấy số từ ảnh/Word làm mốc chính thức** — số in trong tài liệu chỉ để đối chiếu; mốc phải được xác nhận trong app (lưu vết đầy đủ).
4. Cảnh báo khi: sửa/xóa bản ghi đã nằm trong vùng mốc; sửa dữ liệu của kỳ báo cáo đã chốt (khi đó tạo phiên bản điều chỉnh, không âm thầm đổi).
5. Áp dụng ngay cho Tuần 42: mốc hết 11/10 cho các chỉ tiêu (thu NSNN, km ngạch, KSBL, KTSTQ…); Tuần 42 = tổng 12–18/10; LK tháng 10 = mốc + phát sinh sau mốc; cập nhật thêm ngày 17–18/10 thì mọi số tự đổi đúng (theo đúng test số 3, 7, 8, 9 của mục X).

---

## 6. Phân quyền (đề xuất — cấu hình trong app, không hardcode)

- Bảng phân công: **Nhóm/Chỉ tiêu → Cán bộ nhập → Phạm vi ngày được sửa → Người kiểm tra**.
- Nhóm theo mẫu (ví dụ, cấu hình được): Quản lý thuế · Kim ngạch & giám sát · Tham vấn trị giá · Quản lý rủi ro · Kiểm soát chống buôn lậu · Tổng hợp/KTSTQ · Văn phòng & Đảng–đoàn thể.
- **Backend kiểm tra mọi thao tác ghi** (không chỉ ẩn nút); mỗi lần sửa lưu **giá trị trước/sau + người + thời điểm**.
- Cán bộ không được phân công: không truy cập được form nhập của bộ phận khác (chặn ở API).
- Lãnh đạo: xem toàn bộ, cấu hình chỉ tiêu/mốc/target, xử lý điều chỉnh.

---

## 7. Kiến trúc tối thiểu đề xuất (GĐ2–GĐ3) — chờ xác nhận trước khi migration

**8 bảng MỚI (additive — không sửa/không reset bảng hiện có):**

| # | Bảng | Nội dung |
|---|---|---|
| 1 | `metric_groups` | Nhóm chỉ tiêu (cấu hình: mã, tên, thứ tự) |
| 2 | `metric_definitions` | Định nghĩa chỉ tiêu: mã, tên, nhóm, đơn vị, kiểu giá trị (tiền/tờ khai/vụ/usd/giờ…), phân loại (ô tô / than cốc / khác hoặc rỗng), cách tổng hợp (phát sinh / số dư / văn bản), hiệu lực |
| 3 | `metric_daily_entries` | Bản ghi số liệu theo ngày: chỉ tiêu + ngày + đơn vị + phân loại + giá trị (NUMERIC chính xác) + trạng thái + người nhập + ghi chú. **Ràng buộc duy nhất (chỉ tiêu, ngày, đơn vị, phân loại)** → lưu nhiều lần không sinh trùng |
| 4 | `metric_entry_revisions` | Lịch sử sửa: giá trị trước/sau, người sửa, thời điểm |
| 5 | `metric_opening_balances` | Mốc lũy kế: chỉ tiêu + ngày mốc + giá trị + nguồn + trạng thái xác nhận |
| 6 | `metric_plan_targets` | Chỉ tiêu giao: loại (BTC/UBND/KH tháng/KSBL/…) + kỳ (năm/quý/tháng) + giá trị + nguồn văn bản |
| 7 | `metric_entry_assignments` | Phân công nhập liệu: người + nhóm/chỉ tiêu + đơn vị + phạm vi ngày + quyền kiểm tra |
| 8 | `briefing_narratives` + `briefing_report_versions` | Văn bản theo kỳ (II, III.2–4, IV…); phiên bản báo cáo đã chốt (snapshot — báo cáo đã chốt không tự đổi khi nguồn sửa) |

**Kỹ thuật:** tiền/giá trị dùng kiểu **NUMERIC** (không dấu phẩy động); tỷ lệ tính ở server, làm tròn hiển thị 2 chữ số; xóa mềm + revision (không xóa cứng dữ liệu đã dùng).

**API mới (GĐ2):** nhập/lấy số liệu ngày (upsert theo khóa duy nhất); tổng hợp lũy kế + % (dùng chung cho dashboard & giao ban); cấu hình chỉ tiêu/target/mốc/phân công (lãnh đạo, có audit); nhận xét theo kỳ.

**Trang mới:** khu vực "Thu NSNN" trên Bảng điều hành; `/giao-ban` (hub: Tổng quan kỳ + Nhận xét), `/giao-ban/nhap` (nhập liệu ngày), `/giao-ban/bao-cao` (xem trước + xuất DOCX — GĐ4); menu nhóm **Giao ban** trên Desktop + Mobile.

**Kiểm tra chất lượng tự động:** ngày thiếu số liệu (cảnh báo theo nhóm); giá trị âm bất thường; tổng ≠ Σ thành phần; lũy kế lệch mốc; phát hiện nhập trùng.

---

## 8. Thiết kế Dashboard thuế (YC-16)

- **Vị trí:** khu vực nổi bật "Tình hình thu ngân sách nhà nước" (trên/dưới KPI công việc hiện có — không thay KPI cũ).
- **Desktop:** 5 thẻ KPI (Số thu ngày gần nhất · Lũy kế tháng · Lũy kế năm · % BTC · % UBND) + thanh tiến độ %KH tháng + dòng trạng thái "Số liệu ngày cuối: dd/mm — đã xác nhận / chờ rà soát" + link **"Xem chi tiết → Giao ban số liệu"**.
- **Mobile:** 2–4 KPI chính, mở rộng xem thêm (accordion) — không đưa bảng Excel dài lên trang chủ.
- **Chưa có dữ liệu → hiển thị "Chưa có số liệu"** + nút đến trang nhập; **không hiển thị 0 giả**; không sao chép số trong ảnh thành số chính thức.
- Phân biệt nhãn **"Số thu phát sinh"** (bảng thuế ngày) và **"Thu NSNN"** (mẫu giao ban) cho đến khi Hải quan xác nhận là một (Câu hỏi 1); dữ liệu lấy 100% từ API thật.

## 9. Thiết kế phân hệ Giao ban (YC-18)

Nhóm menu **Giao ban** (giữ Biên bản giao ban hiện có, thêm phần số liệu — không trùng chức năng):

- **Tab A. Tổng quan kỳ:** chọn tuần/tháng/năm; thông tin kỳ; chỉ tiêu quan trọng; **tình trạng cập nhật của từng nhóm** (đã nhập/chưa nhập); cảnh báo thiếu số liệu; trạng thái báo cáo.
- **Tab B. Số liệu nghiệp vụ:** đúng cấu trúc Mẫu Tuần 42 (mục 4/5/6).
- **Tab C. Nhận xét – đánh giá:** người có thẩm quyền nhập/sửa (II, III.2–4, IV); lưu vết.
- **Tab D. Báo cáo:** xem trước tổng hợp; GĐ4 xuất **DOCX theo mẫu** + lưu phiên bản.
- **Mobile:** bảng dài → cuộn dọc theo mục/thẻ; giữ menu gọn (gộp trong nhóm Giao ban, xác nhận YC-21 tại Câu hỏi 9).

---

## 10. Câu hỏi cần Hải quan xác nhận trước Giai đoạn 2

**Bắt buộc (chặn triển khai):**

1. **"Số thuế phát sinh" (bảng Excel ngày) và "Thu NSNN" (mẫu Word) là một hay hai khái niệm?** Nếu một → dùng chung một nguồn; nếu hai → quản lý tách riêng (YC-16.3).
2. **Trị giá USD và số lượng xe: nhập hằng ngày hay theo kỳ?** (Đề xuất: nhập hằng ngày cùng số thuế.)
3. **Đơn vị "triệu đồng" trong mẫu nhưng giá trị in là đồng** — xác nhận lưu gốc theo đồng, hiển thị theo chỉ tiêu?
4. **Nợ thuế (mục 1.4):** theo dõi dạng số dư thời điểm, hay đầu kỳ → đã thu → cuối kỳ như phí HQ?
5. **Quy trình kiểm soát số liệu:** có cần Nháp → Gửi kiểm tra → Xác nhận/Cần điều chỉnh, hay chỉ cần người được phân công nhập và lãnh đạo xem/sửa? (YC-22.2: chỉ bổ sung mức phù hợp, không tạo quy trình nặng.)
6. **Chỉ tiêu giao:** xác nhận giá trị chính thức năm 2026 (BTC, UBND, KH từng tháng) + chỉ tiêu KSBL/QLRR + ai được cập nhật (đề xuất: lãnh đạo cấu hình trong app, có lưu vết).
7. **Mốc lũy kế:** đồng ý cơ chế mốc đã xác nhận (mục 5)? Số mốc "hết Tuần 41" (in trong tài liệu tham khảo) do ai xác nhận vào hệ thống?

**Cần chốt khi thiết kế chi tiết:**

8. **Ai nhập nhóm nào:** đề xuất lãnh đạo tự cấu hình phân công trong app (không cần gửi danh sách cứng) — đồng ý?
9. **YC-21 — hai cách hiểu:** (a) chuyển mục "KQ tháng" vào nhóm Giao ban, hay (b) chỉ đưa báo cáo Tuần vào Giao ban và **giữ KQ tháng nguyên chỗ**? (Đề xuất (b) — không đụng nghiệp vụ KQ tháng.)
10. **Ai được XEM số liệu thuế/kim ngạch:** chỉ lãnh đạo + người được phân công, hay mọi tài khoản đã đăng nhập?
11. **Số lượng doanh nghiệp (B1):** xác nhận quy ước đếm "DN phát sinh lần đầu trong kỳ" để không trùng DN giữa các ngày — hay cần quản lý theo mã DN (làm được nhưng nặng hơn)?
12. **KTSTQ (F1):** xác nhận các dòng là phát sinh cộng dồn để hệ thống tự lũy kế Tuần/Tháng/Quý/Năm (đúng tinh thần "không reset")?
13. **Dữ liệu quá khứ:** GĐ2 chỉ cần chuẩn từ mốc 11/10 trở đi, phần trước đó để trống/chỉ hiển thị mốc — đúng chứ?

---

## 11. Phạm vi thay đổi (dự kiến)

- **PostgreSQL:** CHỈ THÊM 8 bảng mới + index (additive). Không sửa bảng cũ, không reset, không xóa dữ liệu đang dùng thử.
- **Backend:** + API số liệu/tổng hợp/cấu hình mới; không đổi API cũ.
- **Frontend:** + khu vực Thu NSNN trên dashboard; + phân hệ Giao ban (3 trang); + nhóm menu Giao ban (Desktop/Mobile). Không đổi: KQ tháng, Danh mục SP, Nhiệm vụ, Báo cáo cũ, luồng đánh giá công chức.
- **GĐ4:** thêm thư viện xuất DOCX (dự án đã có `exceljs` cho Excel; `docx` sẽ bổ sung khi làm, chưa cài).

## 12. Phạm vi kiểm thử (đối chiếu mục X — thực hiện ở GĐ2–GĐ4)

17 mục test của yêu cầu sẽ chạy bằng **dữ liệu mô phỏng riêng** trước khi Hải quan nhập thật (phần số liệu hiện đang trống nên không đụng dữ liệu nghiệp vụ nào): nhập 15–16/10, sửa 1 ngày xem lũy kế nhảy đúng, chống trùng khi lưu nhiều lần, chặn người không được phân công, tuần 42 = 12–18/10, tháng 10 từ 01/10, mốc không cộng trùng, dashboard lấy API thật, trống ≠ 0, KQ tháng/Danh mục SP/Nhiệm vụ/Báo cáo cũ vẫn chạy. **Không tuyên bố hoàn thành chỉ vì có giao diện** — nghiệm thu theo số liệu.

## 13. Trạng thái triển khai / Git

- Bản deploy mới nhất: commit `54cc974` — **Nút Góp ý/Báo lỗi** (đã kiểm thử end-to-end trước khi đẩy, phục vụ gom phản hồi UAT).
- Tài liệu phân tích này: commit kèm theo (xem `git log`).
- **DB: chưa có thay đổi nào cho YC-16 → YC-22** — đúng yêu cầu "chưa migration lớn khi chưa hoàn tất phân tích + xác nhận".
- Biến môi trường: GĐ1 không cần thêm gì.

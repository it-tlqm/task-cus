# Công việc & chấm điểm — chốt hướng làm (29/10/2026)

## 1. Phạm vi

- Làm nhóm **Công việc** trước; chưa đụng Giao ban số liệu và Lịch trực.
- Mục tiêu: bỏ nhập trùng, lấy đúng **số lượng giao / số lượng hoàn thành**, tự động đổ vào KQ tháng và chấm điểm đúng mẫu 01A/01B/02A/02B.
- Không đưa lên Production cho đến khi có bản chạy thử được duyệt.

## 2. Các điểm đã chốt

| Nội dung | Quyết định |
|---|---|
| Số lượng gắn cho ai | Gắn cho nhiệm vụ / người chủ trì. Người phối hợp không nhập số lượng; muốn chia số lượng thì tách nhiệm vụ riêng. |
| Nhập số lượng hoàn thành | Nhập ngay khi cán bộ bấm hoàn thành. KQ tháng chỉ đọc lại, không nhập tay. |
| Tiêu chí chung | Cán bộ tự chấm từng tiêu chí. Lãnh đạo được sửa, không duyệt từng dòng. |
| Hạng mục TX chưa có hệ số | Vẫn ghi số lượng để theo dõi, nhưng chưa tính điểm cho đến khi gắn được mã QĐ1277 tương ứng. Không tự gán hệ số. |
| Lãnh đạo | Không lấy bình quân điểm của công chức phụ trách để tính điểm lãnh đạo. |

## 3. Công thức

### 3.1. Bảng 1 — phần kết quả nhiệm vụ của cá nhân

- `G = E × F` — số lượng giao quy đổi
- `I = E × H` — số lượng hoàn thành quy đổi
- `L = I − K × 25% × I` — trừ chậm tiến độ
- `N = I − M × 25% × I` — trừ làm lại
- `a = I / G × 100` — tỷ lệ % số lượng
- `b = L / G × 100` — tỷ lệ % tiến độ
- `c = N / G × 100` — tỷ lệ % chất lượng
- `d = (a + b + c) / 3`
- Điểm kết quả nhiệm vụ = `d × 70 / 100`

Trong đó:

- `E`: hệ số quy đổi
- `F`: số lượng giao
- `H`: số lượng hoàn thành thực tế
- `K`: số ngày chậm tiến độ — **phải chặn âm**: `K = max(0, ngày hoàn thành − hạn)`
- `M`: số lần yêu cầu làm lại

Lưu ý: file của Nguyễn Đình Giang dùng `K = J − C` (có thể âm nếu hoàn thành sớm); các file khác dùng `IF(J−C>0, J−C, 0)`. App phải theo cách chặn âm.

### 3.2. Lãnh đạo — mục III mẫu đánh giá

Lãnh đạo chấm 6 tiêu chí, tất cả theo thang tỷ lệ % (0–100%):

| Mã | Tiêu chí | Nguồn điểm |
|---|---|---|
| a | Điểm tỷ lệ % về số lượng kết quả thực hiện nhiệm vụ | Tổng hợp từ toàn bộ công chức thuộc phạm vi lãnh đạo phụ trách |
| b | Điểm tỷ lệ % về chất lượng kết quả thực hiện nhiệm vụ | Tổng hợp từ toàn bộ công chức thuộc phạm vi lãnh đạo phụ trách |
| c | Điểm tỷ lệ % về tiến độ kết quả thực hiện nhiệm vụ | Tổng hợp từ toàn bộ công chức thuộc phạm vi lãnh đạo phụ trách |
| d | Điểm tỷ lệ % đánh giá về kết quả hoạt động của bộ phận/đơn vị | Lãnh đạo tự chấm |
| đ | Điểm tỷ lệ % đánh giá về khả năng tổ chức triển khai thực hiện nhiệm vụ | Lãnh đạo tự chấm |
| e | Điểm tỷ lệ % đánh giá về năng lực tập hợp, đoàn kết công chức thuộc phạm vi quản lý | Lãnh đạo tự chấm |

Công thức:

- `D = (a + b + c + d + đ + e) / 6`
- Điểm kết quả nhiệm vụ của lãnh đạo = `D × 70 / 100`
- Tổng điểm = điểm tiêu chí chung (tối đa 30) + điểm kết quả nhiệm vụ (tối đa 70)

Nguyên tắc:

- **a/b/c lấy từ tất cả công chức thuộc phạm vi lãnh đạo phụ trách** (trực tiếp và gián tiếp), không lấy nhiệm vụ riêng của lãnh đạo.
- Cách tổng hợp a/b/c: **đã chốt — bình quân % của từng người**, mỗi công chức thuộc phạm vi phụ trách có trọng số bằng nhau. Nếu một công chức chưa có điểm, **chỉ chia theo số người có điểm**; hiển thị rõ số người còn thiếu.
- **d/đ/e**: lãnh đạo tự chấm.
- Nếu thiếu d/đ/e hoặc không có công chức thuộc phạm vi: ghi **“chưa đủ căn cứ”**, không lấy điểm của người ngoài phạm vi.

**Đối chiếu file lãnh đạo thực tế (29/10/2026):**

- Hoàng Văn Bằng — `01B tháng 9` / `02B Quý III`: a/b/c = `SUM(cột điểm từng công chức)/24`; d/đ/e tự chấm; `g = (a+b+c+d+đ+e)/6`; điểm = `g*70%`.
- Nông Xuân Ánh — `01B (LĐ)` / `02B Quý III (LĐ)`: a/b/c = `SUM/4`; d/đ/e tự chấm; cùng công thức.
- Như vậy công thức lãnh đạo trong kế hoạch là đúng với file mẫu.
- Đã chốt: `02B` lấy d/đ/e quý = **trung bình 3 tháng**, cho sửa nếu cần.

### 3.3. Tiêu chí chung — tối đa 30 điểm

| Nhóm | Tiêu chí | Điểm tối đa |
|---|---|---|
| I | Phẩm chất chính trị, phẩm chất đạo đức, văn hóa thực thi công vụ | 5 |
| I | Ý thức kỷ luật, kỷ cương trong thực thi công vụ | 5 |
| II | Năng lực chuyên môn, nghiệp vụ theo yêu cầu của vị trí việc làm | 2,5 |
| II | Khả năng đáp ứng yêu cầu thực thi nhiệm vụ được giao thường xuyên, đột xuất | 2,5 |
| II | Tinh thần trách nhiệm trong thực thi công vụ | 2,5 |
| II | Thái độ phục vụ người dân, doanh nghiệp và khả năng phối hợp với đồng nghiệp | 2,5 |
| III | Có sản phẩm, giải pháp đột phá, sáng tạo đem lại giá trị, hiệu quả thiết thực | 2,5 |
| III | Sẵn sàng tham gia nhiệm vụ chính trị đặc biệt quan trọng, đột xuất, phức tạp hoặc khó khăn | 2,5 |
| III | Có tinh thần chịu trách nhiệm trước kết quả công việc; chủ động nhận trách nhiệm khi có sai sót | 2,5 |
| III | Chủ động đưa ra quyết định trong phạm vi thẩm quyền, không né tránh; tiên phong trong nhiệm vụ mới | 2,5 |

Tổng tiêu chí chung = tổng 10 dòng, tối đa 30 điểm. Hệ thống tự cộng, không bắt người dùng tính.

## 4. Luồng nhập đề xuất

### A. Khi giao việc

Sau khi chọn nguồn TX/QĐ1277, hiện thêm một hàng:

`Số lượng giao | Đơn vị tính | Hệ số (tự hiện, không sửa)`

- Bắt buộc với việc có nguồn TX/QĐ1277.
- Ẩn với việc tự do, không có nguồn.
- Không thêm màn hình, không thêm bước.

### B. Khi cán bộ hoàn thành

Hiện thêm một hàng:

`Số lượng hoàn thành (mặc định bằng số giao) | Ngày hoàn thành (mặc định hôm nay)`

- Số ngày chậm và số lần làm lại do hệ thống tự tính.
- Không bắt người dùng nhập tay các số này.

### C. KQ tháng

- Tự sinh bảng 1 từ các việc trong tháng: số giao, số hoàn thành, ngày hoàn thành, hệ số.
- Chỉ sửa khi có ngoại lệ.
- Không nhập lại từ đầu.

### D. Tự đánh giá

- Cán bộ tự chấm 10 tiêu chí chung.
- Lãnh đạo được sửa trực tiếp.
- Bình thường chỉ hiện dòng **“Tiêu chí chung: 30/30”** và nút **“Chấm chi tiết”**; bấm vào mới mở bảng 10 dòng.
- Lãnh đạo có thêm 3 ô tự chấm d/đ/e; a/b/c lấy từ nhiệm vụ của chính lãnh đạo.

## 5. Ghi chú kỹ thuật

- `WorkItemProduct.quantity` và `quantityUnit` đã có; luồng tạo nhiệm vụ hiện chưa truyền vào.
- `MonthlyWorkResult.assignedQty`, `completedQty`, `lateCount`, `reworkCount`, `factorSnapshot` đã có.
- `ScoreRun` / `ScoreRunItem` đã có công thức Bảng 1.
- Cần thêm chỗ lưu **điểm chi tiết 10 tiêu chí** và **d/đ/e của lãnh đạo** (đề xuất: một cột JSON có kiểm tra schema, hoặc bảng con nếu cần thống kê theo tiêu chí).
- Cần giữ `computeLeaderDimensions` nhưng sửa phạm vi/cách tổng hợp a/b/c từ toàn bộ công chức thuộc quyền; thêm d/đ/e; sửa export 01B/02B in đủ 6 tiêu chí.
- Bảng điểm cũ giữ nguyên để đối soát; dùng `formulaVersion` mới cho công thức lãnh đạo. **Đã chốt: không tính lại tháng 9/2026**, chỉ áp dụng công thức mới từ tháng 10/2026.
- Tắt duyệt **phiếu đánh giá** (bỏ Gửi duyệt/Phê duyệt, chỉ còn Lưu và lãnh đạo sửa). **Giữ** mục “Kết quả xếp loại cuối cùng” để lãnh đạo chọn trực tiếp. Duyệt hoàn thành nhiệm vụ vẫn giữ.

### 5.1. Tính lại tháng 9/2026

**Đã chốt: Cách A — không tính lại tháng 9.**

- Tháng 9 giữ nguyên điểm đã tính theo công thức cũ (bình quân cấp dưới), đánh dấu “công thức cũ”.
- Từ tháng 10/2026 áp dụng công thức 6 tiêu chí.
- Không phải nhập bổ sung d/đ/e tháng 9; không làm lệch báo cáo đã gửi.
- Bảng điểm cũ vẫn giữ để đối soát.

## 6. Thứ tự thực hiện

1. Số lượng giao/hoàn thành + tự động đổ vào KQ tháng.
2. 10 tiêu chí chấm điểm + tắt duyệt phiếu đánh giá.
3. Bảng điểm lãnh đạo 6 tiêu chí + tổng hợp a/b/c từ toàn bộ công chức thuộc quyền + sửa export 01B/02B.
4. Test, migration, demo local; duyệt mới deploy.

## 7. Chốt cuối

1. Đã chốt: tắt duyệt phiếu đánh giá; duyệt hoàn thành nhiệm vụ vẫn giữ.
2. Đã chốt: giữ mục “Kết quả xếp loại cuối cùng” để lãnh đạo chọn trực tiếp.
3. Đã chốt: Cách A — không tính lại tháng 9/2026; chỉ áp dụng công thức mới từ tháng 10/2026.
4. Đã chốt: cách 1 — a/b/c của lãnh đạo là bình quân % của từng công chức thuộc phạm vi phụ trách, trọng số bằng nhau.
5. Đã chốt: nếu một công chức chưa có điểm, lãnh đạo chia bình quân theo **số người có điểm**; hiển thị số người còn thiếu, không tính người thiếu là 0.
6. Đã chốt: d/đ/e của lãnh đạo quý lấy **trung bình 3 tháng**, cho sửa nếu cần.

## 8. Kiểm thử cần có

- Giao việc từ TX/QĐ1277: lưu đúng số lượng giao, đơn vị tính, hệ số.
- Hoàn thành: lưu đúng số lượng hoàn thành, ngày hoàn thành; tự tính chậm/làm lại.
- KQ tháng: tự sinh đúng dòng, không nhân đôi, không nhập lại.
- Chấm điểm: 10 tiêu chí cộng đúng 30; a/b/c/d/đ/e của lãnh đạo cộng đúng 70; tổng đúng 100.
- Chặn âm số ngày chậm: hoàn thành sớm thì `K = 0`, không làm tăng điểm.
- Lãnh đạo: bình quân theo **số công chức có điểm**; hiển thị số người còn thiếu; không tính người thiếu là 0.
- Lãnh đạo quý: d/đ/e lấy trung bình 3 tháng, sửa được.
- Lãnh đạo lấy đủ tất cả công chức thuộc phạm vi phụ trách; không lấy ngoài phạm vi; a/b/c là bình quân % từng người, trọng số bằng nhau.
- Export 01A/01B/02A/02B: đúng cột, đúng công thức, đúng số liệu.

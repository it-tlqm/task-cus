# 01 — SỔ NGUỒN NGHIỆP VỤ, BẰNG CHỨNG VÀ KHOẢNG TRỐNG

## A. Nguồn đã được người phụ trách dự án cung cấp

| Nguồn | Bằng chứng kiểm tra được | Dùng để làm gì | Không được suy rộng |
|---|---|---|---|
| Tin nhắn Hải quan 19/10 | Cán bộ nhập đầu việc, hạn, ngày hoàn thành, file minh chứng, tự ra biểu, tiêu chí chung gợi ý, nhận xét lãnh đạo để trống; Đội trưởng bình quân 2 Đội phó, Đội phó bình quân công chức phụ trách; nút Chấp thuận phải xem trước | Xác định UX và mong muốn nghiệp vụ YC-33→37 | Không thay thế văn bản thẩm quyền/quy tắc chấm điểm |
| `Danh mục TX1.xls` (20/10) | 348 dòng công việc, sáu nhóm; 207 ô có hệ số, 10 ô hệ số `0`, 141 ô `NULL` (theo Giai đoạn 1 + đối chiếu file) | Danh mục TX hiện hành, mã NV/CBL/CNTT/PT/TH/DANG | Không coi hệ số TX là hệ số QĐ1277 nếu chưa có mapping hợp lệ |
| `danh.xlsx` + tin nhắn 20/10 | Danh sách cán bộ, bổ sung nhân sự, mô tả tổ chức; các tên ngắn còn mơ hồ | Đối chiếu nhân sự, đơn vị và người phụ trách | Không tự gán người theo họ/tên rút gọn, không cấp tài khoản |
| `Dữ liệu.zip` — workbook thực tế | Có `Bảng 1 (tính điểm CC)`, `Biểu 01A`, `Biểu 02A`, `01B`, `02B`, phụ lục, kế hoạch tháng, danh mục QĐ1277 | Chỉ mục công thức, đối soát ví dụ, thiết kế exporter, ghi nhận trường nhập tay | Workbook thực tế chứa nhập tay, ví dụ và khác biệt giữa file; không mặc nhiên là quy tắc được phê duyệt |
| `Dữ liệu.zip` — CV2431 ngày 25/9/2026 | Văn bản nhắc nguyên tắc “6 rõ”, **một đầu mối chủ trì**; quy định hồ sơ đánh giá quý, trách nhiệm/thẩm quyền, điều kiện không chỉ dựa vào điểm | Nguyên tắc giao việc, mô hình quyền, kiểm tra thiếu điều kiện xếp loại | Không suy rằng 90 điểm tự động “Xuất sắc” hoặc ngưỡng KPI một mình xác định xếp loại |
| `Dữ liệu.zip` — `Công văn.docx` | Danh mục hồ sơ gửi Chi cục gồm 02A/02B, 2C, 2D, 2E | Hiểu mục tiêu xuất và bộ hồ sơ | Không nhầm 2C báo cáo đơn vị với mẫu **02C kế hoạch tháng cá nhân** |
| `Dữ liệu.zip` — `Mẫu 2C...docx` | Báo cáo kết quả các lĩnh vực công tác của **đơn vị** | Backlog báo cáo đơn vị | Không mặc nhiên tính được từ nhật ký từng cán bộ |
| `Dữ liệu.zip` — `Mẫu 2D...xlsx` | Bảng tổng hợp kết quả xếp loại | Backlog cấp đơn vị | Mẫu có tên CV1601, cần đối chiếu CV2431 và mẫu mới nhất |
| `Dữ liệu.zip` — `Mẫu 2E.xlsx` | Chỉ tiêu thu NSNN, giải ngân, KTSTQ, CBL, thiết bị... | Backlog theo dõi chỉ tiêu đơn vị | Không lấy bừa từ Task/nhật ký cá nhân |
| `so phan cong nhiem vu(1).xls` | Mẫu phân công giám sát/vị trí trực theo ngày | Phân biệt lịch phân công với công việc có sản phẩm | Không tạo Task chấm điểm cho mỗi ca chỉ vì có tên trong sổ |

**Lưu ý:** Các file trong `Dữ liệu.zip` chứa tên/điểm/thông tin cá nhân thật. Chỉ dùng nội bộ để lập bằng chứng và kiểm thử ẩn danh. Không commit, không đưa vào bundle release, không log giá trị cụ thể của cá nhân.

## B. Bằng chứng công thức từ các workbook mẫu (để Agent tra và đối soát)

- Ở một workbook công chức, sheet `Bảng 1 (tính điểm CC)`: ví dụ `G12 = E12*F12` và `I12 = E12*H12` cho số lượng giao/hoàn thành quy đổi. Điều kiện nào định nghĩa số lượng hợp lệ, cấp phê duyệt, ngày kết quả cần được đối chiếu với schema hiện tại.
- Cùng workbook, `Biểu 01A (CC)` có các ô: `D37 = (D34+D35+D36)/3`, `D38 = D37*70/100`, `D39 = D33+C31`; phần tiêu chí chung tối đa 30 và thực hiện nhiệm vụ tối đa 70. **Đây là một ví dụ, không phải đủ logic áp dụng tất cả hồ sơ.**
- Workbook lãnh đạo có `01B tháng 9`, `02B Quý III(LĐ)`; ví dụ: `D39 = SUM(D33:D38)/6`, `D40 = D39*70/100`, `D41 = D32+C30`. Một số vùng `F33...F38` được chia cố định `/24` theo số người mẫu; **không hard-code `24` cho đơn vị hiện tại hoặc người được phụ trách**.
- Có workbook Quý III chứa chỉ tiêu/chấm điểm được nhập tay và Excel tổng hợp lịch sử. Không thể suy rằng điểm quý luôn bằng trung bình cộng ba điểm tháng. Phải đối chiếu quy tắc kỳ/quyền xác nhận.
- Văn bản CV2431 nhắc hồ sơ hàng quý: 02A, 02B, **Mẫu 2C báo cáo đơn vị**, 2D tổng hợp, 2E chỉ tiêu; trong workbook có **Mẫu 02C kế hoạch tháng**: hai mẫu này khác nghiệp vụ.
- Công văn có các điều kiện xếp loại ngoài điểm (nhiệm vụ chậm, chất lượng, kỷ luật, kết quả đơn vị, ngoại lệ) và phân cấp thẩm quyền; không thể tự phân loại chỉ bằng điểm số.

## C. Những điều chốt được để code

1. Tách nguồn dữ liệu công việc TX và sản phẩm QĐ1277; liên kết nếu có, giữ khả năng không ánh xạ hoặc nhiều sản phẩm theo cấu trúc nghiệp vụ được kiểm chứng.
2. Một công việc gốc chỉ ghi nhận một lần; không tự nhân đôi khi xem ở nhật ký/kế hoạch/kết quả tháng.
3. Xác định một đầu mối chủ trì; có thể có nhiều người phối hợp, giao thẳng cá nhân hoặc qua bộ phận.
4. Cán bộ tự nhập/chỉnh phần đánh giá thuộc trách nhiệm; lãnh đạo được nhận xét hoặc giữ trống để ghi tay; có lịch sử quyết định.
5. Mọi phần tự tính phải có `source`, `formula_version`, `inputs`, `precision/rounding` và trạng thái đủ căn cứ.
6. Bốn mẫu cá nhân phải phân biệt kỳ/đối tượng: **01A tháng công chức; 01B tháng lãnh đạo; 02A quý công chức; 02B quý lãnh đạo**.
7. Được phép deploy Production sau kiểm thử tự động; **chưa được coi là nghiệm thu UAT**.

## D. Những điều KHÔNG CHỐT — phải thể hiện thành trạng thái cấu hình/chờ xác nhận

- Cách ghép **hệ số TX** với **hệ số sản phẩm QĐ1277**, phạm vi tính điểm với việc không có sản phẩm chuẩn.
- Cách xử lý mức 0 vs NULL khi tính tỷ lệ (0 là giá trị gốc hợp lệ, không tự đổi thành NULL; nhưng mẫu tính có thể thiếu mẫu số).
- Quy tắc số lượng giao/hoàn thành, vượt mức, tiến độ/giảm điểm, bị yêu cầu làm lại, công việc kéo dài nhiều kỳ, hoàn thành có gia hạn hợp lệ, xác nhận chất lượng.
- Cách tính từ tháng lên quý và quy tắc thay đổi giữa biểu 01A/02A, 01B/02B.
- Đội trưởng là người đứng đầu hay phụ trách; người có thẩm quyền chính thức quyết định xếp loại; quan hệ hai đội phó/công chức theo **kỳ**.
- Điểm tiêu chí chung gợi ý cụ thể và ngưỡng đề xuất xếp loại, các điều kiện bổ sung.
- Các tên người/bộ phận còn mơ hồ, ánh xạ sáu nhóm danh mục TX với tổ chức.
- Cơ cấu số biểu 2C/2D/2E, mẫu mới hơn và nguồn số liệu chuẩn để xuất tự động.

**Lệnh xử lý khi thiếu căn cứ:** Không bịa. Ghi mục trong `docs/.../OPEN_QUESTIONS.md` với bằng chứng/ảnh hưởng, phát triển được phần data model/UI draft/test, tiếp tục chặng độc lập tiếp theo.

## E. Chỉ mục kiểm tra thực tế cho Agent

Đọc repo trước: `prisma/schema.prisma`, `src/config/navigation.ts`, `src/server/work-catalog.ts`, `src/app/api/personal-work-items/route.ts`, `src/app/api/work-evidence/route.ts`, `src/server/storage.ts`, `src/app/my-work`, các routes/Excel exporters/score services/approval hiện có, `docs/YC30_STAGE1_NAVIGATION_TX1_PEOPLE_2026-10-20.md` nếu tồn tại.

Không coi những đường dẫn này là đảm bảo tồn tại: xác minh bằng `git ls-files`/filesystem, tự tìm nơi code thật nếu đã đổi tên.

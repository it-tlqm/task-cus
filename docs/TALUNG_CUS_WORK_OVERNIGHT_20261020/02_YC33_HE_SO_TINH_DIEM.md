# 02 — YC-33: BỘ MÁY TÍNH HỆ SỐ / ĐIỂM QUY ĐỔI CÓ THỂ KIỂM CHỨNG

## 1. Mục tiêu

Sau khi công chức ghi nhận công việc thực tế, tiến độ, ngày hoàn thành và minh chứng, hệ thống có thể tổng hợp số lượng/sản phẩm đủ căn cứ, quy đổi và gợi ý điểm phục vụ biểu tháng/quý; **không khiến công chức nhập lại một việc**.

## 2. Thứ tự thực thi

1. Audit đường dữ liệu `Task` ↔ kế hoạch ↔ `PersonalWorkItem` ↔ kết quả tháng ↔ danh mục TX ↔ QĐ1277; xác định ID gốc, trạng thái duyệt và ngày thuộc kỳ.
2. Xây bảng `field -> source table/column -> template field/cell -> transformation -> validation -> decision status` từ Excel gốc. Không hardcode tên trường theo giả định từ docs cũ.
3. So sánh công thức Bảng 1 và Excel mẫu cùng loại; chỉ chốt công thức khi thống nhất và đủ thông tin đầu vào. Lập `formula-parity` fixtures đã ẩn danh.
4. Viết scoring service **thuần**, decimal-safe, có đầu vào rõ, kết quả `KNOWN|INSUFFICIENT_DATA|PENDING_RULE|NOT_APPLICABLE|ERROR` và danh sách lý do; không cộng `NULL` thành 0.
5. Lưu *snapshot* kỳ tính, rule version, product/coeff version, nguồn dữ liệu, thời gian, actor, audit. Không tự tính lại kỳ đã khóa khi hệ số sửa về sau.
6. Tích hợp read-only draft preview vào màn hình kết quả; server RBAC bắt buộc.
7. Đối soát kết quả ẩn danh tối thiểu nhiều bộ Excel mẫu tháng/quý; nếu chênh lệch, báo rõ số ô/công thức/nguồn, không sửa đầu vào để ép khớp.

## 3. Quy tắc dữ liệu

- Danh mục TX mới: 348 đầu việc, 207 ô hệ số không-null (gồm 10 giá trị 0), 141 `NULL`. **Không coi hệ số TX mặc nhiên là hệ số sản phẩm QĐ1277**.
- QĐ1277 là danh mục *sản phẩm đầu ra* và hệ số/phân nhóm theo quy định của nó; danh mục TX mô tả việc thường xuyên. Ánh xạ có thể chưa tồn tại.
- Một công việc có thể nhiều ngày, nhiều file, nhiều bản cập nhật, nhiều người phối hợp; chỉ tính số lượng được xác nhận theo nguồn hợp lệ, tránh nhân đôi do link kế hoạch/nhật ký/báo cáo.
- Với công việc đã được lãnh đạo giao, phân biệt `assigned_by`, `lead`, `collaborators`, `due`, `completed_at`, `accepted_at` (nếu có); thẩm quyền duyệt kết quả khác tự ghi ngày hoàn thành.
- Số lượng có thể khác số file đính kèm. Không dùng `number_of_files` làm số sản phẩm.
- Thời gian gia hạn nếu được cấp có thẩm quyền xác nhận: lưu hạn gốc/hạn sau duyệt + audit, không ghi đè trái phép khóa hạn YC-32.
- Tránh số thực binary khi nhân/chia; kiểm soát chia 0, giá trị âm, phạm vi %, quy tắc làm tròn có nguồn.

## 4. Công thức mẫu cần đối chiếu, KHÔNG hard-code không kiểm chứng

- Workbook `Bảng 1 (tính điểm CC)`: `G12=E12*F12`, `I12=E12*H12` trong dữ liệu mẫu.
- Workbook `Biểu 01A (CC)`: `D37=(D34+D35+D36)/3`, `D38=D37*70/100`, `D39=D33+C31`.
- Workbook `01B`/`02B`: biểu lãnh đạo có **sáu** chiều thành phần, ví dụ `D39=SUM(D33:D38)/6`, sau đó trọng số 70/100; cần nguồn hợp lệ cho từng chiều. Một file có chia cứng `/24` do số người trong ví dụ — không được bê nguyên số người.
- Không tự lấy trung bình tháng để ra quý khi biểu thực tế chưa xác nhận cách tổng hợp.
- Quy định ngoài số điểm có thể giới hạn xếp loại; **không tự suy ra xếp loại chính thức**.

## 5. Giao diện/đầu ra tối thiểu

- Bảng đối chiếu công việc và sản phẩm: mã TX (nếu có), sản phẩm QĐ1277 (nếu đã liên kết), số giao, số hoàn thành được xác nhận, hệ số nguồn, quy đổi, trạng thái áp dụng.
- Người dùng xem được *vì sao có điểm* hoặc *vì sao chưa có*: thiếu sản phẩm, thiếu hệ số, thiếu duyệt, thiếu quy tắc hay chưa thuộc kỳ.
- Không bắt buộc nhập một sản phẩm QĐ1277 cho mọi công việc TX.
- Kết quả có nhãn `DỰ THẢO / TỰ ĐÁNH GIÁ / ĐÃ XÁC NHẬN` theo workflow thật, không gắn nhãn chính thức tùy tiện.

## 6. Test bắt buộc

- `NULL coefficient` khác zero coefficient; zero giữ đúng giá trị và không tự suy là vắng dữ liệu.
- Không có mapping TX↔QĐ1277, mapping một-nhiều, công việc nhiều ngày, cùng một Task xuất hiện trong plan + nhật ký + kết quả.
- Tất cả trạng thái ngày hạn, quá hạn, hoàn thành sớm/đúng/chậm; cập nhật sau approval audit/403.
- 0 mẫu số, số lượng thiếu, lỗi precision, thêm file không tự tăng quantity.
- Không đổi điểm kỳ khóa khi hệ số danh mục sửa; thay đổi kỳ mở có version/audit.
- Không rò kết quả/điểm cá nhân khác qua API, log, export.
- Golden test: công thức đủ căn cứ phải so được Excel, ghi chênh lệch khi khác.

## 7. Tiêu chí hoàn thành

`YC33_ENGINE_READY` nếu logic có nguồn, tests chạy, snapshot/audit an toàn. `YC33_PARTIAL_WAITING_RULES` nếu số điểm cuối chưa đủ căn cứ; tuyệt đối không báo hoàn thành tính điểm tự động chỉ vì đã render nhãn và biểu đồ.

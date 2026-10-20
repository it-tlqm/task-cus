# 05 — YC-37: XEM TRƯỚC CHẤP THUẬN / KHÔNG ĐỒNG Ý / YÊU CẦU GIẢI TRÌNH

## 1. Yêu cầu người dùng/Hải quan

**Nhấn nút 'Chấp thuận' chỉ mở bước xem trước, KHÔNG tự động duyệt.** Người có thẩm quyền được xem đầy đủ nội dung rồi chọn **Đồng ý**, **Không đồng ý** (lý do), hoặc **Yêu cầu giải trình** (nội dung cần giải trình).

## 2. Audit trước khi sửa

- Liệt kê các nút/route/API có tên `Approve`, `Chấp thuận`, `Phê duyệt` tại Task, công việc, kế hoạch, kết quả đánh giá, minh chứng.
- Xác định chính xác ảnh phản hồi của Hải quan đang nói đến **nút trong ngữ cảnh nào**; không áp một modal mới cho mọi nút duyệt nếu workflow khác nhau.
- Kiểm tra bảng trạng thái và audit hiện có; không tự động đổi workflow của phần phê duyệt tháng/đánh giá khi chưa có nguồn.

## 3. Luồng đề xuất cho đúng ngữ cảnh đã xác minh

1. Người có quyền bấm nút Chấp thuận → hệ thống mở modal/trang preview, GET server authorized, không ghi quyết định.
2. Preview gồm: đối tượng hồ sơ, mã/tiêu đề, người giao/chủ trì, kỳ, hạn, tiến độ, kết quả, file đính kèm có quyền, yêu cầu trước, phiên bản dữ liệu.
3. Ba hành động: Đồng ý / Không đồng ý + lý do / Yêu cầu giải trình + câu hỏi/nội dung.
4. Submit gửi `expected_version`/revision hoặc ETag để chống thao tác đồng thời; server kiểm tra quyền + trạng thái chuyển hợp lệ + idempotency key.
5. Nếu yêu cầu giải trình: người nhận được thấy yêu cầu, trả lời + bổ sung minh chứng, gửi lại; cùng một hồ sơ gốc, có vòng lặp xét lại và audit.
6. Nếu từ chối: giữ lý do; quyết định xử lý tiếp tùy workflow thật, không tự xóa hồ sơ hoặc Task.
7. Nếu đồng ý: lưu người duyệt, thời điểm, phiên bản hồ sơ, trạng thái, thông báo theo hạ tầng hiện có.

## 4. Quyền và an toàn

- UI chỉ làm hướng dẫn; server phải enforce role, scope, ownership, team assignment.
- Không dùng `admin` mặc nhiên được duyệt mọi loại hồ sơ nếu quyền sản phẩm không cho phép.
- Không cho người gửi tự duyệt trái quy trình, không sửa quyết định cũ âm thầm; lưu lịch sử rõ ràng.
- File minh chứng chỉ qua endpoint có kiểm tra quyền; không link public hoặc permanent signed URL.
- Không leak lý do/nhận xét có dữ liệu nhạy cảm sang client khác, log, console, tracking.
- Không tạo hai audit hoặc hai lần đổi trạng thái khi double click, retry mạng hay 2 reviewer đồng thời.

## 5. UI/UX

- Modal dễ đọc trên desktop/mobile, scroll nội dung dài, có tiêu đề và trạng thái, nút đóng/Hủy an toàn.
- Ba lựa chọn phân biệt, nút đồng ý ở trạng thái chưa xác nhận không gửi thẳng; xác nhận quyết định ở bước cuối.
- Khi yêu cầu giải trình: ô nhập nội dung là bắt buộc, hiển thị người gửi, thời điểm, yêu cầu cũ, trạng thái chờ phản hồi.
- Accessibility: Escape, focus trap, focus return, confirmation, warning trước gửi quyết định và thông báo thành công/thất bại.

## 6. Tests

- Bấm `Chấp thuận` không thay đổi DB trước xác nhận.
- Cancel/Close/refresh không duyệt; xem trước có quyền/không có quyền.
- Đồng ý hợp lệ, từ chối thiếu lý do bị chặn, giải trình thiếu nội dung bị chặn.
- Người gửi giải trình bổ sung rồi gửi lại, không tạo Task/WorkItem trùng.
- Two simultaneous decisions chỉ một thắng; retry/idempotency không nhân đôi.
- Chuyển trạng thái trái phép phải trả 403/409/422 đúng ngữ nghĩa và có audit phù hợp; không phải 200 giả.
- Bảo toàn YC-32 doDate lock, evidence private và dữ liệu lịch sử.

## 7. Mốc hoàn thành

`YC37_CORE_DONE` khi preview, quyết định/giải trình, API guards, audit và E2E đạt. **Không tự đánh dấu hoàn thiện tất cả loại approval** nếu mới sửa một ngữ cảnh; báo rõ endpoint/nút được xử lý.

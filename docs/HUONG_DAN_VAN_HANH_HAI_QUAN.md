# SỔ TAY VẬN HÀNH — HỆ THỐNG QUẢN LÝ KẾ HOẠCH & CÔNG VIỆC
**Đơn vị:** Chi cục Hải quan khu vực XVI - Hải quan cửa khẩu Quốc tế Tà Lùng
**Địa chỉ sử dụng:** https://task-cus.vercel.app/

## 1. Đăng nhập lần đầu
1. Mở địa chỉ trên, nhập **mã cán bộ/tên đăng nhập** và **mật khẩu được cấp riêng**.
2. Bấm **Đăng nhập hệ thống**.
3. **Ngay lần đầu:** bấm nút **Đổi MK** trên thanh header, đặt mật khẩu mới (tối thiểu 8 ký tự, gồm cả chữ và số). Không dùng chung mật khẩu với đồng nghiệp.
4. Tuyệt đối không chia sẻ mật khẩu qua nhóm chat chung. Mất/quên mật khẩu: báo quản trị để đặt lại.

## 2. Bốn nhóm người dùng
| Nhóm | Thấy và làm được gì |
|---|---|
| Trưởng hải quan cửa khẩu | Toàn đơn vị: duyệt kế hoạch, nghiệm thu nhiệm vụ, duyệt gia hạn, chốt kỳ số liệu, xuất báo cáo |
| Trưởng bộ phận | Bộ phận mình: lập/trình kế hoạch, giao việc, nghiệm thu, duyệt gia hạn |
| Công chức | Việc của mình: nhận việc, cập nhật tiến độ, ghi nhật ký, xin lùi hạn có lý do |
| Quản trị hệ thống | Tạo/khóa tài khoản, quản lý cơ cấu — **không** duyệt nghiệp vụ, không chốt kỳ |

## 3. Quản trị: tạo tài khoản cho cán bộ mới (dành cho Quản trị hệ thống)
1. Vào **Quản trị → Cơ cấu tổ chức**.
2. Bấm **Thêm cán bộ mới**, nhập mã cán bộ (ví dụ `HQTL-049`), họ tên, chọn bộ phận và chức danh → Lưu.
3. Tại dòng cán bộ, bấm **+ Cấp tài khoản**: đặt tên đăng nhập (chữ thường, ví dụ `hqtl049`), mật khẩu khởi tạo (≥ 8 ký tự, cả chữ và số), chọn vai trò:
   - Công chức → vai trò `Công chức (STAFF)`, phạm vi `DEPARTMENT`;
   - Trưởng bộ phận → `Trưởng bộ phận`, phạm vi `DEPARTMENT`;
   - Chỉ lãnh đạo cao nhất mới dùng phạm vi `ORGANIZATION`.
4. Gửi tên đăng nhập + mật khẩu cho cán bộ **qua kênh riêng**, yêu cầu đổi ngay lần đầu.
5. Cán bộ chuyển đơn vị: dùng chức năng **Điều chuyển** (giữ nguyên lịch sử). Cán bộ nghỉ/chuyển công tác: **Khóa tài khoản** (không xóa). Tuyệt đối không tự khóa tài khoản của chính mình (hệ thống chặn).

## 4. Trưởng hải quan cửa khẩu / Trưởng bộ phận
- **Duyệt kế hoạch:** vào **Phê duyệt** → xem kế hoạch trình → **Duyệt** hoặc **Trả lại** (bắt buộc ghi lý do). Người lập không được tự duyệt.
- **Nghiệm thu nhiệm vụ:** cán bộ báo hoàn thành → nhiệm vụ chuyển **Chờ nghiệm thu** → kiểm tra kết quả thực tế → **Nghiệm thu** hoặc **Trả lại**.
- **Gia hạn:** cán bộ xin lùi hạn phải có lý do; duyệt/từ chối tại **Phê duyệt**. Hạn gốc luôn được giữ để đối chiếu.
- **Nhắc việc:** dashboard hiển thị quá hạn, vướng mắc, chờ duyệt. Sang bộ phận khác xem bằng dropdown đơn vị trên header (7 mục).
- **Chốt kỳ:** **Báo cáo → Chốt kỳ**, kiểm tra số liệu rồi khóa. Kỳ đã khóa là bất biến; xuất Excel từ bản chốt để số liệu khớp nhau mọi lần tải.

## 5. Công chức
- **Việc của tôi:** xem nhiệm vụ được giao/phối hợp, cập nhật tiến độ, bấm **Báo hoàn thành** khi xong (chuyển chờ nghiệm thu, không tự kết thúc).
- **Vướng mắc:** ghi rõ nội dung vướng + bấm báo vướng để lãnh đạo tháo gỡ.
- **Xin lùi hạn:** bắt buộc ghi lý do, hạn đề xuất mới; chờ duyệt, không tự dời hạn.
- **Nhật ký hằng ngày:** vào **Nhật ký**, chọn đầu việc của mình (hoặc thêm mới) → ghi kết quả theo biểu mẫu. Ca không phát sinh: bấm **Xác nhận 1-chạm: Ca hôm nay không phát sinh** (không bị tính là chưa làm).

## 6. Báo cáo và Excel
- **Báo cáo trực tuyến:** lọc theo kỳ/đơn vị/cá nhân, bấm vào số liệu để truy vết đến nhiệm vụ gốc.
- **Xuất Excel:** Mẫu A (biểu kế hoạch tuần 8 cột) và Mẫu B (chi tiết 13 cột). Chỉ người có quyền mới thấy nút xuất; mọi lượt xuất đều ghi nhật ký.
- Số liệu dashboard tính theo kỳ được chọn (ngày/tuần/tháng/tùy chọn), không đếm trùng nhiệm vụ.

## 7. Quy tắc an toàn (bắt buộc)
1. Mỗi người một tài khoản, không dùng chung, không mượn máy đã đăng nhập sẵn.
2. Mật khẩu ≥ 8 ký tự, đổi ngay khi được cấp và định kỳ. Lộ mật khẩu → báo quản trị đặt lại ngay.
3. Dữ liệu đã chốt kỳ, nhật ký kiểm toán không xóa/sửa. Cần điều chỉnh kế hoạch đã duyệt: dùng **Trình bổ sung/điều chỉnh**, hệ thống tự lưu vết.
4. Sao lưu dữ liệu do bộ phận kỹ thuật thực hiện định kỳ (không bấm khôi phục trên giao diện khi chưa được hướng dẫn).

## 8. Sự cố thường gặp
| Hiện tượng | Xử lý |
|---|---|
| Không đăng nhập được | Kiểm tra tên/mật khẩu, CapsLock; quá 10 lần sai bị khóa 10 phút; vẫn không được → báo quản trị đặt lại |
| Không thấy nút Duyệt/Nghiệm thu | Tài khoản không có thẩm quyền đó — báo trưởng bộ phận, không tự ý xin quyền vượt cấp |
| Không thấy dữ liệu bộ phận khác | Đúng thiết kế phân quyền; cần xem phải được cấp quyền rõ ràng |
| Xuất Excel lỗi | Thử lại; nếu vẫn lỗi, chụp màn hình báo kỹ thuật kèm thời gian để tra nhật ký |

## 9. Liên hệ hỗ trợ (điền khi bàn giao)
- Đầu mối Hải quan: ______ — SĐT: ______
- Kỹ thuật: ______ — SĐT: ______
- Thời gian trực hỗ trợ pilot: ______

---
*Tài liệu này đi kèm hệ thống tại `docs/HUONG_DAN_VAN_HANH_HAI_QUAN.md`. Mọi thay đổi quy trình phải cập nhật sổ tay trước khi áp dụng.*

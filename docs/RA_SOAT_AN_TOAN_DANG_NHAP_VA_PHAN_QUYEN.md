# RÀ SOÁT AN TOÀN ĐĂNG NHẬP & PHÂN QUYỀN XÁC NHẬN SỐ LIỆU

**Ngày:** 17/10/2026 (đợt 2) · **Phạm vi:** (1) luồng đăng nhập nhiều định dạng (alias); (2) nguyên tắc tách "quyền quản trị kỹ thuật" ≠ "quyền phê duyệt nghiệp vụ".
**Phương pháp:** đọc mã nguồn (route đăng nhập, route tạo tài khoản, guard phân quyền, module số liệu) + **chạy mô phỏng CHỈ ĐỌC** trên CSDL thật (không ghi gì): đối chiếu 20 tài khoản hiện có với chính thuật toán chuẩn hóa trong code.

## 1. Kết luận nhanh

- **Không phát hiện lỗ hổng nghiêm trọng** trong luồng đăng nhập đang chạy.
- Hiện có **20 tài khoản, KHÔNG có cặp nào trùng biến thể**; các cách gõ khác nhau (hoa/thường, dấu phân cách, đệm số 0) đều trỏ về **đúng 1 tài khoản**.
- Còn **2 khuyến nghị nhỏ + 1 khuyến nghị quan trọng cho bước sau** (mục 4) — **chưa sửa gì trong bước này**.

## 2. Kết quả kiểm từng yêu cầu

| # | Yêu cầu | Kết quả | Bằng chứng |
| --: | :-- | :-- | :-- |
| 1 | Không trùng tài khoản (hiện tại) | ✔ 20/20 tài khoản: mọi biến thể chỉ khớp duy nhất chủ sở hữu | chạy mô phỏng read-only |
| 2 | Kiểm tra khi **tạo tài khoản mới** | ⚠️ **Lỗ hổng mềm**: route tạo tài khoản chỉ kiểm tra trùng **đúng chuỗi** (`findUnique` theo username đã trim/lower), **không** kiểm tra trùng theo khóa chuẩn hóa/biến thể. Ví dụ: nếu admin tạo tài khoản mới tên `cb2` trong khi đã có `cb002` → người quen gõ "cb2" sẽ bị chuyển sang tài khoản mới (đăng nhập tài khoản cũ bằng "cb2" sẽ thất bại dù đúng mật khẩu — không lộ mật khẩu, nhưng nhầm định danh/gây khóa nhầm) | đọc route tạo tài khoản + mô phỏng |
| 3 | Các cách viết tương đương dùng CHUNG giới hạn sai | ✔ Khóa đếm dùng **tài khoản đã phân giải** (chuẩn hóa) — mọi biến thể của cùng tài khoản chia sẻ bộ đếm 10 lần/10 phút (429) | đọc `loginFailCount`/`lockKey` |
| 4 | Tài khoản khóa/vô hiệu không lách qua alias | ✔ Kiểm trạng thái **sau khi phân giải tài khoản** (alias không đổi được tài khoản đích) | đọc code + audit `LOGIN_REJECTED_INACTIVE` |
| 5 | Không tiết lộ tài khoản có tồn tại hay không | ✔ Sai mật khẩu **và** không tồn tại → cùng một thông báo 401. ⚠️ ngoại lệ nhỏ: tài khoản không ở trạng thái ACTIVE trả 403 với thông báo riêng (lộ "có tài khoản nhưng bị khóa/vô hiệu") — chấp nhận được về vận hành, có thể siết nếu cần | đọc code/hành vi |
| 6 | Alias đệm 0 (0↔00↔000) hoạt động đúng | ✔ Gõ dạng ngắn/đệm của cùng một mã đều vào **đúng 1 tài khoản duy nhất** (tài khoản mã 4 số hiện có) | chạy mô phỏng trên CSDL thật |
| 7 | Không mở rộng quy tắc chuẩn hóa | ✔ Kỳ này **không thay đổi quy tắc nào** — chỉ rà soát | — |

## 3. Quy tắc gõ được chấp nhận (đúng như hướng dẫn 17/10 — không đổi)

- Không phân biệt hoa/thường; bỏ qua dấu `-`, `_`, `.`, khoảng trắng; bỏ tiền tố danh sách ("1.", "1)", "1-", "1:").
- Tự khớp các dạng đệm số 0 của phần số (`cb18` ↔ `cb018` ↔ `cb0018`).
- Thứ tự ưu tiên: khớp **chính xác** → không phân biệt hoa/thường → nếu **chỉ 1** tài khoản khớp biến thể thì nhận → nhiều tài khoản cùng khớp biến thể thì **từ chối** (an toàn).
- Sai 10 lần/10 phút (theo khóa đã chuẩn hóa) → tạm khóa 10 phút. Không khóa theo IP (tránh phạt oan văn phòng dùng chung IP; chống dò liên tục bằng ghi audit `LOGIN_BLOCKED` tối đa 3 dòng/khóa/10 phút).

## 4. Phát hiện & đề xuất (chưa sửa trong bước này)

1. **[QUAN TRỌNG — bước sau]** Khi **tạo tài khoản**: bổ sung kiểm tra trùng theo **khóa chuẩn hóa + biến thể đệm số 0** — chặn nếu đã tồn tại tài khoản có biến thể giao nhau (ví dụ chặn tạo `cb2` khi có `cb002`). **Không đổi quy tắc đăng nhập**, chỉ siết lúc tạo.
2. **[NHỎ]** Tài khoản không ACTIVE trả 403 riêng: cân nhắc kiểm mật khẩu trước khi báo trạng thái (giữ nguyên nếu đơn vị ưu tiên thông báo rõ cho người dùng).
3. **[NHỎ]** Xử lý lỗi 500 của đăng nhập có kèm nội dung lỗi kỹ thuật (`error.message`) — nên trả thông báo chung + ghi log nội bộ.

## 5. Tách quyền "quản trị kỹ thuật" ≠ "phê duyệt nghiệp vụ" — kết quả rà soát

- **Nguyên tắc (đơn vị chốt):** Quản trị hệ thống **không mặc nhiên** có thẩm quyền xác nhận số liệu thuế/kết quả nghiệp vụ.
- **Thực trạng code:**
  - Nhiều module nghiệp vụ đã chủ động loại tài khoản SYSTEM_ADMIN khỏi phần ghi dữ liệu nghiệp vụ — mẫu chuẩn: KQ tháng trả 403 với thông báo *"Quản trị kỹ thuật không được ghi kết quả nghiệp vụ"*.
  - **Riêng module Số liệu giao ban**: cổng quản trị dùng chung là `isMetricsAdmin` (lãnh đạo đơn vị **hoặc** quyền `system.config`); mà tài khoản SYSTEM_ADMIN mặc định được cấp `system.config` → **nếu** một tài khoản SYSTEM_ADMIN được tạo, tài khoản đó sẽ được module số liệu coi như "quản trị số liệu": xem cấu hình, nhập/xác nhận **mọi chỉ tiêu** (không giới hạn lùi ngày), quản lý mốc lũy kế/chỉ tiêu giao và lưu/xóa phiên bản báo cáo giao ban.
  - **Thực tế hiện tại:** **chưa có tài khoản SYSTEM_ADMIN nào** trong CSDL (20 tài khoản: lãnh đạo + nhân viên) → rủi ro đang ở mức **tiềm ẩn**, chưa khai thác được.
- **Đề xuất khi được lệnh (KHÔNG tự làm bây giờ):** tách quyền nghiệp vụ riêng cho số liệu (ví dụ quyền dành riêng lãnh đạo như `metrics.confirm`/`metrics.manage`) — SYSTEM_ADMIN chỉ giữ quyền kỹ thuật; hoặc loại SYSTEM_ADMIN khỏi `isMetricsAdmin`; kèm bộ test phân quyền. Nguyên tắc chung đã được ghi nhận tại `DECISIONS.md` (ADR-011).

## 6. Ghi chú

- Kết quả mô phỏng chỉ đối chiếu **cấu trúc** định danh; tài liệu **không ghi tên đăng nhập/mật khẩu/hash** của bất kỳ ai.
- Không thay đổi dữ liệu, không thay đổi cấu hình trong bước rà soát này.

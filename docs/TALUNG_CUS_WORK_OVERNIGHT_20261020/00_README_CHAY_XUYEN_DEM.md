# TALUNG-CUS-WORK — BỘ GIAO VIỆC CODING XUYÊN ĐÊM

**Ngày lập:** 20/10/2026  
**Phạm vi:** Tiếp nối Giai đoạn 1 đã deploy; YC-33, YC-34, YC-35, YC-36, YC-37; rà soát tương thích YC-30/31/32.  
**Chế độ:** Agent tự thực thi theo từng chặng, tự kiểm thử và deploy Production nếu đạt điều kiện; **UAT thủ công do người dùng thực hiện sau**.  
**Đây là hướng dẫn lập trình, không phải giấy phê duyệt công thức hay kết luận nghiệm thu nghiệp vụ.**

## 1. Đọc theo thứ tự

1. `00_README_CHAY_XUYEN_DEM.md` — quy tắc và mục tiêu.
2. `01_NGUON_NGHIEP_VU_VA_KHOANG_TRONG.md` — thứ tự nguồn, bằng chứng, điều chưa xác nhận.
3. `06_QUY_TRINH_CODING_QA_PRODUCTION.md` — chế độ tự chủ, an toàn dữ liệu, thứ tự làm.
4. `05_YC37_CHAP_THUAN_GIAI_TRINH.md` — nghiệp vụ rõ nhất, triển khai sớm.
5. `02_YC33_HE_SO_TINH_DIEM.md` — tính toán minh bạch, không bịa công thức.
6. `04_YC35_36_DANH_GIA_LANH_DAO.md` — tự đánh giá và quan hệ quản lý.
7. `03_YC34_BIEU_MAU_01A_01B_02A_02B.md` — lập biểu tháng/quý và export.
8. `07_UAT_BUOI_SANG_BACKLOG.md` — bàn giao và ý tưởng chưa triển khai.
9. `08_PROMPT_OPENCODE.md` — prompt khởi động nhanh nếu mở phiên mới.

## 2. Tình trạng nguồn gần nhất (theo báo cáo OpenCode, chưa phải kiểm tra độc lập)

- Production `https://task-cus.vercel.app`; `main`, health `db=up`, commit báo cáo `efe2bde`. **Đọc commit/branch/health thật khi bắt đầu; không hardcode version này vào test.**
- YC-30 bổ sung: `/my-work` được gọi là **Nhật ký công việc**; lọc theo ngày/tuần/tháng, nguồn và trạng thái; route cũ còn hoạt động.
- YC-31: TX1 phiên bản `TX-20261020-01` đã import **348 đầu việc / 6 nhóm**; **207** ô hệ số có giá trị (**10** bằng `0`), **141** ô trống/`NULL`; 48 template cũ còn giữ cho lịch sử; chế độ chọn TX hiện mở rộng do chưa chốt ánh xạ tổ chức.
- YC-32: hạn hoàn thành, ngày thực tế, minh chứng private, `inEvaluation`, khóa hạn sau duyệt và audit.
- Nhân sự: đã đối soát `danh.xlsx`; 14 hồ sơ mới chưa cấp tài khoản; một số tên gọi ngắn/bộ phận chưa thể xác định chắc chắn.
- Kỳ đánh giá, quyền và API hiện hành phải được xác minh trong repo/Production, không suy đoán từ báo cáo cũ.

## 3. Kết quả cần tạo trong đêm

- **YC-37:** xem trước hồ sơ trước khi chấp thuận; đồng ý / không đồng ý / yêu cầu giải trình; quyền server, audit, chống thao tác lặp và E2E.
- **YC-33:** khung tính điểm truy vết tới nguồn dữ liệu và quy tắc; tính thật phần đủ căn cứ, phần thiếu rõ ràng là `PENDING_RULE` hoặc `INSUFFICIENT_DATA`; đối soát Excel.
- **YC-36:** tiêu chí chung, tự đánh giá/nhận xét/xếp loại gợi ý (khi đủ căn cứ), lưu lịch sử và quyền phù hợp; **không tự chốt xếp loại**.
- **YC-34:** 01A/01B theo tháng; 02A/02B theo quý, xem trước/export đúng nguồn; bản chưa đủ căn cứ phải dán nhãn *DỰ THẢO* và để trống điểm thiếu.
- **YC-35:** mô hình quan hệ phụ trách theo kỳ và công cụ kiểm tra trước khi tính lãnh đạo; chỉ tính trường hợp được xác nhận đầy đủ, không tự gán nhân sự.
- Tests: unit, integration, authorization, export validation, negative cases, UI desktop/mobile, smoke Production; mỗi chặng có bằng chứng.

## 4. Không coi các việc sau là YC mới phải hoàn thành đêm nay

- Gộp toàn bộ form tạo việc thành một form; chỉ audit/backlog. Người dùng **chưa cho triển khai**.
- Xây dựng lại Lịch trực/Sổ phân công nhiệm vụ trong ngày; chỉ đánh giá kiến trúc, không thay dữ liệu.
- Hoàn thiện 2C/2D/2E cấp đơn vị; chỉ audit dependency, **không tạo màn hình giả hay hứa đã xuất đúng**.
- Đổi tổ chức nhân sự theo tên gọi ngắn hoặc tự gán bộ phận; tiếp tục chờ xác minh.
- Xử lý bucket `task-attachments` đang public: ghi rủi ro, **không thay policy trong đợt này**.

## 5. Các giới hạn quan trọng

- Production **được phép sửa/deploy/kiểm thử** mà không cần hỏi cho từng deploy thường lệ. UAT thủ công sáng mai, nhưng **không bỏ qua test tự động tối thiểu trước deploy**.
- Không tự quyết các ngưỡng/phạt thưởng/xếp loại hoặc gán `NULL` thành `0`; không đánh đồng hệ số TX với hệ số sản phẩm QĐ1277.
- Không DROP/TRUNCATE/reset, không seed demo hàng loạt, không thay dữ liệu thật. DDL chỉ additive, idempotent, backup + restore-test với thao tác schema/dữ liệu rủi ro, kiểm tra số lượng/hashes bảng quan trọng.
- Không chạy `prisma migrate deploy` / `prisma db push` trên Production hiện chưa quản lý lịch sử migration phù hợp.
- Không commit Excel gốc, file cá nhân, bảng chấm điểm thực tế, backup, access token, private key, connection string.
- Mỗi chặng phải đạt code/test và báo cáo rõ phạm vi. Nếu một nhánh nghiệp vụ chưa đủ căn cứ: **để trạng thái chờ và chuyển sang nhánh công việc độc lập**, không tự chế quy tắc để chạy suốt đêm.

## 6. Đưa tài liệu vào OpenCode Windows

- Giải nén gói này, đặt thư mục `TALUNG_CUS_WORK_OVERNIGHT_20261020` trong `D:\thanhnx\OpenCode\talung-cus-work\docs\` (không cần đưa lên Git ngay).
- File **nguồn gốc** `Dữ liệu.zip`, `Danh mục TX1.xls`, `danh.xlsx` phải để Agent đọc được tại một **thư mục riêng tư ngoài repository**, ví dụ `D:\thanhnx\OpenCode\_private_inputs\talung-cus-work\`, hoặc nơi người dùng chỉ định. **Không chép nhân sự và Excel cá nhân vào đường dẫn bị Git theo dõi.**
- Nếu bộ nguồn chưa có ở máy Agent: lập danh sách thiếu, làm trước YC-37, audit engine, schema test, quyền và giao diện draft; không bịa nội dung Excel và không dừng toàn bộ công việc đêm.
- Sau đó gửi nội dung `08_PROMPT_OPENCODE.md` vào phiên OpenCode Desktop.

## 7. Definition of done cho phiên xuyên đêm

**Hoàn thành kỹ thuật** ≠ **UAT nghiệp vụ đã được phê duyệt**. Đêm nay chỉ có thể kết luận từng mục `DEPLOYED_AUTO_VERIFIED`, `IMPLEMENTED_NOT_DEPLOYED`, `BLOCKED_BUSINESS_RULE`, `BLOCKED_ENVIRONMENT` hoặc `NOT_STARTED`. Không tự đánh dấu `UAT_APPROVED` thay người dùng/Hải quan.

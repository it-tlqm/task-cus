---
title: "PROJECT CONTEXT — Hệ thống Quản lý Kế hoạch & Công việc Hải quan Tà Lùng"
project_code: "TALUNG-CUS-WORK"
project_slug: "talung-cus-work"
repository_name: "talung-cus-work"
display_name: "Hệ thống Quản lý Kế hoạch & Công việc Hải quan Tà Lùng"
document_type: "Product Context + PRD + Technical Blueprint + AI Build Instructions"
version: "1.1.1"
updated_at: "2026-10-09"
language: "vi-VN"
status: "DRAFT — chờ đơn vị Hải quan xác nhận nghiệp vụ và phê duyệt triển khai"
product: "WebApp responsive/PWA nội bộ"
ui_design_tool: "Google Stitch"
development_tool: "Google Antigravity"
source_file: "Kế hoạch công tác.xlsx / Biểu Kế Hoạch Tuần"
data_policy: "Chỉ dữ liệu giả lập hoặc được phép sử dụng trong môi trường thiết kế/phát triển"
---

# PROJECT_CONTEXT — HỆ THỐNG QUẢN LÝ KẾ HOẠCH & CÔNG VIỆC HẢI QUAN TÀ LÙNG

> **Tài liệu ngữ cảnh gốc (source of truth) để thiết kế bằng Stitch và phát triển bằng Antigravity.**
> Đây là **đề xuất thiết kế**, không phải văn bản nghiệp vụ chính thức, không thể hiện phần mềm đã được cơ quan Hải quan phê duyệt. Các cơ cấu, chỉ tiêu, quy trình và quyền hạn chưa được xác nhận phải giữ trạng thái `TBD/PROPOSED`.

## 0. CÁCH SỬ DỤNG TÀI LIỆU

**[AGREED] Tên dự án kỹ thuật/repository đã chốt:** `talung-cus-work`. Dùng nhất quán cho project trên Stitch, Antigravity, repository, cấu hình môi trường, README và tài liệu kỹ thuật; tên hiển thị tiếng Việt có thể giữ như tiêu đề sản phẩm. Không sử dụng các tên kỹ thuật đề xuất cũ.

1. Đặt file này ở **thư mục gốc của repository** với tên `PROJECT_CONTEXT.md` (có thể đổi tên bản tải xuống cho ngắn).
2. Khi làm việc với **Google Stitch**, dùng riêng phần **§16 — STITCH DESIGN BRIEF** để tạo bản thiết kế; không tải lên dữ liệu cán bộ, hồ sơ nghiệp vụ hoặc thông tin nhạy cảm chưa được phép.
3. Khi làm việc với **Google Antigravity**, yêu cầu agent đọc **toàn bộ `PROJECT_CONTEXT.md` trước khi viết code**, sau đó dùng prompt khởi tạo tại **§17**.
4. Nếu quyết định nghiệp vụ mới khác với tài liệu này, cập nhật `DECISION LOG` ở §21 và phần liên quan **trước** khi yêu cầu agent sửa phần mềm.
5. Thiết kế UI, dữ liệu mẫu và demo **không được coi là phần mềm sẵn sàng triển khai thực tế**. Trước sử dụng dữ liệu thật cần phê duyệt nghiệp vụ, hạ tầng và an toàn thông tin.

### 0.1. Quy ước về mức độ chắc chắn

| Nhãn | Ý nghĩa | Nguyên tắc thực hiện |
|---|---|---|
| `[AGREED]` | Người đặt hàng đã thống nhất mục tiêu/nguyên tắc | Có thể dùng làm yêu cầu sản phẩm |
| `[FEEDBACK]` | Phản hồi nghiệp vụ từ phía Hải quan do người đặt hàng chuyển lại | Ghi nhận để thiết kế; không đồng nghĩa văn bản phê duyệt chính thức |
| `[SOURCE]` | Trích từ Excel gốc | Giữ nguyên dữ liệu nguồn; không tự suy diễn chính sách |
| `[PROPOSED]` | Giải pháp thiết kế kỹ thuật/nghiệp vụ do dự án đề xuất | Có thể dùng cho prototype, cần xác nhận để áp dụng chính thức |
| `[TBD]` | Chưa có quyết định của Hải quan hoặc đơn vị có thẩm quyền | Chừa khả năng cấu hình, không hard-code |
| `[SECURITY-GATE]` | Điều kiện bảo mật/phê duyệt bắt buộc trước dữ liệu thật | Không bỏ qua để làm demo nhanh |

### 0.2. Nguyên tắc bắt buộc với AI coding agent

- **Không tự bịa tên phòng/đội, chức danh, cán bộ, quy trình phê duyệt chính thức, KPI hay quy định Hải quan.** Tên “Bộ phận A/B/C” chỉ là dữ liệu demo.
- **Không tạo một phần mềm thông quan/hệ thống nghiệp vụ Hải quan.** Chỉ làm quản lý kế hoạch, nhiệm vụ và báo cáo công tác được cho phép.
- **Không yêu cầu cán bộ báo cáo tất cả hoạt động của danh mục mỗi ngày/tuần.** Chế độ báo cáo phải cấu hình riêng theo hoạt động.
- **Nhãn nghiệp vụ mới của cột C là `Danh mục đầu việc`.** Đầu việc phát sinh/được giao **biến động theo công việc của từng cá nhân và từng kỳ**; không coi 48 đầu việc từ file nguồn là checklist cố định.
- **Phân biệt đầu việc mẫu và đầu việc thực tế:** người có quyền có thể chọn từ danh mục mẫu hoặc bổ sung đầu việc riêng, đúng phạm vi và quy tắc duyệt; không buộc cá nhân chọn một mẫu có sẵn.
- **Không nhập trùng công việc:** kế hoạch tháng, tuần và ngày là các góc nhìn/liên kết, không phải ba bản sao của nhiệm vụ.
- **Không dùng giao diện đẹp thay cho nghiệp vụ thật:** dữ liệu phải có kiểm soát phân quyền, lịch sử, quy trình và xuất được XLSX.
- **Không kết nối, đồng bộ, tải dữ liệu thật lên Stitch, Antigravity, cloud, AI API hoặc dịch vụ khác khi chưa có phê duyệt phù hợp.**
- **Không sinh mật khẩu cứng, tài khoản admin công khai, khóa API trong mã nguồn hoặc bỏ qua phân quyền backend.**
- **Không xóa lịch sử nhiệm vụ, báo cáo đã chốt hoặc cấu hình đã phát hành; dùng cơ chế lưu phiên bản và vô hiệu hóa có kiểm soát.**
- Chức năng được yêu cầu nhưng thiếu quyết định nghiệp vụ: **thiết kế mở + TODO có mã**, không tạo ra 'quy định' tưởng tượng.

---

## 1. BỐI CẢNH, BÀI TOÁN VÀ MỤC TIÊU

### 1.1. Bối cảnh

`[AGREED]` Đơn vị mục tiêu giai đoạn đầu: **Hải quan Cửa khẩu quốc tế Tà Lùng**. Người đặt hàng muốn xây dựng **WebApp riêng**, quản lý kế hoạch và công việc của các bộ phận theo **ngày / tuần / tháng**, có giao việc, theo dõi, nhắc hạn, kết quả, báo cáo trực tuyến và **xuất Excel (.xlsx)**.

`[SOURCE]` Đã có file Excel `Kế hoạch công tác.xlsx`, sheet `Biểu Kế Hoạch Tuần`, là **biểu mẫu của cá nhân/bộ phận nghiệp vụ**, không phải danh mục hoàn chỉnh của toàn cơ quan. Hiện bảng gộp nhiều hoạt động dưới 5 nhóm và một kết quả/trạng thái chung cho mỗi nhóm.

`[AGREED]` Hệ thống phải **cấu hình mở**: nhân sự/cơ cấu tổ chức, mẫu kế hoạch, danh mục hoạt động, yêu cầu báo cáo, chỉ tiêu kết quả, quy trình duyệt, quyền, nhắc việc và mẫu Excel có thể thay đổi chủ yếu qua giao diện quản trị **không cần sửa code**.

`[FEEDBACK]` Phía Hải quan thông tin qua người đặt hàng ngày 09/10/2026: nội dung đang ghi trong cột **“Chi tiết hoạt động & Biện pháp thực hiện”** cần được gọi là **“Danh mục đầu việc”**; các đầu việc **biến động tùy công việc của từng cá nhân**, không phải một tập con cố định và không mặc định phải báo cáo hết. Tên mới áp dụng cho **giao diện, biểu mẫu mới và mẫu báo cáo mặc định**; tên cột nguyên văn vẫn giữ ở mục mô tả nguồn Excel để đối chiếu.

### 1.2. Mục tiêu sản phẩm

1. Lãnh đạo nắm tổng quan công việc **toàn đơn vị/theo bộ phận/theo người** trong phạm vi được cấp quyền.
2. Trưởng bộ phận lập, trình, giao và theo dõi kế hoạch; cán bộ nhận việc và cập nhật dễ dàng.
3. Mọi nhiệm vụ có người chịu trách nhiệm, thời hạn và kết quả rõ ràng **khi loại nhiệm vụ yêu cầu**.
4. Nghiệp vụ thường xuyên có cách ghi nhận riêng, tránh biến mỗi thao tác nghiệp vụ thành một 'task'.
5. Phân biệt được **không phát sinh**, **chưa cập nhật**, **chưa thực hiện**, **đang xử lý**, **quá hạn**, **hoàn thành**.
6. Kết quả đã nhập được dùng lại để tạo dashboard, báo cáo ngày/tuần/tháng và file XLSX.
7. Có quản trị cơ cấu tổ chức, cán bộ/công chức, tài khoản và phân quyền theo đơn vị, vai trò và nhiệm vụ.
8. Có thể mở rộng đến đơn vị khác **nếu được cơ quan có thẩm quyền cho phép**, không tự động chia sẻ dữ liệu liên đơn vị.

### 1.3. Ngoài phạm vi giai đoạn đầu

- Không thay hệ thống tiếp nhận, xử lý tờ khai, thông quan, kiểm tra, giám sát, kế toán thuế hoặc cơ sở dữ liệu chuyên ngành.
- Không tự tích hợp hoặc khai thác dữ liệu của hệ thống Hải quan hiện hữu khi chưa được phép.
- Không yêu cầu ký số chính thức, quản lý văn bản điều hành toàn ngành hoặc lưu hồ sơ thuộc bí mật nhà nước trong V1.
- Không dùng AI tự ra quyết định nghiệp vụ Hải quan; không chấm điểm thi đua nhân sự một cách tự động.
- Không phát hành native Android/iOS trong V1; ưu tiên web responsive, PWA **chỉ khi đáp ứng yêu cầu bảo mật**.

### 1.4. Chỉ số thành công đề xuất (chưa ấn định ngưỡng)

- Tỷ lệ kế hoạch được lập/phê duyệt đúng hạn.
- Tỷ lệ nhiệm vụ có người chủ trì, hạn và cập nhật phù hợp với loại việc.
- Tỷ lệ nhiệm vụ hoàn thành đúng hạn; danh sách công việc tồn/vướng mắc.
- Tỷ lệ báo cáo được nộp/xác nhận đúng kỳ với **mẫu yêu cầu tương ứng**.
- Thời gian tổng hợp báo cáo và số lần phải nhập lại cùng dữ liệu.
- Độ đầy đủ nhật ký thay đổi, tỷ lệ xuất báo cáo thành công, sự cố phân quyền.

> Không tự đặt chỉ tiêu 90%, 95% hoặc trọng số KPI khi chưa có quyết định chính thức.

---

## 2. HIỆN TRẠNG FILE EXCEL & QUY TẮC CHUYỂN ĐỔI

### 2.1. Siêu dữ liệu đã kiểm tra

- `[SOURCE]` File: `Kế hoạch công tác.xlsx`; **01 sheet**: `Biểu Kế Hoạch Tuần`; vùng có dữ liệu chính trong **A1:H12**, sheet có kích thước sử dụng **19 hàng × 8 cột**.
- Tiêu đề A1:H1: `BÁO CÁO CÔNG TÁC THỰC HIỆN KẾ HOẠCH TUẦN CỦA CÁ NHÂN BỘ PHẬN NGHIỆP VỤ`.
- A2:H2: kỳ tuần để trống; đơn vị là `Hải quan cửa khẩu Quốc tế Tà Lùng`.
- Hàng 7 có **08 cột**: A `Thứ / Ngày`; B `Nhiệm vụ thường xuyên`; C `Chi tiết hoạt động & Biện pháp thực hiện` (**nguyên văn Excel nguồn; nhãn sử dụng trong WebApp đổi thành `Danh mục đầu việc`**); D `Bộ phân/Cán bộ phụ trách`; E `Đơn vị phối hợp`; F `Mức độ ưu tiên`; G `Kết quả dự kiến`; H `Tiến độ / Trạng thái`.
- 05 nhóm nhiệm vụ ở hàng 8–12, với **48 dòng hoạt động liệt kê** tổng cộng (22+20+2+2+2; có nội dung gần trùng nhau, chưa chuẩn hóa thành 48 mục duy nhất).
- Mức ưu tiên tương ứng: **Cao / Cao / Trung bình / Trung bình / Cao**. Trạng thái gốc cả 5 dòng: `Chưa thực hiện`.
- Danh sách chọn trong Excel: `Cao, Trung bình, Thấp` và `Chưa thực hiện, Đang thực hiện, Hoàn thành, Vướng mắc`.
- Các ô G8–G12 đang lưu **văn bản kết quả dự kiến** cho từng nhóm, **không** phải schema chỉ tiêu đã được phê duyệt.
- Công thức B4 `=COUNTA(A8:A12)` đếm cột A trống nên **không thể dùng làm tổng nhiệm vụ thực tế**. E4 `=COUNTIF(F8:F12,"Cao")`; H4 `=COUNTIF(H8:H12,"Hoàn thành")` là số **nhóm** chứ không phải số đầu việc.

### 2.2. Danh mục 5 nhóm gốc

| Mã seed | Nhóm từ Excel | Hàng | Số hoạt động liệt kê | Ưu tiên gốc |
|---|---|---:|---:|---|
| `TTHQ` | Thực hiện thủ tục hải quan | 8 | 22 | Cao |
| `GSHQ` | Kiểm tra giám sát hải quan | 9 | 20 | Cao |
| `TON_DONG` | Xử lý nghiệp vụ phức tạp & tồn đọng | 10 | 2 | Trung bình |
| `DANH_GIA_HQ` | Đánh giá hiệu quả và những việc đã triển khai | 11 | 2 | Trung bình |
| `DANH_GIA_NGAY_TUAN` | Đánh giá tình hình thực hiện nhiệm vụ trong ngày/tuần | 12 | 2 | Cao |

### 2.3. Những điều KHÔNG được suy diễn từ Excel

- Không được hiểu 48 dòng hoạt động là 48 nhiệm vụ **phải** báo cáo mỗi ngày/tuần.
- Không được hiểu toàn bộ cán bộ có **cùng một danh mục đầu việc mỗi kỳ**: đầu việc của từng cá nhân có thể thay đổi, thêm mới, kết thúc hoặc không phát sinh; đây là phản hồi nghiệp vụ từ phía Hải quan.
- Không được hiểu một 'nhóm công việc' chính là một 'nhiệm vụ cá nhân'.
- Không được coi **Kết quả dự kiến** G8–G12 là bộ chỉ tiêu báo cáo bắt buộc đã chốt.
- Không tự coi nhóm `Kiểm tra giám sát hải quan` phải báo cáo mã HS, thuế, C/O và trị giá chỉ vì ô G9 đang ghi như vậy; đây là nội dung cần rà soát với đơn vị nghiệp vụ.
- Không tự coi G10, G11, G12 giống nhau là đúng về nghiệp vụ; ba nhóm đang dùng kết quả mẫu tương tự.
- Không tự xác định `Bộ phân NV (trưởng/phó nhóm)` trong cột D là cơ cấu nhân sự chính thức của toàn Hải quan.
- Không tự sửa các chữ viết tắt `C/O`, `KNQ`, `BIA/BOA`, `BBBG`, `CKS`, `PTVT`, `CDBG`, `SHTT`, `DVCTT`, `MGH`, `Getin/Getout` khi chưa có bảng thuật ngữ được xác nhận.

### 2.4. Quy tắc nhập dữ liệu từ Excel

1. Nhập 05 nhóm vào `activity_groups`, 48 dòng gốc vào `activity_templates` ở trạng thái `DRAFT/NEEDS_REVIEW`.
2. Lưu `source_file`, `source_sheet`, `source_row`, `source_field`, `raw_text` để truy vết.
3. Những dòng trùng/gần trùng **đánh dấu để rà soát**, không tự xóa hay gộp làm mất nghĩa.
4. Ánh xạ ưu tiên gốc là **giá trị mặc định gợi ý**, không mặc định ưu tiên của mọi nhiệm vụ tương lai.
5. Chế độ báo cáo (`reporting_mode`) của các hoạt động mới nhập là **chưa cấu hình**; không mặc định `REQUIRED`.
6. Chỉ tiêu kết quả từ cột G là `legacy_expected_result_text`, cho phép chuyển thành biểu mẫu sau khi được xác nhận.
7. Import có chế độ **dry-run**, cảnh báo trùng và bản xem trước; chỉ người có quyền mới xác nhận nhập thật.
8. Dữ liệu import seed là **danh mục gợi ý ban đầu**, không sinh hàng loạt các nhiệm vụ quá hạn/chưa hoàn thành.
9. Khi hiển thị cho người dùng, dùng nhãn **Danh mục đầu việc**. Mỗi cá nhân/kỳ có tập đầu việc riêng; không bắt buộc chọn đủ, có thể tạo đầu việc mới không có trong seed theo quyền.
10. Danh mục gốc và bản ghi đầu việc cá nhân là hai loại dữ liệu riêng biệt; sửa/ẩn mục mẫu không xóa đầu việc cá nhân hay kết quả đã lưu.

Danh sách 48 dòng nguồn được đóng gói tại **Phụ lục A** để Antigravity có thể xây dựng seed demo mà không phụ thuộc truy cập trực tiếp file Excel.

---

## 3. NGƯỜI DÙNG, CƠ CẤU TỔ CHỨC VÀ DANH TÍNH

### 3.1. Mô hình tổ chức

`[AGREED]` Cho phép quản lý cấu trúc **Đơn vị → Bộ phận/Đội → Tổ/Nhóm (nếu có) → Nhân sự**, có quan hệ cấp trên–cấp dưới động, không cố định số cấp hay tên bộ phận.

- Đơn vị có mã, tên, cấp trên, trạng thái hoạt động, thời gian hiệu lực.
- Bộ phận/tổ có thể đổi tên, tách, sáp nhập, vô hiệu hóa; giữ dữ liệu lịch sử nguyên trạng.
- Nhân sự có thể kiêm nhiệm ở nhiều bộ phận và đổi bộ phận theo khoảng thời gian; cần lưu lịch sử phân công.
- Chức danh, chức vụ và **vai trò phần mềm** là các danh mục khác nhau.
- Thiết kế dữ liệu có `organization_id` để có thể mở rộng; V1 chỉ một đơn vị chủ quản và **không cho phép xuyên đơn vị nếu chưa phê duyệt**.
- Không cấu hình sẵn tên các Đội ngoài dữ liệu nguồn; sử dụng `Bộ phận A/B/C` cho demo.

### 3.2. Tách biệt 4 đối tượng

| Đối tượng | Ý nghĩa | Ví dụ thuộc tính |
|---|---|---|
| `Person` | Hồ sơ nhân sự/cán bộ | Mã nhân sự, họ tên, tình trạng |
| `Account` | Danh tính đăng nhập hệ thống | Username, trạng thái khóa, MFA, last_login |
| `Assignment` | Nhân sự giữ vị trí tại bộ phận theo thời gian | person_id, unit_id, position_id, effective_from/to |
| `RoleGrant` | Quyền ứng dụng theo phạm vi và thời hạn | account_id, role_id, scope, validity |

Quy tắc: một người có thể chưa có tài khoản, một người có nhiều vị trí/kiêm nhiệm; khóa tài khoản **không xóa** lịch sử nhiệm vụ. Không đăng ký công khai tài khoản.

### 3.3. Vai trò đề xuất

- `UNIT_LEADER`: lãnh đạo đơn vị, xem/duyệt/chỉ đạo trong phạm vi được cấp.
- `DEPARTMENT_LEADER`: trưởng bộ phận/đội, quản lý kế hoạch và công việc thuộc phạm vi phụ trách.
- `DEPARTMENT_DEPUTY`: cấp phó, quản lý theo phân công hoặc ủy quyền.
- `STAFF`: cán bộ/công chức, làm việc, cập nhật và báo kết quả.
- `REPORT_COORDINATOR`: đầu mối tổng hợp, có quyền xem/báo cáo được chỉ định, không mặc định có quyền sửa kết quả.
- `SYSTEM_ADMIN`: cấu hình tài khoản/hệ thống, không mặc nhiên đọc toàn bộ nội dung nghiệp vụ nhạy cảm.
- `SECURITY_AUDITOR` (tùy chọn): xem nhật ký và đối chiếu phân quyền trong phạm vi được giao.

Các tên vai trò chỉ là **mẫu kỹ thuật**, thẩm quyền duyệt, ủy quyền và phạm vi cần `[TBD]` xác nhận.

---

## 4. KHÁI NIỆM NGHIỆP VỤ CHUẨN (DOMAIN MODEL)

| Khái niệm | Định nghĩa | Không được nhầm với |
|---|---|---|
| **Nhóm nghiệp vụ** (`ActivityGroup`) | Nhóm danh mục, ví dụ thủ tục hải quan | Nhiệm vụ đang giao |
| **Hoạt động mẫu** (`ActivityTemplate`) | Đầu việc tham khảo trong danh mục mẫu, có thể chọn/tái sử dụng | Đầu việc đã phát sinh và thuộc cá nhân |
| **Danh mục đầu việc thực tế** (`PersonalWorkItem`) | Các đầu việc cụ thể của một cá nhân trong một kỳ hoặc kế hoạch; có thể chọn từ mẫu hoặc nhập mới | Danh mục mẫu dùng chung và 48 dòng seed Excel |
| **Kế hoạch** (`Plan`) | Văn bản/kế hoạch quản lý một kỳ, theo đơn vị | Danh sách nhân sự |
| **Hạng mục kế hoạch** (`PlanItem`) | Mục tiêu/đầu việc nằm trong kế hoạch | Bản sao nhiệm vụ |
| **Nhiệm vụ** (`Task`) | Công việc được giao cụ thể, có chủ trì, tiến độ và kết quả | Dòng danh mục mẫu |
| **Nhật ký hoạt động** (`RoutineEntry`) | Ghi nhận thực tế việc thường xuyên theo ngày/kỳ | Công việc trễ hạn |
| **Kết quả báo cáo** (`ResultSubmission`) | Dữ liệu được nộp theo mẫu, gắn bản mẫu cụ thể | Văn bản kết quả dự kiến |
| **Kỳ báo cáo** (`ReportingPeriod`) | Ngày/tuần/tháng hoặc khoảng tùy chọn | Thời gian tạo bản ghi |
| **Báo cáo chốt kỳ** (`ReportSnapshot`) | Phiên bản báo cáo đã xác nhận, tái xuất được | Dashboard sống thay đổi liên tục |

### 4.1. Ba luồng công việc không được trộn

- **Công tác thường xuyên:** Hoạt động danh mục có thể ghi nhật ký, nhập số liệu tổng hợp, không bắt buộc có từng task con mỗi ngày. Khi cần liệt kê đầu việc thực tế thì tạo `PersonalWorkItem` theo cá nhân/kỳ, không ép dùng một danh sách chung.
- **Nhiệm vụ theo kế hoạch:** Được giao có nội dung, chủ trì, thời hạn, có thể liên kết kế hoạch tháng và tuần mà không nhân bản.
- **Nhiệm vụ chỉ đạo/phát sinh:** Được giao đột xuất, có căn cứ/chỉ đạo, mức ưu tiên, tiến độ, cơ chế gia hạn và xác nhận.

### 4.2. Một nhiệm vụ — nhiều ngữ cảnh kế hoạch

- `Task.id` là định danh duy nhất; một `Task` có thể liên kết nhiều `PlanItem`/`Plan` thông qua bảng liên kết phù hợp.
- Khi từ kế hoạch tháng đưa xuống kế hoạch tuần, **liên kết nhiệm vụ hiện có** hoặc tạo `Subtask` khi có công việc thật sự khác, **không clone Task**.
- Dashboard phải tránh đếm hai lần khi một nhiệm vụ nằm trong tháng và tuần.
- Công việc nhiều kỳ chưa hoàn thành tiếp tục hiển thị kỳ sau bằng liên kết/chuyển kỳ có lịch sử, không tự động xóa hạn gốc.
- Tiến độ `%` là tùy chọn theo loại việc; không ép người dùng nhập 0–100% cho mọi hoạt động.
- `PersonalWorkItem` thuộc về người phụ trách và kỳ/kế hoạch cụ thể; có thể liên kết `ActivityTemplate` (không bắt buộc) và `Task` (nếu chính là nhiệm vụ cần theo dõi). Một `Task` vẫn có định danh riêng, không được tự nhân bản do xuất hiện dưới nhiều kế hoạch.

### 4.3. Kết quả dự kiến khác kết quả thực tế

- `expected_result_text`/`expected_metrics`: kết quả/mục tiêu dự kiến khi lập kế hoạch.
- `actual_result_text`/`actual_metrics`: kết quả thực tế sau khi làm hoặc nộp báo cáo.
- Có thể yêu cầu số liệu, văn bản, tệp minh chứng hoặc chỉ xác nhận hoàn tất tùy mẫu.
- Kết quả cần **đủ theo biểu mẫu cấu hình**, không mặc định có số liệu nếu chưa phát sinh.
- Trường kết quả nào bắt buộc do phiên bản biểu mẫu/quy định của hoạt động quyết định.

### 4.4. Quy tắc đã làm rõ: **Danh mục đầu việc** biến động theo cá nhân `[FEEDBACK]`

- **Đổi nhãn trường C trên WebApp/báo cáo mới thành `Danh mục đầu việc`.** Nhãn `Chi tiết hoạt động & Biện pháp thực hiện` chỉ tồn tại trong thông tin đối chiếu **Excel gốc**.
- **Mỗi cá nhân, mỗi kỳ có thể có danh sách khác nhau:** thêm đầu việc, chọn từ danh mục mẫu, sửa nội dung trong quyền hạn, sắp thứ tự hoặc đánh dấu không còn áp dụng. Không tự động cấp 48 mục cho tất cả mọi người.
- **Các đầu việc có thể biến động theo thực tế:** một người có 3 đầu việc trong tuần, người khác có 6; tuần sau có thể khác; không suy ra vi phạm từ việc không chọn một mục mẫu.
- **Đầu việc không đồng nghĩa báo cáo bắt buộc:** nhu cầu cập nhật trạng thái, số liệu và minh chứng quyết định bởi loại công việc, chính sách báo cáo có hiệu lực và giao việc cụ thể. Trường hợp không phát sinh không bị quy thành chưa thực hiện.
- **Không bỏ qua yêu cầu bắt buộc đã được phê duyệt:** người dùng không được xóa/đổi tên đầu việc để né nghĩa vụ báo cáo đã giao; thay đổi sau duyệt cần ghi lịch sử, xử lý theo phân quyền/quy trình.
- **Không ép mỗi dòng là một nhiệm vụ độc lập:** đầu việc có thể chỉ là dòng mô tả trong kế hoạch/nhật ký; chỉ phát sinh `Task` khi cần giao/đôn đốc/kiểm soát riêng. Đảm bảo xuất được danh sách đa dòng trong cột Excel.
- **Thông tin tối thiểu đề xuất:** `person_id`, `period_id`/`plan_item_id`, `title`, `description?`, `template_id?`, `task_id?`, `sort_order`, `reporting_policy_snapshot?`, `created_by`, `updated_at`, `status`, `version`. Không lưu thông tin nhạy cảm ngoài phạm vi được duyệt.

---

## 5. CHẾ ĐỘ BÁO CÁO THEO TỪNG HOẠT ĐỘNG — YÊU CẦU CỐT LÕI

### 5.1. Bốn chế độ cấu hình

| Code | Hiển thị cho quản trị | Ý nghĩa | Hành vi kỳ không phát sinh |
|---|---|---|---|
| `EVERY_PERIOD` | Bắt buộc báo cáo mỗi kỳ | Phải gửi kết quả/xác nhận theo ngày, tuần, tháng được cấu hình | Hiển thị xác nhận `Không phát sinh` nếu mẫu cho phép; vẫn cần nộp/xác nhận |
| `ON_OCCURRENCE` | Chỉ khi có phát sinh | Chỉ tạo bản ghi khi có hoạt động thực tế | Không sinh báo cáo bắt buộc, không tính chưa làm |
| `ON_ASSIGNMENT` | Chỉ khi có giao việc | Báo cáo khi nhiệm vụ được giao cụ thể | Không có nhiệm vụ được giao thì không cần nộp |
| `NO_REPORT` | Không yêu cầu báo cáo riêng | Hoạt động chỉ hiển thị trong danh mục/quản trị | Không nhắc, không tính chưa nộp |

Mỗi hoạt động có `reporting_mode`, `frequency`, `result_form_version_id`, `effective_from/to`, `assigned_unit_scope` và quy tắc hạn riêng. Sau import từ Excel, `reporting_mode = UNCONFIGURED` cho tới khi người có quyền quyết định. **Đầu việc cá nhân tự nhập không mặc nhiên mang nghĩa vụ báo cáo**; khi liên kết mẫu hoặc nhiệm vụ đã giao, hệ thống kế thừa quy tắc bắt buộc có hiệu lực (nếu có), không cho tự vô hiệu hóa để né báo cáo.

### 5.2. Phân biệt trạng thái dữ liệu

- `NOT_OCCURRED` — **không phát sinh** nghiệp vụ trong kỳ, đã được xác nhận khi cần.
- `NOT_SUBMITTED` — kỳ yêu cầu báo cáo nhưng **chưa có báo cáo/xác nhận**.
- `NOT_STARTED` — nhiệm vụ **được giao** nhưng chưa triển khai.
- `IN_PROGRESS` — nhiệm vụ đang thực hiện.
- `BLOCKED`/`HAS_ISSUE` — có vướng mắc, là cờ hỗ trợ xử lý, không tự động kết luận quá hạn.
- `OVERDUE` — cờ tính toán từ hạn thực hiện và trạng thái/chính sách gia hạn, không phải trạng thái tác vụ độc lập.
- `DONE` — nhiệm vụ đã được xác nhận theo quy trình áp dụng.

**Quy tắc bắt buộc:** `NOT_OCCURRED != NOT_STARTED != NOT_SUBMITTED`, và hoạt động thuộc `ON_OCCURRENCE` không phát sinh **không** làm giảm tỷ lệ hoàn thành nhiệm vụ.

### 5.3. Ví dụ giả lập

1. Hoạt động `Tiếp nhận hồ sơ` đặt `EVERY_PERIOD`, tần suất ngày, biểu mẫu gồm `Tổng hồ sơ`, `Đã giải quyết`, `Tồn`, `Vướng mắc` — **chỉ là ví dụ thiết kế, không phải chỉ tiêu đã duyệt**.
2. Hoạt động `Xử lý vi phạm` đặt `ON_OCCURRENCE`; không có vụ việc thì không sinh việc/không báo lỗi thiếu dữ liệu.
3. Hoạt động `Báo cáo đột xuất` đặt `ON_ASSIGNMENT`; chỉ theo dõi khi có yêu cầu cụ thể và hạn được giao.
4. Hoạt động `Rà soát định kỳ` đặt `EVERY_PERIOD`; khi không có phát sinh có thể xác nhận `Không phát sinh` theo cấu hình.

### 5.4. Những điểm còn phải xác nhận với Hải quan

- **Đã làm rõ:** cột C đổi tên `Danh mục đầu việc`, biến động theo công việc từng cá nhân; không phải danh sách cố định áp dụng cho tất cả.
- Hoạt động/đầu việc **loại nào** phải cập nhật hằng tuần, loại nào chỉ khi phát sinh? (Không còn hỏi lại tên cột hay tính biến động.)
- Cột G `Kết quả dự kiến` là chỉ tiêu bắt buộc, hay câu gợi ý kết quả?
- Khi không phát sinh, **bỏ qua hoàn toàn** hay phải tích chọn/xác nhận `Không phát sinh`?
- Báo cáo nào phải được trưởng bộ phận xác nhận; báo cáo nào tự lưu là hợp lệ?

Các câu trả lời phải thành **cấu hình** chứ không viết cố định trong component React.

---

## 6. VÒNG ĐỜI KẾ HOẠCH, NHIỆM VỤ, BÁO CÁO

### 6.1. Kế hoạch

`DRAFT → SUBMITTED → APPROVED → IN_EFFECT → CLOSED/ARCHIVED`; nhánh `SUBMITTED → RETURNED → DRAFT`; các bước `SUBMITTED/APPROVED` có thể tắt/bật **theo loại kế hoạch và cấp quản lý** khi được phép. Điều chỉnh sau duyệt phải có phiên bản và lý do.

Cấp kỳ kế hoạch hỗ trợ: `DAY`, `WEEK`, `MONTH`, `QUARTER`, `YEAR`, `CUSTOM`; **V1 ưu tiên DAY/WEEK/MONTH**, quý/năm có thể hiển thị cấp cao hoặc bổ sung ở giai đoạn kế tiếp.

### 6.2. Nhiệm vụ

`TODO → IN_PROGRESS → WAITING_REVIEW → DONE`, có `ON_HOLD`, `CANCELED` theo quyền; trường hợp trả kết quả `WAITING_REVIEW → IN_PROGRESS`. Việc được 'báo hoàn thành' khác với 'đã được xác nhận'. Có thể cấu hình loại việc **không cần xác nhận**.

Quá hạn được tính theo `deadline_at`/kỳ làm việc cấu hình, nếu chưa `DONE/CANCELED` và đã vượt hạn hiệu lực; phải giữ `original_deadline` cùng `deadline_change_history`. `CANCELED` yêu cầu lý do/đúng quyền, không đồng nghĩa hoàn thành.

### 6.3. Báo cáo kỳ

`OPEN → SUBMITTED → VERIFIED → LOCKED`; trả lại `SUBMITTED → RETURNED → OPEN` khi được phép. `LOCKED` là bản chốt, phải lưu snapshot và phiên bản mẫu; mở lại cần thẩm quyền và audit.

### 6.4. Ba quy trình chi tiết

**A. Kế hoạch định kỳ**
1. Trưởng bộ phận tạo kế hoạch kỳ, chọn hoạt động mẫu/hạng mục và thêm nhiệm vụ nếu cần.
2. Hệ thống kiểm tra trường bắt buộc theo mẫu, chống trùng, lưu nháp.
3. Trình duyệt theo workflow phiên bản đang hiệu lực.
4. Người duyệt phê duyệt/trả lại; khi duyệt, công việc được phân công theo phạm vi.
5. Cán bộ nhận, cập nhật, yêu cầu phối hợp/xin lùi hạn nếu cần.
6. Người có quyền xác nhận kết quả; tổng hợp báo cáo theo kỳ và chốt khi cần.

**B. Hoạt động thường xuyên**
1. Hệ thống hiển thị hoạt động phù hợp bộ phận và chế độ báo cáo.
2. `ON_OCCURRENCE`: chỉ tạo bản ghi khi phát sinh. `EVERY_PERIOD`: có tác vụ báo cáo/xác nhận trong kỳ; `NO_REPORT` không tạo.
3. Cán bộ nhập đúng biểu mẫu kết quả phiên bản hiệu lực; có tùy chọn xác nhận không phát sinh nếu cho phép.
4. Trưởng bộ phận xác minh dữ liệu tùy loại hoạt động; các mục cần tổng hợp chạy vào báo cáo.

**C. Chỉ đạo/phát sinh**
1. Người có quyền tạo nhiệm vụ, một người chủ trì, có thể nhiều người phối hợp, căn cứ/chỉ đạo và hạn.
2. Gửi thông báo trong ứng dụng; ghi thời điểm giao và lịch sử thay đổi.
3. Người chủ trì cập nhật; người phối hợp cập nhật phần được cấp quyền.
4. Nếu có vướng mắc/gia hạn, ghi lý do, hạn cũ/mới và quyết định xử lý.
5. Người có thẩm quyền xác nhận hoàn thành hoặc trả lại; báo cáo tự cập nhật.

### 6.5. Ngày giờ và lịch

- Lưu timestamp theo UTC, hiển thị `Asia/Ho_Chi_Minh` (`UTC+07`).
- Tuần mặc định **thứ Hai–Chủ nhật** `[PROPOSED]`, cho phép cấu hình ngày đầu tuần; không hard-code tuần ISO là quy định nghiệp vụ.
- Kỳ báo cáo có `start_at`, `end_at`, `timezone`, `due_at`, `calendar_rule`, trạng thái khóa kỳ.
- Hệ thống hiển thị ngày Việt Nam `dd/MM/yyyy`, 24h; hỗ trợ khoảng thời gian tùy chọn.
- Số liệu thống kê theo kỳ **nghiệp vụ được chọn**, không chỉ dựa vào `created_at`.

---

## 7. PHÂN HỆ CHỨC NĂNG (FUNCTIONAL REQUIREMENTS)

### M01 — Quản trị cơ cấu tổ chức và nhân sự (`P0`)

- CRUD có lịch sử đối với đơn vị, bộ phận, tổ, vị trí, chức danh, hồ sơ cán bộ.
- Cây tổ chức không giới hạn cứng 2–3 cấp; hiển thị danh sách và sơ đồ cây.
- Điều chuyển/kiêm nhiệm có ngày hiệu lực, không phá vỡ dữ liệu quá khứ.
- Tạo liên kết người – tài khoản, kích hoạt/khóa tài khoản; tìm kiếm/lọc; nhập danh sách theo mẫu an toàn.
- Có cảnh báo xóa/vô hiệu hóa bộ phận đang có nhiệm vụ hoặc thành viên.

### M02 — Tài khoản, quyền và ủy quyền (`P0`)

- Tạo tài khoản bởi người có quyền; đăng nhập/đăng xuất, phiên, khóa, phục hồi, MFA hoặc SSO theo hạ tầng được duyệt.
- RBAC theo **vai trò + phạm vi tổ chức + quan hệ với bản ghi (ABAC)**.
- Phân công/ủy quyền theo thời hạn, thu hồi tự động, log mọi thay đổi.
- Có quyền riêng `export_report`, `approve_plan`, `publish_form`, `view_audit`, `manage_users`.
- Không có đăng ký công khai, không nhúng quyền admin trong frontend.

### M03 — Danh mục nghiệp vụ và công việc mẫu (`P0`)

- Cấu hình nhóm → **Danh mục đầu việc mẫu** → mô tả/biện pháp, người/bộ phận áp dụng, độ ưu tiên gợi ý.
- Danh mục mẫu chỉ dùng **gợi ý/tra cứu/chọn nhanh**; không là checklist cứng cho mọi người. Cán bộ có quyền được thêm đầu việc riêng không có trong mẫu.
- Gán `reporting_mode`, tần suất, biểu mẫu kết quả phiên bản, hạn nộp, chế độ duyệt.
- Nhập dữ liệu từ file gốc; gắn nguồn; phát hiện trùng; không làm mất nguyên văn.
- Cho phép ngừng dùng và thay phiên bản, không xóa lịch sử hoạt động cũ.

### M04 — Lập kế hoạch ngày/tuần/tháng (`P0`)

- Danh sách, lịch, theo bộ phận; tạo mới, sao chép **khung cấu trúc kế hoạch** (không nhân bản nhiệm vụ đang theo dõi), trình duyệt/duyệt/trả lại.
- Kế hoạch chứa hoạt động thường xuyên, **Danh mục đầu việc biến động theo từng cá nhân**, và nhiệm vụ riêng; kế hoạch tháng → tuần → ngày bằng liên kết.
- Form có thao tác `+ Thêm đầu việc`, `Chọn từ danh mục`, `Sửa`, `Sắp xếp`, `Ngừng áp dụng` theo quyền; không ép số lượng cố định.
- Bộ lọc theo kỳ, đơn vị, người phụ trách, mức ưu tiên, trạng thái.
- Tạo từ mẫu; lịch sử phiên bản và sửa đổi sau duyệt.

### M05 — Quản lý và giao nhiệm vụ (`P0`)

- Tạo/giao, theo dõi người chủ trì + phối hợp, ngày bắt đầu, hạn, ưu tiên, mô tả, kết quả dự kiến.
- Cập nhật tiến độ, trạng thái, vướng mắc, tệp đính kèm được phép, bình luận/trao đổi.
- Xin lùi hạn, phê duyệt/từ chối; xác nhận kết quả hoặc yêu cầu bổ sung.
- Đếm đúng nhiệm vụ duy nhất; không đánh dấu hoạt động 'không phát sinh' thành việc quá hạn.

### M06 — Nhật ký công tác và kết quả định kỳ (`P0`)

- Biểu mẫu phát sinh theo schema từ quản trị, đơn vị/tần suất/quy định nộp.
- Cho phép chọn đầu việc **cá nhân đang có trong kỳ**, chọn từ mẫu hoặc tạo mới khi đủ quyền; không bắt buộc hiển thị toàn bộ đầu việc mẫu.
- Nút `Ghi nhận phát sinh`, `Xác nhận không phát sinh` (nếu cấu hình), `Lưu nháp`, `Gửi báo cáo`.
- Phân biệt thiếu nộp/không phát sinh/chưa thực hiện; hỗ trợ người tổng hợp xác nhận.
- Ngăn trùng báo cáo bắt buộc cùng đối tượng–kỳ–mẫu nếu nghiệp vụ yêu cầu một bản ghi.

### M07 — Báo cáo trực tuyến / XLSX (`P0`)

- Các báo cáo theo ngày, tuần, tháng, khoảng tùy chọn; toàn đơn vị/bộ phận/cá nhân theo quyền.
- Báo cáo tổng hợp kế hoạch–nhiệm vụ, nhóm hoạt động, báo cáo tồn/vướng mắc, tiến độ xử lý, nhật ký nghiệp vụ.
- Xem trước, lọc, drill-down đến dữ liệu nguồn, xuất XLSX theo mẫu, lưu lịch sử file xuất.
- Hỗ trợ `legacy-template` bám file Excel cũ và mẫu cấu hình mới. Báo cáo chốt kỳ tái xuất đúng snapshot.
- Chỉ tổng hợp những hoạt động thuộc chế độ báo cáo áp dụng, không mặc định thống kê đủ 48 mục.

### M08 — Dashboard điều hành (`P0`)

- KPI theo kỳ/phạm vi: tổng nhiệm vụ được giao, đã hoàn thành, chờ xác nhận, đang làm, quá hạn, có vướng mắc.
- Cảnh báo việc sắp hạn, chờ duyệt, chờ xác nhận, thiếu báo cáo **chỉ đối với mẫu yêu cầu**.
- So sánh theo bộ phận nếu có quyền; bảng chi tiết lọc và truy vết.
- Số liệu demo phải gắn nhãn **'Dữ liệu minh họa'**, không mặc định hiển thị như số liệu của Hải quan.

### M09 — Bộ thiết kế biểu mẫu / quy trình / báo cáo (`P1`; nền dữ liệu chuẩn bị từ P0)

- Form builder: thêm trường, kiểu dữ liệu, thứ tự, nhóm, điều kiện hiển thị đơn giản, bắt buộc/không bắt buộc.
- Cấu hình workflow theo loại kế hoạch/nhiệm vụ/báo cáo và phạm vi; nhắc hạn, tính đến hạn.
- Report builder: chọn nguồn dữ liệu/nhóm cột/bộ lọc/nhóm tổng hợp, định dạng mẫu, trường nguồn.
- Có xem trước bằng dữ liệu giả, phát hành phiên bản, rollback có kiểm soát, so sánh khác biệt.
- Không cho quản trị viết JavaScript/SQL tùy ý vào biểu mẫu/quy trình/báo cáo.

### M10 — Thông báo, tra cứu và kiểm toán (`P1`)

- Thông báo trong WebApp về giao việc, phê duyệt, đến hạn, quá hạn, trả lại, nhắc nộp báo cáo.
- Cấu hình thời điểm nhắc và mức độ; tránh thông báo dồn dập; chưa tích hợp email/SMS bên ngoài khi chưa duyệt.
- Tìm kiếm nhiệm vụ theo mã, từ khóa, người, bộ phận, khoảng thời gian và trạng thái.
- Nhật ký audit bất biến về nghiệp vụ/thiết lập/phân quyền; dashboard bảo mật cho người có quyền.

---

## 8. THIẾT KẾ GIAO DIỆN VÀ CẤU TRÚC ĐIỀU HƯỚNG

### 8.1. Menu chính đề xuất

```text
TỔNG QUAN
  └─ Dashboard điều hành
CÔNG VIỆC
  ├─ Công việc của tôi
  ├─ Danh mục đầu việc của tôi (theo kỳ/kế hoạch)
  ├─ Nhiệm vụ được giao / chỉ đạo
  ├─ Kế hoạch công tác (Ngày | Tuần | Tháng)
  └─ Nhật ký hoạt động thường xuyên
BÁO CÁO
  ├─ Báo cáo trực tuyến
  ├─ Xuất Excel và lịch sử xuất
  └─ Báo cáo chốt kỳ
QUẢN TRỊ (theo quyền)
  ├─ Cơ cấu tổ chức
  ├─ Nhân sự và chức danh
  ├─ Tài khoản / Vai trò / Phân quyền
  ├─ Danh mục đầu việc mẫu và nhóm nghiệp vụ
  ├─ Cấu hình biểu mẫu kết quả
  ├─ Cấu hình quy trình / nhắc việc
  ├─ Cấu hình mẫu báo cáo
  └─ Nhật ký hệ thống
```

### 8.2. Danh sách route V1

| Route đề xuất | Màn hình | Vai trò chính |
|---|---|---|
| `/login` | Đăng nhập | Người dùng được cấp quyền |
| `/dashboard` | Tổng quan điều hành | Lãnh đạo, trưởng bộ phận |
| `/my-work` | Công việc của tôi | Cán bộ/công chức |
| `/plans` | Danh sách kế hoạch, bộ lọc kỳ | Lãnh đạo, trưởng bộ phận |
| `/plans/new` | Tạo kế hoạch theo biểu mẫu | Người được phép lập |
| `/plans/[id]` | Chi tiết, hạng mục, trình/duyệt | Theo quyền |
| `/tasks` | Danh sách nhiệm vụ, quá hạn, chỉ đạo | Theo quyền |
| `/tasks/[id]` | Chi tiết, người tham gia, cập nhật, lịch sử | Người liên quan |
| `/routine` | Nhật ký công tác theo ngày/kỳ | Cán bộ, trưởng bộ phận |
| `/my-work-items` | Danh mục đầu việc thực tế của cá nhân theo kỳ | Cán bộ, trưởng bộ phận trong phạm vi |
| `/routine/new` | Nhập biểu mẫu hoạt động động | Cán bộ |
| `/reports` | Xem/lọc/tổng hợp báo cáo | Theo quyền |
| `/reports/[id]` | Xem báo cáo/phiên bản chốt, xuất XLSX | Theo quyền |
| `/admin/organization` | Cây đơn vị, bộ phận | Quản trị |
| `/admin/people` | Hồ sơ nhân sự, phân công, chức danh | Quản trị |
| `/admin/accounts` | Tài khoản và quyền | Quản trị |
| `/admin/activity-catalog` | Nhóm nghiệp vụ và Danh mục đầu việc mẫu | Quản trị nghiệp vụ |
| `/admin/forms` | Thiết kế biểu mẫu kết quả | Quản trị nghiệp vụ |
| `/admin/workflows` | Quy trình phê duyệt và nhắc việc | Quản trị nghiệp vụ |
| `/admin/report-templates` | Cấu hình báo cáo / mẫu Excel | Quản trị nghiệp vụ |
| `/admin/audit` | Nhật ký thay đổi | Kiểm toán/quản trị có quyền |

> Tên route chỉ là thiết kế kỹ thuật và có thể đổi; nội dung menu hiển thị theo quyền thực tế.

### 8.3. Chi tiết 7 màn hình phải có prototype Stitch

**S01. Dashboard lãnh đạo**
- Chọn kỳ: hôm nay/tuần/tháng/tùy chọn; chọn phạm vi đơn vị được phép.
- 6 KPI card: tổng, đang làm, hoàn thành, chờ xác nhận, quá hạn, có vướng mắc.
- Bảng theo bộ phận, biểu đồ xu hướng, danh sách việc cần xử lý; click để drill-down.
- Phân biệt `số nhiệm vụ`, `số hoạt động phát sinh`, `số báo cáo đến hạn`.

**S02. Kế hoạch công tác**
- Header kỳ, trạng thái phê duyệt, người lập, phạm vi, hành động `Tạo`, `Sửa`, `Trình`, `Xuất Excel` theo quyền.
- Các tab `Tháng / Tuần / Ngày` dùng chung nguồn dữ liệu, có dòng nhóm và hạng mục.
- Một dòng có: **Danh mục đầu việc** (cho phép nhiều dòng thay đổi theo cá nhân), người chủ trì, ưu tiên, hạn, dự kiến, thực tế, trạng thái, liên kết nhiệm vụ. Có `+ Thêm đầu việc` và `Chọn từ danh mục mẫu`.

**S03. Công việc của tôi**
- Tab `Hôm nay`, `Sắp hạn`, `Quá hạn`, `Chờ xác nhận`, `Đã hoàn thành`; có khu `Danh mục đầu việc của tôi` cho đầu việc thực tế theo kỳ, kể cả đầu việc không cần giao Task độc lập.
- Card/table với tên việc, hạn, bộ phận, mức ưu tiên; CTA `Cập nhật`, `Báo hoàn thành`, `Báo vướng mắc`.
- Mobile ưu tiên một tay thao tác, ít chữ, vùng chạm lớn.

**S04. Chi tiết nhiệm vụ**
- Header + trạng thái + lịch sử, mô tả và kết quả dự kiến, người chủ trì/phối hợp.
- Timeline cập nhật, tệp đính kèm theo quyền, thay đổi hạn, bình luận, nút theo workflow.
- Không thể tự phê duyệt một yêu cầu nếu quy tắc không cho phép.

**S05. Nhật ký công tác & biểu mẫu động**
- Chọn từ **Danh mục đầu việc của tôi** hoặc thêm đầu việc theo quyền; hệ thống giải thích rõ `Bắt buộc kỳ` / `Khi phát sinh` / `Theo giao việc`.
- Form sinh từ cấu hình phiên bản; trường số liệu/văn bản/ngày/file theo loại.
- Nút `Không phát sinh` chỉ hiển thị khi cấu hình cho phép; không tạo 48 ô checklist bắt buộc.

**S06. Báo cáo trực tuyến + xuất XLSX**
- Bộ lọc kỳ/bộ phận/cá nhân/loại; chọn mẫu báo cáo; xem trước bảng/biểu đồ.
- `Xuất XLSX` chỉ hoạt động khi có quyền; rõ trạng thái dữ liệu tạm/chốt và thời điểm tổng hợp.
- Bảng có tiêu đề tiếng Việt, số liệu có đơn vị, có giải thích mục không phát sinh.

**S07. Quản trị tổ chức và bộ thiết kế cấu hình**
- Tab cơ cấu cây, danh sách nhân sự/tài khoản, quyền; CRUD có confirm.
- Form builder gồm palette kiểu trường, danh sách cấu hình, preview, draft/publish.
- Mẫu xuất báo cáo có mapping trường nguồn; cảnh báo cấu hình thiếu.

### 8.4. Phong cách hình ảnh

- **Chuyên nghiệp, nghiêm túc, hiện đại, phù hợp ứng dụng nội bộ cơ quan nhà nước; không sao chép bộ nhận diện chưa được phép.**
- Giao diện sáng mặc định; màu **đề xuất**: Navy `#17324D`, teal `#0B766D`, xanh nhạt `#EAF4F2`, trung tính `#F5F7FA`, lỗi `#B42318` (không coi là nhận diện chính thức Hải quan).
- Typography ưu tiên Inter hoặc font hỗ trợ tiếng Việt đầy đủ; chữ dễ đọc, tối thiểu 14px cho thông tin nghiệp vụ quan trọng.
- Desktop ưu tiên bảng dữ liệu lọc nhiều cột; mobile ưu tiên thẻ/tóm tắt và tác vụ nhanh, không để bảng tràn ngang ngoài vùng cuộn có chỉ dẫn.
- Hỗ trợ loading, lỗi mạng, trạng thái trống, thiếu quyền, chờ xác nhận; không chỉ thiết kế màn hình đẹp có số liệu ảo.
- Icon rõ ràng, màu trạng thái nhất quán; không dựa duy nhất vào màu để thể hiện trạng thái.
- Không hiển thị logo, quốc huy, phù hiệu hoặc biểu tượng chính thức nếu chưa có quyền sử dụng/tài sản được cấp.

---

## 9. PHÂN QUYỀN CHI TIẾT

### 9.1. Permission model

- **RBAC:** vai trò cấp các `permission` như `plans.create`, `plans.approve`, `tasks.assign`, `tasks.update_own`, `reports.export`, `config.publish`, `audit.read`.
- **Scoped access:** phạm vi `OWN`, `ASSIGNED`, `DEPARTMENT`, `SUBTREE`, `ORGANIZATION`, `EXPLICIT` tùy quyền.
- **Record relationship:** chỉ người chủ trì/người phối hợp/người được giao duyệt mới có quyền tương ứng.
- **Delegation:** ủy quyền có thời hạn, phạm vi và hành vi được phép; log rõ người thực hiện thay.
- **Deny by default:** thiếu quyền hoặc phạm vi -> từ chối; filter cả query/report/download, không chỉ ẩn menu.

### 9.2. Ma trận gợi ý (chưa là thẩm quyền pháp lý)

| Thao tác | Lãnh đạo đơn vị | Trưởng bộ phận | Cấp phó | Cán bộ | Tổng hợp | Admin kỹ thuật |
|---|---|---|---|---|---|---|
| Xem kế hoạch/nhiệm vụ | Phạm vi được giao | Bộ phận | Theo ủy quyền | Việc liên quan | Theo quyền | Không mặc nhiên |
| Lập kế hoạch | Có | Có | Theo ủy quyền | Đề xuất (nếu mở) | Theo quyền | Không |
| Phê duyệt kế hoạch | Theo thẩm quyền | Theo phân cấp | Theo ủy quyền | Không | Không | Không |
| Giao nhiệm vụ | Có | Bộ phận | Theo ủy quyền | Không | Theo quyền | Không |
| Cập nhật tiến độ | Khi tham gia | Khi tham gia | Khi tham gia | Việc được giao | Khi tham gia | Không |
| Xác nhận kết quả | Theo thẩm quyền | Theo thẩm quyền | Theo ủy quyền | Không mặc định | Theo quyền | Không |
| Nhập nhật ký | Khi phù hợp | Khi phù hợp | Khi phù hợp | Có | Theo quyền | Không |
| Xem/xuất báo cáo | Có theo phạm vi | Bộ phận | Theo ủy quyền | Cá nhân nếu mở | Theo quyền | Không mặc nhiên |
| Sửa danh mục/mẫu | Không mặc định | Đề xuất | Đề xuất | Không | Theo vai trò | Hỗ trợ kỹ thuật |
| Tài khoản, cấu hình kỹ thuật | Không mặc định | Không | Không | Không | Không | Có quyền được giao |

### 9.3. Quy tắc dữ liệu/kiểm thử phân quyền

- User bộ phận A **không được** xem bộ phận B nếu không có grant hợp lệ.
- Không được truy cập trái phép bằng cách thay `id` trên URL/API hoặc export đường dẫn file.
- Đổi vị trí nhân sự không làm thay đổi `created_by`, `approved_by` lịch sử.
- Quản trị viên kỹ thuật không cần quyền đọc nội dung nhiệm vụ để quản lý tài khoản.
- Bản ghi được cấp quyền riêng phải xác định có thời hạn hay không, được thu hồi khi nào.
- Mọi hành động nâng quyền, phê duyệt và xuất dữ liệu phải audit được.

---

## 10. CẤU HÌNH MỞ — KHÔNG CẦN THAY CODE THƯỜNG XUYÊN

### 10.1. Các cấu hình cần có

| Mục | Cấu hình được | Mức V1 |
|---|---|---|
| Cơ cấu | Cấp tổ chức, tên đơn vị, người quản lý, hiệu lực | P0 |
| Nhân sự | Chức danh, vị trí, kiêm nhiệm, trạng thái tài khoản | P0 |
| Danh mục | Nhóm, hoạt động, thứ tự, trạng thái áp dụng | P0 |
| Cách báo cáo | 4 chế độ + chưa cấu hình, tần suất, hạn | P0 |
| Biểu mẫu kết quả | Kiểu trường, bắt buộc, danh mục lựa chọn | P0 (schema seed) / P1 (UI builder) |
| Quy trình duyệt | Người/nhóm duyệt, điều kiện, số cấp được phép | P1 |
| Nhắc hạn | Mốc trước hạn, sau hạn, đối tượng nhận | P1 |
| Mẫu báo cáo | Chọn cột, nhóm, kỳ, layout Excel | P0 (mẫu chuẩn) / P1 (UI builder) |
| Dashboard | Các thẻ KPI/bộ lọc theo quyền | P1 |
| Lịch công tác | Đầu tuần, ngày nghỉ, hạn nộp | P1 |

### 10.2. Cơ chế phiên bản cấu hình

`DRAFT → VALIDATED → APPROVED → PUBLISHED → RETIRED` (các bước xét duyệt theo quyền cấu hình). Khi xuất bản:

1. Phát hành một phiên bản **bất biến** (`form_template_version`, `workflow_version`, `report_template_version`).
2. Bản ghi nghiệp vụ mới tham chiếu đúng phiên bản hiệu lực lúc tạo/nộp.
3. Bản ghi lịch sử và snapshot đã chốt **không bị viết lại** khi thay đổi biểu mẫu.
4. Có `effective_from`, `effective_to`, `created_by`, `approved_by`, `published_at`.
5. Cho phép xem khác biệt phiên bản và xem trước với dữ liệu giả.
6. Rollback nghĩa là **phát hành phiên bản thay thế/chọn lại phiên bản hợp lệ**, không xóa nội dung cũ.
7. Mẫu thiếu chỉ tiêu hoặc có điều kiện không hợp lệ -> từ chối publish và nêu lỗi rõ ràng.

### 10.3. Kiểu trường trong Form Builder

`TEXT`, `LONG_TEXT`, `INTEGER`, `DECIMAL`, `DATE`, `DATETIME`, `BOOLEAN`, `SINGLE_SELECT`, `MULTI_SELECT`, `FILE_REF`, `PERSON_REF`, `UNIT_REF`, `READ_ONLY_CALCULATED`.

Hỗ trợ: `label`, `helpText`, `required`, `defaultValue`, `options`, `min/max`, `precision`, `visibleWhen` (quy tắc khai báo hạn chế), `unit`, `sourceKey`, `piiFlag`; không cho thực thi mã tự do. Số liệu tính toán phải có công thức/quy tắc trắng được kiểm tra và chạy ở backend.

### 10.4. Ví dụ schema cấu hình (MINH HỌA, CHƯA XÁC NHẬN NGHIỆP VỤ)

```json
{
  "activityCode": "TTHQ-01",
  "activityName": "Tiếp nhận hồ sơ",
  "reportingMode": "EVERY_PERIOD",
  "frequency": "DAY",
  "formVersion": 1,
  "fields": [
    {"key":"total_files","label":"Tổng số hồ sơ","type":"INTEGER","required":true,"min":0},
    {"key":"handled_files","label":"Đã giải quyết","type":"INTEGER","required":false,"min":0},
    {"key":"issues","label":"Vướng mắc","type":"LONG_TEXT","required":false}
  ],
  "allowNotOccurred": true,
  "approvalWorkflowKey": "ROUTINE_REPORT_DEFAULT_PROPOSED"
}
```

Không được coi cấu hình ví dụ này là mẫu báo cáo chính thức. Dữ liệu thật phải kiểm tra schema tại API/server; UI chỉ là lớp hỗ trợ nhập liệu.

---

## 11. CƠ SỞ DỮ LIỆU & CÁC RÀNG BUỘC

### 11.1. Bảng dữ liệu đề xuất (logical schema, chưa phải migration cuối)

| Nhóm | Entity/Bảng | Trường/quan hệ tiêu biểu |
|---|---|---|
| Tổ chức | `organizations`, `org_units`, `positions` | id, code, parent_id, active, valid_from/to |
| Nhân sự | `people`, `person_assignments` | person_id, unit_id, position_id, effective_from/to |
| Danh tính | `accounts`, `roles`, `permissions`, `role_grants`, `delegations` | account_id, role_id, permission, scope, validity |
| Danh mục mẫu | `activity_groups`, `activity_templates`, `activity_template_versions` | group_id, code, source_raw, reporting_mode, form_version_id |
| Danh mục đầu việc cá nhân | `personal_work_items`, `personal_work_item_history` | person_id, period_id, plan_item_id, template_id NULLABLE, task_id NULLABLE, title, sort_order, status, version |
| Kỳ | `reporting_periods` | type, start_at, end_at, due_at, timezone, lock_state |
| Kế hoạch | `plans`, `plan_versions`, `plan_items`, `plan_task_links` | period_id, unit_id, approval_status, task_id |
| Nhiệm vụ | `tasks`, `task_assignees`, `task_updates`, `deadline_requests` | owner_id, assignee_id, dates, status, proposed/actual result |
| Nhật ký | `routine_entries`, `result_submissions`, `submission_values` | activity_id, period_id, person_id, result_form_version_id |
| Biểu mẫu | `form_templates`, `form_template_versions` | schema_json, status, effective_from/to |
| Quy trình | `workflow_definitions`, `workflow_versions`, `approval_instances`, `approval_actions` | node/step, actor, decision, timestamp |
| Báo cáo | `report_definitions`, `report_template_versions`, `report_runs`, `report_snapshots` | filters, columns, version, output_path, checksum |
| Hỗ trợ | `attachments`, `notifications`, `audit_events`, `config_changes` | owner/reference, actor, event, old/new summary, timestamp |

### 11.2. Ràng buộc toàn hệ thống

- Các bản ghi nghiệp vụ bắt buộc có `organization_id`, `created_at`, `updated_at`, `created_by` (nếu phù hợp), `version` hoặc cơ chế optimistic locking; xác định scope qua khóa ngoại.
- Không dùng tên người/bộ phận làm key liên kết; dùng ID ổn định.
- Có unique key cho mã nhóm và hoạt động **trong phạm vi đơn vị/nguồn**; trạng thái bản ghi sử dụng `active`/`retired`, không xóa dữ liệu tham chiếu.
- Chống trùng nhập báo cáo cho tổ hợp hoạt động–người/bộ phận–kỳ–mẫu **theo quy tắc cấu hình**.
- `personal_work_items` không được khóa cứng vào `activity_templates`; cho phép `template_id = NULL`. `person_id` và scope phải được server xác minh. Đầu việc tự tạo không mặc định sinh báo cáo bắt buộc.
- Thay đổi danh mục đầu việc cá nhân đã nằm trong kế hoạch phê duyệt hoặc báo cáo chốt phải theo quyền/quy trình và lưu lịch sử; không xóa làm mất dấu vết.
- Cập nhật đồng thời cần phát hiện conflict và thông báo rõ thay vì ghi đè thầm lặng.
- Khi người dùng đổi bộ phận, các quyền mới tính theo `assignment` hiệu lực nhưng lịch sử theo thông tin thời điểm phát sinh.
- Kiểm tra phân quyền ở API, service và truy vấn; tuyệt đối không tin `organization_id` do client gửi.
- Không lưu nội dung tệp đính kèm nhạy cảm dưới đường dẫn public; dùng lưu trữ riêng có quyền truy cập, kiểm tra loại tệp và dung lượng.
- Snapshot báo cáo ghi các định danh bản ghi nguồn, phiên bản biểu mẫu, thời điểm chốt, người chốt, checksum/phiên bản xuất.
- `audit_events` cần append-only, không cho sửa/xóa từ giao diện nghiệp vụ.

### 11.3. Tối thiểu API contract (hướng thiết kế, không buộc kiểu REST)

```text
GET    /api/me
GET    /api/dashboard?period=...&unitId=...
GET    /api/org-units/tree
GET    /api/people?unitId=...
GET    /api/activity-templates?groupId=...
GET    /api/personal-work-items?personId=...&periodId=...
POST   /api/personal-work-items
PATCH  /api/personal-work-items/{id}
GET    /api/plans?periodId=...
POST   /api/plans
POST   /api/plans/{id}/submit
POST   /api/plans/{id}/approve
GET    /api/tasks?status=...&unitId=...
POST   /api/tasks
POST   /api/tasks/{id}/updates
POST   /api/tasks/{id}/complete-request
POST   /api/tasks/{id}/deadline-request
POST   /api/routine-entries
POST   /api/report-submissions
GET    /api/reports/preview?templateId=...&periodId=...
POST   /api/reports/export-xlsx
POST   /api/report-periods/{id}/lock
POST   /api/admin/form-versions/{id}/publish
```

Mỗi API cần `auth`, `scope authorization`, schema validation, lỗi chuẩn và audit thích hợp. Đường dẫn chỉ minh họa.

---

## 12. BÁO CÁO TRỰC TUYẾN VÀ XUẤT XLSX

### 12.1. Hai hình thức báo cáo `[AGREED]`

1. **Xem trực tuyến:** xem bảng và KPI, lọc kỳ/người/bộ phận/nhóm nhiệm vụ; drill-down đến nguồn nếu có quyền.
2. **Xuất `.xlsx`:** tạo file theo mẫu được chọn, giữ tiêu đề/bảng/cột/định dạng, có nguồn số liệu và thời điểm chốt.

Người dùng **không phải nhập dữ liệu báo cáo hai lần**. Báo cáo là phép chiếu/tổng hợp trên dữ liệu kế hoạch, nhiệm vụ, nhật ký và kết quả đã được nộp/xác nhận.

### 12.2. Danh sách report template

| Mã | Tên báo cáo | Nguồn | Trạng thái MVP |
|---|---|---|---|
| `RPT-PLAN-WEEK-LEGACY` | Báo cáo công tác thực hiện kế hoạch tuần theo Excel gốc | Nhóm + kế hoạch + thực tế theo kỳ | P0 |
| `RPT-PLAN-DAILY` | Tổng hợp công việc ngày | Task + routine đủ điều kiện | P0 |
| `RPT-PLAN-WEEK` | Tổng hợp kế hoạch và kết quả tuần | Plan/Task/Result | P0 |
| `RPT-PLAN-MONTH` | Tổng hợp kế hoạch và kết quả tháng | Plan/Task/Result | P0 |
| `RPT-TASK-DETAIL` | Danh sách chi tiết nhiệm vụ | Task | P0 |
| `RPT-ISSUES` | Công việc tồn đọng/quá hạn/vướng mắc | Task + issue/deadline | P0 |
| `RPT-ACTIVITY-DETAIL` | Kết quả các hoạt động nghiệp vụ có báo cáo | RoutineEntry/ResultSubmission | P1 |
| `RPT-CUSTOM` | Báo cáo tùy biến qua quản trị | Nguồn whitelist | P1 |

### 12.3. Quy tắc tính toán KPI

- **Tổng nhiệm vụ:** `COUNT(DISTINCT tasks.id)` trong phạm vi/kỳ lọc, **không** đếm số dòng nhóm hoặc số liên kết tháng–tuần.
- **Đã hoàn thành:** nhiệm vụ `DONE` theo trạng thái xác nhận cấu hình; tách `WAITING_REVIEW`.
- **Quá hạn:** nhiệm vụ chưa đóng và đã vượt hạn hiệu lực; theo dõi hạn gốc và số lần điều chỉnh.
- **Đang thực hiện:** `IN_PROGRESS` (có thể kèm cờ vướng mắc), không cộng 'không phát sinh'.
- **Tỷ lệ hoàn thành:** số `DONE` / số nhiệm vụ **thuộc phạm vi KPI đã định nghĩa**, tránh mẫu số gồm danh mục hoạt động hoặc việc hủy. Cần thể hiện rõ quy tắc mẫu số.
- **Tỷ lệ nộp báo cáo:** số nghĩa vụ báo cáo đã nộp hợp lệ / số nghĩa vụ báo cáo **đến hạn thực sự**. `ON_OCCURRENCE` chưa phát sinh và `NO_REPORT` không nằm trong mẫu số.
- **Đơn vị tính:** tờ khai, hồ sơ, lượt, vụ, tiền, giờ... phải đến từ trường định nghĩa và không tự cộng các đơn vị không đồng nhất.
- Báo cáo theo tháng và tuần của **cùng Task** có thể xuất hiện trong từng phạm vi nhưng không được cộng gộp thành 2 nhiệm vụ khác nhau trong một báo cáo tổng.

### 12.4. Hai cách xuất Excel phải phân biệt

**Cách A — Mẫu truyền thống (Legacy)**

- Giữ bố cục gần với Excel nguồn: tiêu đề A1:H1, kỳ báo cáo, 8 cột và 5 dòng nhóm (tùy bộ phận). Đảm bảo file mở được bằng Excel thông dụng. **Mặc định cột C xuất `Danh mục đầu việc` theo phản hồi mới**; bản lưu trữ nguồn Excel vẫn giữ tiêu đề nguyên văn cũ để đối chiếu.
- Kết quả của mỗi nhóm là **kết quả tổng hợp theo cấu hình**, không mặc định copy nguyên G8–G12 thành 'kết quả thực tế'.
- Nếu thay số dòng hoặc cần nhiều dòng hoạt động, phải xuất **mẫu chi tiết** hoặc mở rộng vùng in một cách có kiểm soát; không đè vào ô gộp làm hỏng file. **Đầu việc cá nhân biến động** được đưa vào cột C dạng dòng/bullet theo người và kỳ; không xuất 48 đầu việc mẫu mặc định.
- Đánh dấu nguồn tên nhóm/cột gốc để người dùng có thể đối chiếu với Excel hiện hành.

**Cách B — Mẫu chi tiết/cấu hình mới**

- Mỗi dòng tương ứng nhiệm vụ hoặc hoạt động có báo cáo, có thể nhóm theo bộ phận/cá nhân/loại việc.
- Trường/cột/kết quả được quản trị viên lựa chọn, có định dạng số, ngày, gộp ô/cộng tổng hợp khi hợp lệ.
- Tùy chọn xuất nhiều sheet: `Tổng quan`, `Chi tiết nhiệm vụ`, `Hoạt động`, `Vướng mắc`.

### 12.5. Vòng đời và bảo mật file XLSX

- Nhấn `Xem trước` → sinh truy vấn với kiểm tra quyền → tùy chọn `Chốt` → `Xuất XLSX` → tạo file trong khu vực riêng → tải qua endpoint có kiểm tra quyền.
- `report_runs` lưu người yêu cầu, mẫu phiên bản, bộ lọc, thời điểm, snapshot, checksum, trạng thái thành công/thất bại.
- Xuất lại bản **đã chốt** phải cho cùng số liệu theo phiên bản/chính sách dữ liệu tương ứng, dù biểu mẫu mới thay đổi.
- Không mở liên kết tải Excel cho người ngoài chỉ bằng URL cố định; có quyền truy cập và giới hạn thời gian.
- Chống injection tại ô Excel: dữ liệu do người dùng nhập bắt đầu bằng `=`, `+`, `-`, `@` và các ký tự điều khiển phải được xử lý như **văn bản**, trừ công thức do hệ thống định nghĩa an toàn.
- Kiểm tra tệp template tải lên, liên kết ngoài, macro/hàm độc hại, tên sheet và số dòng tối đa; chỉ dùng `.xlsx` từ người có quyền quản trị.
- Không đưa tệp đính kèm nghiệp vụ nhạy cảm trực tiếp vào file xuất nếu chưa có yêu cầu và quyền rõ ràng.

### 12.6. Mẫu báo cáo cấu hình

Thông tin cấu hình tối thiểu:

```yaml
report_code: RPT-PLAN-WEEK
name: Báo cáo thực hiện kế hoạch công tác tuần
source_entities: [plans, tasks, routine_entries, result_submissions]
period: WEEK
scope: AUTHORIZED_UNITS
filters: [unit_id, owner_id, status, priority]
columns:
  - {key: date, label: "Thứ / Ngày", type: DATE}
  - {key: activity_group, label: "Nhiệm vụ thường xuyên", type: TEXT}
  - {key: personal_work_items, label: "Danh mục đầu việc", type: MULTILINE_TEXT, source: personal_work_items, aggregation: AUTHORIZED_PERSON_PERIOD_ITEMS}
  - {key: owner, label: "Bộ phận/Cán bộ phụ trách", type: TEXT}
  - {key: collaborators, label: "Đơn vị phối hợp", type: TEXT}
  - {key: priority, label: "Mức độ ưu tiên", type: ENUM}
  - {key: expected_result, label: "Kết quả dự kiến", type: TEXT}
  - {key: progress_status, label: "Tiến độ / Trạng thái", type: ENUM}
output_formats: [WEB, XLSX]
layout: LEGACY_GROUPED
approval_required: TBD
```

Tên và bảng nguồn ở trên chỉ gợi ý; engine thực tế sử dụng các phép ánh xạ được kiểm soát, không cho tùy ý viết SQL trên giao diện.

---

## 13. AN TOÀN THÔNG TIN, DỮ LIỆU VÀ ĐIỀU KIỆN TRIỂN KHAI

### 13.1. Nguyên tắc `[SECURITY-GATE]`

- Dự án có đối tượng sử dụng là **cơ quan Hải quan**, do đó hồ sơ cán bộ, thông tin nội bộ và nghiệp vụ có thể thuộc diện dữ liệu phải bảo vệ; phân loại và phê duyệt **theo quy định của cơ quan**.
- **Prototype Stitch/Antigravity chỉ sử dụng dữ liệu giả lập.** Không gửi dữ liệu thực tế về tờ khai, doanh nghiệp, cán bộ, lịch trực, vụ việc, tài liệu nội bộ hoặc thông tin thuộc bí mật nhà nước đến dịch vụ AI/cloud bên ngoài khi chưa được phép.
- Chọn hạ tầng triển khai (máy chủ nội bộ/trung tâm dữ liệu được phép, kết nối mạng, miền truy cập, chứng thư, sao lưu) **sau đánh giá và phê duyệt của bộ phận CNTT/an toàn thông tin có thẩm quyền**.
- Không mặc định rằng chọn công nghệ mã nguồn mở, dùng HTTPS hoặc có đăng nhập là đáp ứng đầy đủ quy định an toàn thông tin.
- Phải xác định phạm vi dữ liệu, chủ quản hệ thống, quản lý tài khoản, quản lý phiên, phân loại thông tin, cấp độ bảo đảm an toàn hệ thống thông tin khi áp dụng, hồ sơ và thủ tục liên quan.
- Quy tắc lưu trữ, thời hạn lưu, sao lưu/xóa và xuất báo cáo phải theo chính sách được phê duyệt; không tự chọn retention pháp lý.

### 13.2. Yêu cầu kỹ thuật an toàn tối thiểu

1. Kiểm soát truy cập phía server, least privilege, MFA/SSO theo môi trường được duyệt, không đăng ký công khai.
2. TLS trong quá trình truyền, mã hóa ở mức phù hợp khi lưu trữ, cơ chế bảo vệ/luân chuyển bí mật.
3. Session an toàn, bảo vệ CSRF/XSS/SQL injection, giới hạn tốc độ, kiểm tra đầu vào, hạn chế tệp upload độc hại.
4. Audit đăng nhập, thao tác thay đổi quyền, dữ liệu quan trọng, phê duyệt, xuất báo cáo, cấu hình phiên bản.
5. Sao lưu định kỳ và **kiểm thử khôi phục**; quy trình giám sát/ứng cứu sự cố rõ ràng.
6. Cơ chế phân tách dữ liệu theo organization/unit và mức độ nhạy cảm; không truy cập chéo bằng sửa URL, API hay XLSX.
7. Phân quyền download file; đường dẫn lưu tệp riêng, kiểm tra quyền từng lần tải.
8. Môi trường `development`, `staging`, `production` cách ly; dữ liệu production không sao chép sang demo tùy tiện.
9. Ẩn/redact thông tin nhạy cảm khỏi log, báo lỗi, crash report và prompt gửi agent.
10. Không cho tác nhân AI tự chạy lệnh nguy hiểm, thay đổi DB production hay xuất tệp dữ liệu thật khi chưa được người có quyền kiểm soát.

### 13.3. Tham chiếu pháp lý để bộ phận có thẩm quyền rà soát (không thay tư vấn pháp chế)

Tại thời điểm biên soạn 09/10/2026, các văn bản/nguồn chính thức có liên quan gồm:

- Luật Bảo vệ dữ liệu cá nhân số **91/2025/QH15**, có hiệu lực 01/01/2026: https://vanban.chinhphu.vn/?docid=214590&pageid=27160
- Nghị định **356/2025/NĐ-CP** hướng dẫn Luật Bảo vệ dữ liệu cá nhân, có hiệu lực 01/01/2026: https://vanban.chinhphu.vn/?classid=1&docid=216387&pageid=27160
- Luật An ninh mạng số **116/2025/QH15**, có hiệu lực 01/07/2026: https://vanban.chinhphu.vn/?classid=&docid=216499&pageid=27160
- Luật Bảo vệ bí mật nhà nước số **117/2025/QH15** (hiệu lực 01/03/2026), tra cứu Công báo: https://congbao.chinhphu.vn/van-ban-dang-cong-bao/quoc-hoi-c31/trang-6.htm
- Nghị định **85/2016/NĐ-CP** về bảo đảm an toàn hệ thống thông tin theo cấp độ: https://vanban.chinhphu.vn/?classid=1&docid=185601&pageid=27160

**Phải rà soát văn bản sửa đổi/bổ sung, quy định ngành Hải quan và quy định cơ quan chủ quản đang có hiệu lực tại thời điểm nghiệm thu.** Không mặc định mọi văn bản trên áp dụng giống nhau cho mọi loại dữ liệu/hệ thống. Bộ tài liệu này **không thay thế đánh giá an toàn thông tin hay phê duyệt triển khai**.

---

## 14. KIẾN TRÚC WEBAPP & STACK ĐỀ XUẤT

### 14.1. Nguyên tắc kiến trúc

- Kiến trúc **modular monolith** cho V1 để dễ phát triển, kiểm thử, vận hành và nâng cấp; không cần microservices từ ngày đầu.
- Phân tách rõ UI, logic nghiệp vụ, permission service, report service, repositories, schema cấu hình.
- **Configuration-driven nhưng giới hạn hữu ích**: biểu mẫu, luồng duyệt, mẫu báo cáo cấu hình được; nguyên tắc bảo mật/quan hệ dữ liệu/lịch sử nằm trong code lõi.
- Không xây 'no-code builder tổng quát' dùng viết tùy ý bất kỳ phần mềm nào.
- API/versioning rõ ràng để sau này có thể kết nối hệ thống khác khi được phép.
- Code ưu tiên dễ bảo trì cho đội phát triển nhỏ, không tối ưu hóa sớm vượt nhu cầu.

### 14.2. Công nghệ gợi ý `[PROPOSED]`

| Lớp | Gợi ý | Lý do |
|---|---|---|
| UI | **React + TypeScript + Next.js** | Web responsive, route, component hóa |
| Styling | **Tailwind CSS + thư viện component accessible** | Dễ nhất quán với Stitch/design tokens |
| API | **Next.js backend route/service layer** cho V1 | Một codebase, không phải vận hành 2 server lớn |
| Validation | **Zod** và kiểm tra độc lập server | Schema typed cho API và form config |
| DB | **PostgreSQL** | Quan hệ kế hoạch, phân quyền, lịch sử |
| ORM | **Prisma hoặc Drizzle** (chọn một, ghi ADR) | Migration, type safety |
| Auth | **Giải pháp SSO/MFA phù hợp hạ tầng phê duyệt** | Không tự gắn dịch vụ ngoài |
| Storage | **Private object/file storage**, không public bucket | Tệp minh chứng, mẫu XLSX, bản xuất |
| Excel | **openpyxl trong worker Python** cho mẫu truyền thống hoặc **ExcelJS** cho báo cáo mới | Cần thử nghiệm khả năng giữ bố cục file Excel gốc |
| Background tasks | Job runner/queue khi cần xuất file lớn, nhắc việc | Không phải bắt buộc ngay ngày đầu |
| Test | **Vitest, Playwright, kiểm thử API/phân quyền** | Chống lỗi quy trình và export |
| Deploy | Container/self-host/private infrastructure **nếu được phê duyệt** | Kiểm soát dữ liệu và vận hành |

**Ghi chú:** Đây là phương án công nghệ dự kiến, **không phải bắt buộc**. Trước khi code phải xác nhận quy định công nghệ/hạ tầng của đơn vị và lập ADR (Architecture Decision Record). Nếu tách Python worker chỉ để xuất XLSX, bắt đầu bằng adapter/port; không làm một microservice phức tạp không cần thiết.

### 14.3. Cấu trúc repository gợi ý

```text
talung-cus-work/
├── PROJECT_CONTEXT.md           # Tài liệu này; source of truth về sản phẩm
├── README.md                     # Cách cài, chạy và test
├── docs/
│   ├── DECISIONS.md              # ADR/biên bản xác nhận nghiệp vụ sau này
│   ├── DESIGN.md                 # Design tokens được trích từ Stitch
│   ├── DATA_DICTIONARY.md        # Từ điển dữ liệu triển khai
│   └── API_SPEC.md               # Hợp đồng API
├── src/
│   ├── app/                      # Pages/routes
│   ├── components/               # Shared UI components
│   ├── features/                 # organization, plans, tasks, routine, reports...
│   ├── server/                   # auth, authorization, services, repositories
│   ├── config-engine/            # forms, workflow, report config/versions
│   └── lib/                      # schemas, helpers, time, error handling
├── prisma/                       # nếu chọn Prisma
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                    # Chỉ dữ liệu giả và danh mục công khai được phép
├── tests/                        # unit, integration, e2e, security
├── scripts/
│   └── import-legacy-xlsx.*      # dry-run/preview/validated import
└── deploy/                       # env example, compose, deployment checklist
```

### 14.4. Dữ liệu demo & môi trường

- Seed demo: `Lãnh đạo đơn vị`, `Bộ phận A/B/C`, `Cán bộ mẫu 01/02/03`, các task/vướng mắc mô phỏng, 5 nhóm/48 hoạt động mẫu (gắn nguồn).
- Dữ liệu giả có thể là văn bản gần thực tế **nhưng không chứa số tờ khai thật, tên doanh nghiệp thật, thông tin nhân sự thật, vụ việc thật**.
- Có banner `DEMO — DỮ LIỆU GIẢ LẬP` và một lệnh reset seed trong môi trường phát triển.
- Production phải có quá trình tạo tài khoản/nhập danh mục riêng; **không seed mật khẩu demo/admin công khai** vào production.
- Không bật gửi thông báo email/SMS hay telemetry bên ngoài theo mặc định.

---

## 15. PHÂN KỲ TRIỂN KHAI VÀ PHẠM VI BẢN ĐẦU

### 15.1. MVP/P0 — Phải hoạt động end-to-end

1. Đăng nhập demo an toàn trong môi trường phát triển, bộ khung authorization server-side.
2. Quản lý bộ phận/nhân sự/tài khoản và vai trò cơ bản.
3. Danh mục 5 nhóm + 48 hoạt động mẫu có nguồn và `UNCONFIGURED` reporting mode.
4. Thiết lập chế độ báo cáo của hoạt động, biểu mẫu kết quả bằng schema ít nhất từ cấu hình sẵn.
5. Kế hoạch ngày/tuần/tháng → trình/duyệt → liên kết nhiệm vụ → giao việc → cập nhật → xác nhận.
6. Nhật ký hoạt động và báo cáo khi phát sinh/không phát sinh theo cấu hình.
7. Dashboard và báo cáo trực tuyến; xuất `.xlsx` ít nhất 2 mẫu: bản bám Excel gốc và bảng chi tiết.
8. Lịch sử thao tác cốt lõi, chặn truy cập trái quyền, ngăn công việc bị đếm trùng.

> MVP phải có **dữ liệu thật trong database demo**, CRUD, API và test. Chỉ mock UI không được gọi là MVP hoàn chỉnh.

### 15.2. V1.1 / P1 — Tăng tính cấu hình

- UI form builder (tạo trường/định dạng/thẩm định/preview/publish/version).
- UI workflow builder (các cấp duyệt trong tập điều kiện giới hạn); nhắc việc cấu hình.
- UI report builder (mẫu báo cáo/cột/xếp nhóm/định dạng xuất), báo cáo chốt kỳ/snapshot.
- Lịch sử phân quyền nâng cao, ủy quyền có thời hạn, audit dashboard.
- Import XLSX qua wizard có dry-run và xác nhận.

### 15.3. V2 / P2 — Khi có nhu cầu và được phê duyệt

- SSO chính thức, tích hợp hệ thống văn bản hoặc nguồn báo cáo nghiệp vụ hợp pháp.
- Báo cáo đa đơn vị/cấp trên trong phạm vi được phép, đối soát phiên bản.
- PWA offline có kiểm soát (chỉ nếu được đánh giá bảo mật), mobile app native nếu có lý do thực tế.
- Phân tích xu hướng công việc nâng cao; tuyệt đối không tự đưa quyết định nghiệp vụ hoặc xếp loại cán bộ.

### 15.4. Các mốc triển khai có kiểm soát

- **Gate A — Khảo sát:** xác nhận cơ cấu, các chế độ báo cáo, bộ chỉ tiêu, thẩm quyền duyệt, hạ tầng.
- **Gate B — Prototype:** Stitch bàn giao thiết kế 7 màn hình + design system; lãnh đạo/đầu mối nghiệp vụ góp ý.
- **Gate C — Technical POC:** đăng nhập demo, tổ chức/nhân sự, 1 luồng kế hoạch–task–report, xuất XLSX, kiểm thử phân quyền.
- **Gate D — MVP:** đủ P0, kiểm thử và tài liệu cài đặt, user acceptance testing (UAT).
- **Gate E — Production:** chỉ sau phê duyệt bảo mật, hạ tầng, quyền truy cập và quy trình vận hành chính thức.

---

## 16. STITCH DESIGN BRIEF — PROMPT SẴN DÙNG

> **Mục đích:** chỉ tạo UI/UX prototype, design tokens và các trạng thái màn hình. Không tạo/sử dụng dữ liệu thật. Copy nội dung giữa các dòng `PROMPT` vào Stitch. Google Stitch hỗ trợ thiết kế UI từ prompt và có phương án xuất/chuyển sang Antigravity; tích hợp hiện hành nên kiểm tra lại theo tài liệu Google.

### PROMPT — Google Stitch

```text
You are a senior product designer specializing in secure, data-heavy internal government operations web applications in Vietnam.

PROJECT:
Internal project identifier: talung-cus-work.
Design a cohesive, high-fidelity responsive WebApp prototype named:
"HỆ THỐNG QUẢN LÝ KẾ HOẠCH & CÔNG VIỆC — HẢI QUAN TÀ LÙNG".
This is an internal work planning, task coordination and reporting tool; NOT customs declaration or clearance software. Do not invent official organizational structures, official logos, real people or case data.

LANGUAGE:
All visible interface text must be clear, professional Vietnamese, including realistic form labels, statuses, empty states, validation hints and confirmation dialogs.

VISUAL STYLE:
- Professional, restrained, trustworthy public-sector style; predominantly LIGHT theme.
- Suggested navy #17324D, teal #0B766D, light mint #EAF4F2, neutral #F5F7FA, warning red #B42318; colors are provisional, not an official brand.
- Modern accessible typography supporting Vietnamese, clear hierarchy, 8px spacing rhythm, reusable card/table/form/button patterns.
- Desktop 1440px data-dense layout with sidebar and top bar; mobile 390px with usable cards, compact navigation and touch-friendly actions.
- No large marketing illustrations, neon gradients, excessive whitespace, dark dashboard default, fake badges or official insignia.

CORE RULES:
1. A task exists once and may be linked to day/week/month plans without duplication.
2. Routine activity templates are different from assigned tasks.
3. A routine may be configured: report each period, report only when occurred, report only when assigned, or no separate report.
3a. The visible Vietnamese label for the former Excel column C is exactly **"Danh mục đầu việc"**. These work items VARY by person and reporting period. Include an editable add/reorder/select-template interaction for the person's own work items; never render all 48 source rows as mandatory checkboxes.
4. "Không phát sinh" is distinct from "Chưa thực hiện" and "Chưa báo cáo".
5. Support configurable expected result vs actual result, form schema and reporting mode.
6. Visible actions must respect roles; make approval, edit, view and export affordances unambiguous.
7. All names/data are obviously illustrative: "Bộ phận A", "Cán bộ mẫu", "DỮ LIỆU MINH HỌA".

SCREENS TO DESIGN AS ONE CONSISTENT PRODUCT:
S01 Leadership dashboard: day/week/month/custom filters; task KPIs, pending approval, blocked/overdue list, department comparison and drill-down affordances.
S02 Plans: month/week/day tabs, group/task table, plan create/edit, submit for approval, approval history and results. Show a per-person dynamic "Danh mục đầu việc" list with "+ Thêm đầu việc" and "Chọn từ danh mục mẫu".
S03 My Work: responsive assigned tasks, due today, soon, overdue, waiting confirmation; quick progress and completion actions.
S04 Task Detail: description, owner, collaborators, expected result, deadline, timeline, progress, issue reporting, deadline extension and approval.
S05 Routine Work Log: searchable activity categories AND personal period-specific "Danh mục đầu việc", configuration-based report forms, "Có phát sinh" and (when allowed) "Không phát sinh" states, simple daily entry.
S06 Reports: report type, period, unit and status filters, summary table, live preview, clear "Xuất XLSX" and locked snapshot label.
S07 Admin Console: organizational hierarchy tree, personnel/account management, roles and permissions, activity catalog, dynamic form-builder with preview, report template editor.

INCLUDE INTERACTION STATES:
Loading, empty, no-access, form validation errors, conflict, confirmation modal, submitted, returned, approved, locked period, no occurrence and export-in-progress.

DESIGN HANDOFF:
Use a consistent design system across screens; prepare reusable design tokens and component patterns, friendly to React + Tailwind implementation. Include desktop and mobile variants for the core task, routine form and report screens.
Output screen concepts/prototypes only; do not claim production backend, real integration, or legal compliance.
```

### Hướng dẫn đối chiếu sau Stitch

- Kiểm tra đủ 7 màn hình và đúng tiếng Việt; không chứa tên cán bộ/doanh nghiệp thật.
- Kiểm tra mobile 390px, desktop 1440px, các trạng thái empty/loading/error.
- Xuất/lấy `DESIGN.md` hoặc Design DNA/tokens nếu tính năng sẵn có; kiểm tra sự khác nhau giữa thiết kế và code cuối.
- Không sao chép Stitch output nguyên xi vào production nếu chưa kiểm tra accessibility, permission và rendering bảng dữ liệu lớn.

---

## 17. ANTIGRAVITY — INSTRUCTIONS / PROMPT KHỞI TẠO

### 17.1. Mục tiêu

Antigravity đóng vai trò **coding agent** để triển khai WebApp có database, API, UI, authorization, export XLSX và tests; Stitch cung cấp **tham chiếu thiết kế**. Google có hướng dẫn tích hợp Stitch MCP với Antigravity để lấy thông tin thiết kế vào project.

### 17.2. PROMPT khởi tạo — đưa vào Antigravity

```text
Bạn là Tech Lead + Solution Architect + Senior Full-stack Engineer chịu trách nhiệm xây dựng WebApp quản lý kế hoạch và công việc cho Hải quan Cửa khẩu quốc tế Tà Lùng.

Tên dự án kỹ thuật/repository đã chốt: `talung-cus-work`. Đặt tên thư mục gốc, gói/phần cấu hình liên quan và tài liệu theo slug này; giữ tên hiển thị tiếng Việt cho người dùng cuối.

BƯỚC 0 — BẮT BUỘC:
1. Đọc toàn bộ file ./PROJECT_CONTEXT.md ở thư mục gốc; đây là source of truth về mục tiêu, thuật ngữ, nghiệp vụ, phạm vi và các giới hạn bảo mật.
2. Đọc ./docs/DESIGN.md nếu đã có dữ liệu Stitch. Nếu chưa có, chỉ thiết kế UI nền tảng theo §8/§16; không bịa nhận diện chính thức.
3. Đừng bắt đầu sinh hàng trăm file ngay. Trước hết tạo IMPLEMENTATION_PLAN.md và đề xuất stack/kiến trúc module, schema DB, authorization, export XLSX, các giai đoạn và rủi ro. Gắn nhãn TBD cho nội dung chưa được Hải quan xác nhận.

KỶ LUẬT SẢN PHẨM:
- Đây là ứng dụng công tác nội bộ, không phải phần mềm thông quan.
- Không dùng dữ liệu thật, tên cán bộ thật, hồ sơ Hải quan thật hay dữ liệu nhạy cảm trong môi trường AI/dev.
- Không hard-code tổ chức, quy trình duyệt, biểu mẫu báo cáo và trách nhiệm phải báo cáo.
- Hoạt động thường xuyên ≠ task; 'Không phát sinh' ≠ 'Chưa thực hiện' ≠ 'Chưa nộp báo cáo'.
- Mỗi task một định danh; liên kết ngày/tuần/tháng, chống trùng KPI.
- Source Excel 5 nhóm/48 dòng là seed danh mục NEEDS_REVIEW, không phải 48 công việc phải nhập mỗi kỳ.
- Mọi quyền phải kiểm tra tại server và truy vấn DB, không chỉ ẩn nút frontend.
- Không tự động đặt mật khẩu admin công khai, không dùng external AI API hoặc telemetry thật.

CÔNG NGHỆ:
Đề xuất stack Next.js + TypeScript + Tailwind + PostgreSQL + ORM được chọn duy nhất, kiến trúc modular monolith; có thể điều chỉnh sau ADR. Tạo API/service typed, Zod validation, migrations, seed giả lập, bộ test và hướng dẫn cài đặt.

THỨ TỰ CÔNG VIỆC:
PHASE 1: Khung repo, auth demo an toàn, authorization, cơ cấu tổ chức, nhân sự, vai trò và 5 nhóm/48 hoạt động seed.
PHASE 2: Activity reporting mode/config version, **personal_work_items linh hoạt theo cá nhân/kỳ**, kế hoạch kỳ, task giao việc/duyệt, routine results, timeline. Nhãn UI/cột xuất mặc định: **Danh mục đầu việc**.
PHASE 3: Dashboard, report previews, xuất XLSX (legacy + detail), test nghiệp vụ/permission.
PHASE 4: Polish UI Stitch design, responsive/mobile, audit, tài liệu, UAT checklist.

LÀM VIỆC THEO TỪNG VERTICAL SLICE:
Mỗi bước: mô tả phạm vi -> thay đổi mã nguồn -> migration/seed -> test -> mở trang kiểm tra trên browser -> báo cáo kết quả và bước tiếp theo. Chỉ tuyên bố hoàn thành khi test chạy thành công. Báo điểm chưa thực hiện trung thực.

DELIVERABLE BẮT BUỘC:
- Source code hoàn chỉnh của phạm vi được triển khai.
- README setup/dev/test/deploy; .env.example không có secret thật.
- DB migration + seed giả; role matrix được thực thi trên backend.
- API validation + test các case không phát sinh/trễ hạn/trùng task/không có quyền.
- XLSX hợp lệ, có thử tải và mở, dữ liệu đúng theo kỳ/mẫu.
- IMPLEMENTATION_PLAN.md, data dictionary và danh sách TBD chưa quyết định.

Bây giờ chỉ thực hiện BƯỚC 0 và đưa ra implementation plan có thể kiểm chứng. Không gọi hệ thống là production-ready khi chưa qua các security gates được nêu trong PROJECT_CONTEXT.md.
```

### 17.3. Khuyến nghị nối Stitch → Antigravity

1. Tạo 7 màn hình trong Stitch từ prompt §16.
2. Tạo/nhận Design DNA hoặc `DESIGN.md` của bản thiết kế.
3. Sử dụng chức năng xuất sang Antigravity **hoặc Stitch MCP** theo tài liệu Google hiện hành; cấu hình API key theo hướng dẫn bảo mật, **không lưu token trong git hay file context**.
4. Yêu cầu agent ánh xạ tokens/layout sang components React/Tailwind; **đọc cả `PROJECT_CONTEXT.md`**, không chỉ hình chụp Stitch.
5. So sánh giao diện code với Stitch bằng browser testing, sau đó kiểm thử hành vi thật: đăng nhập, lọc, giao, nộp, duyệt, xuất XLSX, từ chối trái quyền.

Tài liệu kỹ thuật Google (tham khảo 22/07/2026): https://codelabs.developers.google.com/design-to-code-with-antigravity-stitch

---

## 18. ACCEPTANCE CRITERIA VÀ BỘ TEST BẮT BUỘC

### 18.1. Nghiệm thu nghiệp vụ

| ID | Kiểm thử chấp nhận | Kết quả mong đợi |
|---|---|---|
| `AT-01` | Tạo bộ phận, người, tài khoản; điều chuyển có ngày hiệu lực | Cây tổ chức đúng, giữ lịch sử |
| `AT-02` | Import file seed gốc | Có 5 nhóm/48 dòng hoạt động; không tự tạo nhiệm vụ thật |
| `AT-03` | Hoạt động `ON_OCCURRENCE` không có phát sinh | Không phải nộp và không bị tính `Chưa thực hiện` |
| `AT-04` | Hoạt động `EVERY_PERIOD` không phát sinh, cấu hình cho phép xác nhận | Có `Không phát sinh`, không coi là 0% hoàn thành task |
| `AT-05` | Hoạt động `EVERY_PERIOD` đến hạn nhưng không cập nhật | Có nghĩa vụ `Chưa nộp`, cảnh báo đúng |
| `AT-06` | Hoạt động `NO_REPORT` | Không tạo nghĩa vụ báo cáo, không nhắc, không tính mẫu số |
| `AT-07` | Hoạt động `ON_ASSIGNMENT` không có giao việc | Không sinh báo cáo bắt buộc |
| `AT-08` | Task gắn cả kế hoạch tháng và tuần | Một Task ID; thống kê DISTINCT, không đếm 2 lần |
| `AT-09` | Cán bộ báo xong, trưởng bộ phận chưa duyệt | `WAITING_REVIEW`, chưa `DONE` nếu cấu hình cần xác nhận |
| `AT-10` | Xin gia hạn có lý do và được/từ chối | Lưu hạn gốc, hạn mới, quyết định, người và thời gian |
| `AT-11` | Trình kế hoạch, trả lại, duyệt | Mỗi chuyển trạng thái đúng quyền, lưu audit |
| `AT-12` | Đổi biểu mẫu kết quả v1 → v2 | Bản cũ vẫn đọc/xuất theo schema v1 |
| `AT-13` | Xuất XLSX báo cáo tuần | File mở được, kỳ/bộ lọc/kết quả đúng, không lỗi ô gộp |
| `AT-14` | Xuất báo cáo chi tiết | Chỉ các hoạt động có nghĩa vụ/dữ liệu phù hợp; không mặc định 48 dòng |
| `AT-15` | Chốt kỳ rồi thay dữ liệu nguồn đúng quy trình | Snapshot trước không bị thay âm thầm; xuất lại tái lập |
| `AT-16` | Tài khoản bộ phận A đoán URL task bộ phận B | API trả 403/404 phù hợp; không lộ dữ liệu |
| `AT-17` | Người thiếu quyền gọi API xuất XLSX | Không xuất/tải được, audit sự kiện tương ứng |
| `AT-18` | Hủy/điều chuyển một nhân sự có lịch sử task | Lịch sử, người đã xử lý và phê duyệt không biến mất |
| `AT-19` | Cố nhập dữ liệu `=...` ở ô kết quả rồi export | Mở Excel không thực thi công thức do người nhập |
| `AT-20` | Xem trên mobile 390px | Các tác vụ chính thao tác được, không che thông tin/CTA |
| `AT-21` | Cán bộ A có 3 đầu việc, cán bộ B có 5 đầu việc cùng một kỳ | Mỗi người thấy đúng danh sách và quyền; không tự lấp đủ 48 đầu việc mẫu |
| `AT-22` | Cán bộ có quyền thêm đầu việc mới không thuộc danh mục mẫu | Lưu được, đúng người/kỳ, lưu lịch sử; không tự thành nhiệm vụ hoặc nghĩa vụ báo cáo |
| `AT-23` | Xuất XLSX theo dữ liệu cá nhân và kỳ | Cột C ghi `Danh mục đầu việc`, chứa đúng các đầu việc liên quan, không tự xuất mọi mục seed |
| `AT-24` | Đầu việc có nghĩa vụ báo cáo/phê duyệt được đổi/xóa tên để né kiểm soát | Backend chặn hoặc yêu cầu quy trình phù hợp, giữ lịch sử, không mất nghĩa vụ đã được giao |

### 18.2. Nghiệm thu kỹ thuật

- Build TypeScript thành công, không lỗi lint nghiêm trọng; migration chạy trên DB mới.
- Test unit cho phân loại trạng thái/kỳ, các quy tắc báo cáo; integration cho CRUD, role/scope.
- E2E Playwright: `tạo kế hoạch → giao task → cập nhật → duyệt → xem báo cáo → xuất XLSX`.
- Kiểm thử permission bằng **API trực tiếp**, không chỉ kiểm tra có ẩn nút.
- Có kiểm thử nhập XLSX mẫu và phát hiện file hỏng/định dạng không hỗ trợ.
- Dashboard ghi rõ thời gian cập nhật, phạm vi và công thức KPI.
- `npm run build`, `npm run test`, `npm run lint` (hoặc các lệnh tương đương) được ghi trong README.
- Không yêu cầu `docker compose` production nếu hạ tầng chưa được duyệt; cung cấp tài liệu kỹ thuật giả định rõ ràng.

### 18.3. Tiêu chí trải nghiệm

- Người dùng lần đầu thấy rõ `Tạo kế hoạch`, `Công việc của tôi`, `Báo cáo`.
- Cán bộ cập nhật được kết quả thường xuyên mà không phải tạo task dư thừa.
- Các thao tác trình/duyệt/trả lại có lời xác nhận và hiển thị người chịu trách nhiệm.
- Với kỳ không có dữ liệu, hệ thống hiển thị trạng thái rỗng/không phát sinh phù hợp, không tự chế số liệu.
- Xuất XLSX phản ánh đúng bộ lọc đang xem và báo khi thiếu quyền hoặc mẫu lỗi.

---

## 19. CÁC VẤN ĐỀ CẦN XÁC NHẬN VỚI HẢI QUAN

### 19.1. Câu hỏi ưu tiên cao, ảnh hưởng chính sách vận hành

| ID | Câu hỏi còn mở | Thiết kế tạm trước khi trả lời |
|---|---|---|
| `TBD-01` | Cơ cấu tổ chức, đội/bộ phận, lãnh đạo và các cấp duyệt chính thức là gì? | Cây động, demo `Bộ phận A/B/C` |
| `TBD-02` | Trong các đầu việc thay đổi theo cá nhân, loại nào bắt buộc báo cáo mỗi ngày/tuần/tháng? | `UNCONFIGURED`, không sinh nghĩa vụ chỉ vì có trong mẫu |
| `TBD-03` | Khi không phát sinh nghiệp vụ có cần xác nhận `Không phát sinh` không? | Rule per activity, để tùy chọn |
| `TBD-04` | Kết quả dự kiến trong file là chỉ tiêu bắt buộc hay gợi ý? | Lưu text gốc; không hard-code field |
| `TBD-05` | Từng nhóm/hoạt động phải có những kết quả thực tế/chỉ tiêu nào? | Form schema versionable |
| `TBD-06` | Kế hoạch tuần ai lập, ai duyệt, ai chốt? Có quyền ủy quyền nào? | Workflow configurable |
| `TBD-07` | Mẫu báo cáo cuối cùng phải giống Excel gốc đến mức nào? | Làm 2 kiểu legacy + detail |
| `TBD-08` | Nguồn số liệu là nhập thủ công hay được tích hợp từ hệ thống khác? | Chỉ nhập tay/giả lập V1 |
| `TBD-09` | Hệ thống được lưu dữ liệu gì? Triển khai trên hạ tầng/mạng nào? | Chỉ demo dữ liệu giả, không production |
| `TBD-10` | Có yêu cầu chốt kỳ, ký xác nhận, lưu trữ và thời hạn xóa không? | Có version/snapshot; chưa ấn định retention |
| `TBD-11` | Ai được thêm/sửa/ngừng áp dụng đầu việc cá nhân; thay đổi sau duyệt cần ai xác nhận? | Phân quyền theo người/bộ phận/trạng thái; không cho bypass nghĩa vụ |

### 19.2. Câu hỏi cải tiến mở rộng

- Một nhiệm vụ có thể nhiều người chủ trì hay phải một chủ trì? **Mặc định đề xuất: một chủ trì, nhiều phối hợp**.
- Kế hoạch tuần tính thứ Hai–Chủ nhật hay khung riêng theo lịch cơ quan?
- Cho phép ghi nhận nhật ký thay người khác không; nếu có thì thẩm quyền/ủy quyền nào?
- Có cần báo cáo quý/năm và đối chiếu kết quả cả năm ngay ở V1 không?
- Có cần thông báo từ email/SMS hoặc mạng nội bộ; hệ thống gửi qua dịch vụ nào được phép?
- Khi chỉnh sửa báo cáo đã xác nhận, có cần duyệt điều chỉnh, giải trình và văn bản đính kèm?
- Cơ quan có hệ thống danh tính/SSO, quy định quản lý người dùng, tiêu chuẩn giao diện và hosting riêng không?
- Thống kê có cần phân biệt nhiệm vụ do lãnh đạo giao và hoạt động thường xuyên để tránh KPI méo?

---

## 20. NGUỒN THAM KHẢO VÀ RANH GIỚI SỬ DỤNG

### 20.1. Nguồn nghiệp vụ

- **Nguồn duy nhất có sẵn để khởi tạo danh mục trong tài liệu này:** file người dùng cung cấp `Kế hoạch công tác.xlsx`, sheet `Biểu Kế Hoạch Tuần`, 09/10/2026. Nội dung được trích tại Phụ lục A.
- Kế hoạch của những bộ phận **khác** chưa được cung cấp; không có căn cứ để tạo nhiệm vụ nghiệp vụ riêng của họ.
- Những giả định trong tài liệu không thay thế chỉ đạo/định mức/văn bản quản lý nội bộ của đơn vị Hải quan.

### 20.2. Nguồn kỹ thuật Stitch/Antigravity của Google

- Codelab chính thức Google `Design-to-Code with Antigravity and Stitch MCP` (cập nhật 22/07/2026): https://codelabs.developers.google.com/design-to-code-with-antigravity-stitch
- Google Stitch updates 19/05/2026: https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-updates/
- Google Stitch Design System / `DESIGN.md` / MCP: https://blog.google/innovation-and-ai/models-and-research/google-labs/stitch-ai-ui-design/
- Google Antigravity IDE docs: https://www.antigravity.google/docs/ide/overview/

> API, xuất mã nguồn, MCP và các tên nút của công cụ có thể thay đổi. Kiểm tra hướng dẫn chính thức tại thời điểm sử dụng.

---

## 21. DECISION LOG (CẬP NHẬT KHI NGHIỆP VỤ ĐƯỢC CHỐT)

| Decision ID | Trạng thái | Nội dung quyết định | Ghi chú |
|---|---|---|---|
| `DEC-001` | AGREED | Xây dựng WebApp riêng cho công tác quản lý kế hoạch/nhiệm vụ Hải quan Tà Lùng | Người đặt hàng, 09/10/2026 |
| `DEC-002` | AGREED | Có quản lý ngày/tuần/tháng, giao việc, tiến độ, kết quả và dashboard | Người đặt hàng |
| `DEC-003` | AGREED | Có cấu hình nghiệp vụ/biểu mẫu/đơn vị/quyền để giảm sửa code | Người đặt hàng |
| `DEC-004` | AGREED | Xem báo cáo trực tuyến và xuất `.xlsx` theo mẫu | Người đặt hàng |
| `DEC-005` | AGREED | Quản lý người dùng, nhân sự, bộ phận và cơ cấu tổ chức | Người đặt hàng |
| `DEC-006` | AGREED | Dự kiến dùng Stitch cho UI và Antigravity cho xây dựng WebApp | Người đặt hàng |
| `DEC-007` | SOURCE | File Excel hiện có 5 nhóm, 48 dòng hoạt động; chưa phải danh mục toàn đơn vị | Kết quả đọc file |
| `DEC-008` | PROPOSED | Hoạt động được phép có 4 chế độ báo cáo + trạng thái chưa cấu hình | Chờ Hải quan xác nhận |
| `DEC-009` | PROPOSED | Modular monolith, Next.js/PostgreSQL, responsive web trước | Chờ ADR/hạ tầng |
| `DEC-010` | SECURITY-GATE | Không dùng dữ liệu thật qua AI/cloud ngoài hạ tầng khi chưa được phép | Phải thẩm định chính thức |
| `DEC-011` | FEEDBACK | Đổi nhãn cột C hiển thị thành **Danh mục đầu việc**; tên Excel gốc chỉ giữ để đối chiếu nguồn | Phía Hải quan phản hồi qua người đặt hàng, 09/10/2026 |
| `DEC-012` | FEEDBACK | Đầu việc biến động theo công việc của từng cá nhân, không phải checklist cố định cho mọi người | Phía Hải quan phản hồi qua người đặt hàng, 09/10/2026 |
| `DEC-013` | AGREED | Tên dự án kỹ thuật/repository chính thức là `talung-cus-work` | Người đặt hàng, 09/10/2026 |

**Hướng dẫn cập nhật:** Khi một `TBD-xx` được giải quyết, ghi quyết định mới, người xác nhận, ngày hiệu lực, tài liệu/căn cứ (nếu có), phiên bản liên quan; cập nhật section nguồn và bài test tương ứng.

---

## PHỤ LỤC A — DANH MỤC 48 HOẠT ĐỘNG TRÍCH TỪ EXCEL GỐC

> Các dòng sau lưu gần nguyên văn cột C8–C12 (cột mới trên WebApp có nhãn **Danh mục đầu việc**) để tạo **seed catalog tham khảo**; chính tả/chữ viết tắt/đầu việc trùng giữ theo bản nguồn. Mã `TTHQ-xx`/`GSHQ-xx`/... là **mã kỹ thuật gợi ý**, không phải mã nghiệp vụ Hải quan ban hành. Đặt `reporting_mode = UNCONFIGURED`, `review_status = NEEDS_REVIEW` mặc định. Không tạo task hay nghĩa vụ báo cáo từ việc import.


### A.1. `TTHQ` — Thực hiện thủ tục hải quan

- **Nguồn:** `Biểu Kế Hoạch Tuần!B8:H8`. **Ưu tiên bản gốc:** `Cao`. **Trạng thái bản gốc:** `Chưa thực hiện`.
- **Người phụ trách bản gốc:** `Bộ phân NV (trưởng/phó nhóm)`. **Phối hợp:** `Doanh nghiệp XNK, Ban Quản lý Cửa khẩu, Trạm BP, Các lực lượng Kiểm dịch`.

- `TTHQ-01` — •Tiếp nhận hồ sơ
- `TTHQ-02` — •C/O
- `TTHQ-03` — •Phúc tập hồ sơ XNK
- `TTHQ-04` — •Rà soát chính sách thuế, mã HS
- `TTHQ-05` — •MGH, Không thu thuế
- `TTHQ-06` — •Báo cáo định kỳ, đột xuất
- `TTHQ-07` — •Tham mưu chính xử lý các vụ việc vi phạm về thủ tục hải quan
- `TTHQ-08` — - Theo dõi, tham mưu, đề xuất thực hiện thủ tục với hàng đưa về bảo quản.
- `TTHQ-09` — - Thực hiện công tác trị giá hải quan (cập nhật, tham vấn, chỉ đạo cấp trên...)
- `TTHQ-10` — - Thực hiện công tác quản lý rủi ro.
- `TTHQ-11` — - Đầu mối cung cấp các số liệu, báo cáo về các cơ sở gia công quản lý trên địa bàn
- `TTHQ-12` — - Tư vấn, hỗ trợ doanh nghiệp thực hiện thủ tục hải quan đối với hàng hóa xuất nhập khẩu.
- `TTHQ-13` — - Thực hiện các báo cáo định kỳ. báo cáo đột xuất liên quan.
- `TTHQ-14` — - Hủy tờ khai đối với các tờ khai chưa thông quan.
- `TTHQ-15` — - Tiếp nhận tờ khai sửa bổ sung đối với các tờ khai thay đổi về mã hàng và thuế
- `TTHQ-16` — - Thực hiện hồi báo đối với các lô hàng KNQ theo quy định.
- `TTHQ-17` — - Quản lý và sử dụng đối với các loại niêm phong hải quan, trang thiết bị chuyên dùng
- `TTHQ-18` — - Hủy tờ khai đối với các tờ khai chưa đã thông quan.
- `TTHQ-19` — - Tiếp nhận tờ khai sửa bổ sung đối với các tờ khai không thay đổi về mã hàng và thuế
- `TTHQ-20` — •SHTT
- `TTHQ-21` — •DVCTT
- `TTHQ-22` — •Vướng mắc, kiến nghị và đề xuất

**Kết quả dự kiến G8 (nguồn gốc, chưa xác nhận biểu mẫu):**

> • Đã giải quyết: [Điền số lượng] tờ khai
> • Phân luồng: Luồng Xanh ([...]), Luồng Vàng ([...]), Luồng Đỏ ([...])


### A.2. `GSHQ` — Kiểm tra giám sát hải quan

- **Nguồn:** `Biểu Kế Hoạch Tuần!B9:H9`. **Ưu tiên bản gốc:** `Cao`. **Trạng thái bản gốc:** `Chưa thực hiện`.
- **Người phụ trách bản gốc:** `Bộ phân NV (trưởng/phó nhóm)`. **Phối hợp:** `Doanh nghiệp XNK, Ban Quản lý Cửa khẩu, Trạm BP, Các lực lượng Kiểm dịch`.

- `GSHQ-01` — •Kiểm tra hồ sơ XNK (Getin/getout, Hệ thống QL PTVT XNC, GPS, BBBG điện tử, CKS …)
- `GSHQ-02` — •Theo dõi hàng hoá vận chuyển đi/đến (BIA/BOA)
- `GSHQ-03` — •Theo dõi trạng thái seal GPS
- `GSHQ-04` — •Giám sát tại kho, bãi địa điểm tập kết
- `GSHQ-05` — •Theo dõi quản lý trang thiết bị kiểm tra giám sát
- `GSHQ-06` — •Quản lý hàng hoá XNK tồn tại địa điểm (KNQ/địa điểm tập kết)
- `GSHQ-07` — •Kiểm tra thực tế hàng hóa
- `GSHQ-08` — •Kiểm tra hành khách XNC và CDBG, Soi chiếu hành lý
- `GSHQ-09` — - Thực hiện kiểm tra, kiểm soát phương tiện vận chuyển hàng hóa qua lại biên giới
- `GSHQ-10` — - Thông quan đối với tờ khai PTVT tạm xuất
- `GSHQ-11` — - Tiếp nhận và thông quan đối với tờ khai PTVT tái nhập
- `GSHQ-12` — - Xác nhận bản kê 119 trên hệ thống.
- `GSHQ-13` — - Tham mưu, đề xuất và báo cáo kế hoạch về công tác thu ngân sách.
- `GSHQ-14` — - Thực hiện và báo cáo hàng ngày về công tác thu ngân sách
- `GSHQ-15` — - Thu phí tờ khai, tờ khai phương tiện, Hàng quá cảnh.
- `GSHQ-16` — - Thực hiện công tác Hoàn thuế, không thu thuế.
- `GSHQ-17` — - Thực hiện kiểm hóa đối với các lô hàng nhập trả, xuất trả, buộc tái xuất.
- `GSHQ-18` — •Tham mưu chính xử lý các vụ việc vi phạm về kiểm tra, giám sát, kiểm soát hải quan
- `GSHQ-19` — •Nắm tình hình nội, ngoại biên
- `GSHQ-20` — •Vướng mắc, kiến nghị và đề xuất

**Kết quả dự kiến G9 (nguồn gốc, chưa xác nhận biểu mẫu):**

> • Mã HS & Thuế: [Điền kết quả xử lý/vướng mắc]
> • Xuất xứ (C/O): [Điền kết quả kiểm tra C/O]
> • Trị giá tính thuế: [Điền kết quả tham vấn/xác định trị giá]


### A.3. `TON_DONG` — Xử lý nghiệp vụ phức tạp & tồn đọng

- **Nguồn:** `Biểu Kế Hoạch Tuần!B10:H10`. **Ưu tiên bản gốc:** `Trung bình`. **Trạng thái bản gốc:** `Chưa thực hiện`.
- **Người phụ trách bản gốc:** `Bộ phân NV (trưởng/phó nhóm)`. **Phối hợp:** `Doanh nghiệp XNK, Ban Quản lý Cửa khẩu, Trạm BP, Các lực lượng Kiểm dịch`.

- `TON_DONG-01` — • Tờ khai, hồ sơ tham vấn giá, Mã HS, C/O vướng mắc.
- `TON_DONG-02` — • Tiến độ xử lý hồ sơ tồn đọng từ ngày/tuần trước.

**Kết quả dự kiến G10 (nguồn gốc, chưa xác nhận biểu mẫu):**

> • Hồ sơ tồn đọng: [Điền số lượng & lý do tồn đọng nếu có]
> • Biện pháp xử lý: [Điền hướng giải quyết tiếp theo]


### A.4. `DANH_GIA_HQ` — Đánh giá hiệu quả và những việc đã triển khai

- **Nguồn:** `Biểu Kế Hoạch Tuần!B11:H11`. **Ưu tiên bản gốc:** `Trung bình`. **Trạng thái bản gốc:** `Chưa thực hiện`.
- **Người phụ trách bản gốc:** `Bộ phân NV (trưởng/phó nhóm)`. **Phối hợp:** `Các bộ phận nghiệp vụ, Doanh nghiệp XNK`.

- `DANH_GIA_HQ-01` — • Rà soát chỉ tiêu thông quan và thời gian xử lý trong ngày/ trong tuần
- `DANH_GIA_HQ-02` — • Trao đổi, giải đáp khó khăn phát sinh cho doanh nghiệp.

**Kết quả dự kiến G11 (nguồn gốc, chưa xác nhận biểu mẫu):**

> • Hồ sơ tồn đọng: [Điền số lượng & lý do tồn đọng nếu có]
> • Biện pháp xử lý: [Điền hướng giải quyết tiếp theo]


### A.5. `DANH_GIA_NGAY_TUAN` — Đánh giá tình hình thực hiện nhiệm vụ trong ngày/tuần

- **Nguồn:** `Biểu Kế Hoạch Tuần!B12:H12`. **Ưu tiên bản gốc:** `Cao`. **Trạng thái bản gốc:** `Chưa thực hiện`.
- **Người phụ trách bản gốc:** `Bộ phân NV (trưởng/phó nhóm)`. **Phối hợp:** `Các bộ phận nghiệp vụ, Doanh nghiệp XNK`.

- `DANH_GIA_NGAY_TUAN-01` — • Giải quyết thủ tục phát sinh theo chức trách nhiệm vụ được giao
- `DANH_GIA_NGAY_TUAN-02` — • Kiểm soát khu vực thực hiện nhiệm vụ chuyên môn đảm bảo đúng quy định

**Kết quả dự kiến G12 (nguồn gốc, chưa xác nhận biểu mẫu):**

> • Hồ sơ tồn đọng: [Điền số lượng & lý do tồn đọng nếu có]
> • Biện pháp xử lý: [Điền hướng giải quyết tiếp theo]

---

## PHỤ LỤC B — CÁC VẤN ĐỀ CẦN LÀM SẠCH TRONG DANH MỤC NGUỒN

1. `TTHQ-06` và `TTHQ-13`: có nội dung gần trùng về báo cáo định kỳ/đột xuất, **chờ xác nhận** có gộp hay không.
2. `TTHQ-14`, `TTHQ-18`: đều liên quan hủy tờ khai nhưng khác điều kiện trạng thái; **không tự gộp**, giữ nguyên câu chữ gốc để nghiệp vụ rà soát.
3. `TTHQ-15`, `TTHQ-19`: cùng nhóm tiếp nhận sửa bổ sung nhưng khác tác động đến mã hàng/thuế; cần giữ riêng cho đến khi có kết luận.
4. Ô G9 (nhóm kiểm tra, giám sát) đang ghi chỉ tiêu mã HS/thuế/C/O/trị giá; cần xác minh chứ không tự chuyển thành biểu mẫu.
5. Ô G10–G12 cùng mẫu 'Hồ sơ tồn đọng' và 'Biện pháp xử lý'; cần xác nhận kết quả riêng cho từng nhóm.
6. Một số tên viết tắt/chính tả gốc như `KNQ`, `CDBG`, `MGH`, `BIA/BOA`, `Getin/getout`, `Bộ phân` phải được bộ phận nghiệp vụ xác nhận trước khi chuẩn hóa hiển thị.
7. Khi nhập danh mục, lưu đồng thời `display_name` đã được duyệt **và** `raw_text` để không mất dữ liệu nguồn.

---

## PHỤ LỤC C — CHECKLIST BÀN GIAO ĐẦU TIÊN CHO DEV AGENT

- [ ] Đã đọc `PROJECT_CONTEXT.md` và tóm tắt đúng phạm vi.
- [ ] Có `IMPLEMENTATION_PLAN.md` và danh sách `[TBD]` cần xác nhận.
- [ ] Có 7 prototype Stitch hoặc wireframe tương đương đã đối chiếu.
- [ ] Có quyết định stack + cấu trúc module + permission service.
- [ ] Có DB schema/migration cho tổ chức, người, tài khoản, danh mục, kế hoạch, task, routine, báo cáo.
- [ ] Có danh mục seed 5 nhóm/48 hoạt động ở trạng thái chờ rà soát, không ép nhập báo cáo.
- [ ] Có **Danh mục đầu việc** thực tế theo cá nhân/kỳ, nhập linh hoạt và đúng quyền; UI và XLSX cột C dùng nhãn mới.
- [ ] Có test phân biệt `NOT_OCCURRED`, `NOT_SUBMITTED`, `NOT_STARTED`, `OVERDUE`.
- [ ] Có test chống đếm trùng task liên kết tháng/tuần.
- [ ] Có test API từ chối người không có quyền.
- [ ] Có một luồng E2E và một XLSX mở được bằng Excel.
- [ ] Không có hồ sơ thật, mật khẩu mặc định công khai, API key hay dữ liệu nhạy cảm trong repo.
- [ ] Có README và hướng dẫn chạy demo/test.
- [ ] Gate sản xuất vẫn ở trạng thái **chưa được phê duyệt** cho đến khi có hồ sơ hợp lệ.

**KẾT THÚC PROJECT CONTEXT v1.1.1 — 09/10/2026.**

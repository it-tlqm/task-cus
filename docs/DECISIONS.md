# ARCHITECTURE DECISION RECORDS (ADR)
## HỆ THỐNG QUẢN LÝ KẾ HOẠCH & ĐIỀU HÀNH CÔNG VIỆC — HẢI QUAN TÀ LÙNG (`talung-cus-work`)

Tài liệu này ghi lại các quyết định kiến trúc kỹ thuật quan trọng của dự án, lý do lựa chọn và hệ quả.

---

### ADR-001: Kiến trúc Modular Monolith trên nền Next.js 15 và PostgreSQL 16
- **Trạng thái:** ACCEPTED
- **Ngày:** 09/10/2026
- **Bối cảnh:** Hệ thống phục vụ quản lý kế hoạch nội bộ của cơ quan Hải quan với đội ngũ phát triển tinh gọn, yêu cầu bảo mật cao, triển khai mạng nội bộ (on-premise / private infrastructure).
- **Quyết định:** Áp dụng kiến trúc **Modular Monolith** sử dụng **Next.js 15 (App Router)**, **TypeScript**, **PostgreSQL 16** và **Prisma ORM**. Phân chia các domain modules ranh giới rõ ràng (`org-personnel`, `identity-access`, `planning`, `tasks`, `routine`, `reporting`).
- **Hệ quả:**
  - Tối ưu hóa chi phí vận hành và triển khai; không cần cụm hạ tầng microservices phức tạp.
  - Type-safety toàn diện từ cơ sở dữ liệu đến giao diện người dùng.
  - Dễ dàng kiểm thử, bảo trì và mở rộng trong tương lai.

---

### ADR-002: Quản lý Biểu mẫu Động bằng Schema JSONB và Phiên bản Bất biến
- **Trạng thái:** ACCEPTED
- **Ngày:** 09/10/2026
- **Bối cảnh:** Các biểu mẫu kết quả của từng hoạt động nghiệp vụ có thể thay đổi theo thời gian hoặc theo chỉ đạo cấp trên. Việc sửa mã nguồn React mỗi khi có chỉ tiêu mới là không khả thi.
- **Quyết định:** Xây dựng **Dynamic Form Engine** lưu định nghĩa trường trong bảng `form_template_versions` dưới dạng JSON Schema. Khi quản trị viên phát hành phiên bản mới, phiên bản cũ chuyển sang trạng thái bất biến (`IMMUTABLE`). Báo cáo quá khứ giữ nguyên liên kết tới phiên bản cũ. Dữ liệu nộp được kiểm tra hợp lệ bằng server-side Zod validator tự động sinh.
- **Hệ quả:**
  - Nghiệp vụ thay đổi biểu mẫu linh hoạt qua giao diện mà không phải sửa code.
  - Đảm bảo tính toàn vẹn lịch sử, báo cáo cũ không bị méo mó khi cấu hình mới ra đời.

---

### ADR-003: Định danh Nhiệm vụ Duy nhất (Distinct Task ID) và Chống Đếm Trùng KPI
- **Trạng thái:** ACCEPTED
- **Ngày:** 09/10/2026
- **Bối cảnh:** Một công việc từ kế hoạch tháng thường được đưa xuống kế hoạch tuần và ngày để thực hiện. Nếu sao chép (clone) bản ghi nhiệm vụ, dashboard sẽ đếm thành nhiều công việc khác nhau, làm sai lệch báo cáo khối lượng và tỷ lệ hoàn thành.
- **Quyết định:** Mỗi nhiệm vụ chỉ tồn tại **01 bản ghi duy nhất** trong bảng `tasks` với `id` cố định. Kế hoạch tháng, tuần, ngày liên kết với nhiệm vụ thông qua bảng trung gian `plan_task_links`. Mọi truy vấn KPI và thống kê trên Dashboard đều sử dụng `COUNT(DISTINCT task.id)`.
- **Hệ quả:**
  - Loại bỏ hoàn toàn lỗi đếm trùng công việc.
  - Tiến độ cập nhật ở một nơi được phản ánh đồng bộ trên tất cả các góc nhìn kế hoạch liên quan.

---

### ADR-004: Danh mục Đầu việc Cá nhân Biến Động (Personal Work Items) Thay Vì Checklist Cố Định
- **Trạng thái:** ACCEPTED
- **Ngày:** 09/10/2026
- **Bối cảnh:** Phản hồi từ phía Hải quan xác nhận: Cột C đổi tên thành **"Danh mục đầu việc"** và danh mục này thay đổi tùy theo công việc của từng cá nhân và từng kỳ; 48 dòng trong Excel gốc không phải là checklist bắt buộc cho mọi cán bộ.
- **Quyết định:** Tách bạch giữa danh mục mẫu tham khảo (`activity_templates`) và danh mục đầu việc thực tế của từng người theo kỳ (`personal_work_items`). Cán bộ có thể chọn từ mẫu (template) hoặc tự thêm đầu việc mới ngoài mẫu. Đầu việc tự tạo không mặc định sinh nghĩa vụ báo cáo bắt buộc trừ khi được phân công cụ thể.
- **Hệ quả:**
  - Hệ thống phản ánh sát thực tế công việc hàng ngày của cán bộ công chức Hải quan.
  - Tránh gánh nặng hành chính ảo khi ép mọi người phải thao tác trên 48 mục mẫu.

---

### ADR-005: Tạo Báo Cáo Excel (.xlsx) Hai Mẫu Độc Lập bằng ExcelJS và Chống Formula Injection
- **Trạng thái:** ACCEPTED
- **Ngày:** 09/10/2026
- **Bối cảnh:** Người dùng cần giữ bố cục quen thuộc của file Excel cũ để báo cáo lên cấp trên, đồng thời cần một mẫu chi tiết để tra cứu dữ liệu sâu. File Excel tải về phải an toàn, chống mã độc bảng tính.
- **Quyết định:** Sử dụng thư viện **ExcelJS** trực tiếp trong môi trường Node.js. Cung cấp 2 mẫu xuất:
  1. `Mẫu A (Legacy)`: Tái hiện chuẩn xác bố cục A1:H1, 8 cột và 5 nhóm tổng hợp của Excel gốc; cột C mang tiêu đề "Danh mục đầu việc" với các dòng việc thực tế dạng bullet.
  2. `Mẫu B (Detailed)`: Bảng dữ liệu phẳng chi tiết từng nhiệm vụ và hoạt động có phát sinh.
  Tất cả dữ liệu người dùng nhập nếu bắt đầu bằng `=`, `+`, `-`, `@` sẽ được tiền xử lý an toàn (Formula Sanitizer) trước khi ghi vào ô.
- **Hệ quả:**
  - Đáp ứng 100% nhu cầu in ấn / nộp báo cáo truyền thống lẫn phân tích số liệu hiện đại.
  - Bảo mật tuyệt đối trước các nguy cơ tấn công chèn mã lệnh vào bảng tính.

---

### ADR-006: Chốt YC-21 theo Phương án B — tách bạch Giao ban số liệu với KQ tháng
- **Trạng thái:** ACCEPTED
- **Ngày:** 17/10/2026
- **Bối cảnh:** YC-21 có hai cách hiểu: (a) chuyển "KQ tháng" vào nhóm Giao ban; (b) giữ KQ tháng nguyên chỗ, Giao ban chỉ quản lý số liệu nghiệp vụ + báo cáo tuần.
- **Quyết định:** Chọn **(b)**. Không đụng dữ liệu, API, chức năng KQ tháng. Nhóm menu Giao ban giữ bố cục bổ sung hiện tại (Số liệu / Nhập số liệu / Báo cáo Word / Cấu hình); chuẩn hóa Desktop/Mobile chỉ được làm theo hướng bổ sung, không mất chức năng.
- **Hệ quả:** Không cần thay đổi code điều hướng; có thể điều chỉnh khi đơn vị sử dụng xác nhận khác.

---

### ADR-007: Không tự đặt công thức chấm điểm KPI (mẫu 2C/2D/2E)
- **Trạng thái:** ACCEPTED
- **Ngày:** 17/10/2026
- **Bối cảnh:** Ba mẫu 2C (báo cáo kết quả, có đếm nhiệm vụ), 2D (điểm + xếp loại cá nhân), 2E (tỷ lệ hoàn thành chỉ tiêu) khác bản chất nhưng dễ bị gọi chung là "KPI" và gộp công thức.
- **Quyết định:** Lập bảng ánh xạ công thức (`docs/KPI_2C_2D_2E_ANH_XA_CONG_THUC.md`) để đơn vị xác nhận trước. Chỉ triển khai tính điểm chính thức khi có công thức thành phần (02A/02B) + ngưỡng xếp loại được duyệt. Điểm tính thử hiện có (KQ tháng) giữ nguyên nhãn "tham khảo — chưa chính thức", không dùng để xếp loại/khóa số.
- **Hệ quả:** Bước này không phát sinh code tính điểm; chờ hồ sơ 02A/02B + xác nhận.

---

### ADR-008: Mốc lũy kế & chỉ tiêu giao — chỉ mốc CONFIRMED được tính; không seed số liệu chính thức
- **Trạng thái:** ACCEPTED
- **Ngày:** 17/10/2026
- **Bối cảnh:** Số liệu trong file Word/ảnh cũ (mốc hết Tuần 41 – 11/10/2026) là căn cứ đối chiếu, không được mặc nhiên coi là số liệu chính thức.
- **Quyết định:** Mốc tạo ở trạng thái Đề xuất (PROPOSED) → lãnh đạo/quản trị "Xác nhận mốc" → CONFIRMED; chỉ CONFIRMED được dùng tính lũy kế; lưu người đề xuất/người xác nhận/thời điểm + audit. Chỉ tiêu BTC, UBND tỉnh, KH tháng cấu hình theo kỳ hiệu lực (YEAR/QUARTER/MONTH). Không cộng lặp ngày đã nằm trong mốc. Không seed bất kỳ số liệu chính thức nào vào DB.
- **Hệ quả:** Ngày bắt đầu nhập liệu thật và mốc đầu tiên do Hải quan quyết định; hệ thống đã sẵn sàng vận hành.

---

### ADR-009: Phân loại mức xác nhận cho 49 chỉ tiêu — duyệt theo bậc, không bật đồng loạt
- **Trạng thái:** ACCEPTED
- **Ngày:** 17/10/2026
- **Bối cảnh:** 49/49 chỉ tiêu đang tắt "Cần kiểm tra"; không đồng ý coi mọi giá trị vừa nhập là dữ liệu chính thức.
- **Quyết định:** Đề xuất 4 mức A (12 — tiền/số dư trọng yếu), B (16 — kim ngạch & số liệu trọng yếu), C (18 — nhập là ghi nhận), D (3 — dẫn xuất tự tính) tại `docs/PHAN_LOAI_XAC_NHAN_49_CHI_TIEU.md`; phân biệt rõ **Đã nhập / Đã xác nhận / Đã chốt báo cáo**. Triển khai bằng cấu hình UI sau khi duyệt, thứ tự: mức A trước.
- **Hệ quả:** Chưa thay đổi bất kỳ cấu hình chỉ tiêu nào.

# TÀI LIỆU BÀN GIAO & HƯỚNG DẪN KIỂM THỬ NGHIỆM THU (UAT)
## HỆ THỐNG QUẢN LÝ KẾ HOẠCH & ĐIỀU HÀNH TÁC NGHIỆP HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG
**Dự án:** `talung-cus-work`  
**Google Stitch Project:** `1706229019122664463`  
**Ngày bàn giao:** 10/10/2026  
**Trạng thái hệ thống:** ĐÃ SẴN SÀNG KIỂM THỬ NGHIỆM THU (100% BUILD PASS, 24/24 AT CRITERIA PASS)

---

## I. THÔNG TIN KẾT NỐI HỆ THỐNG

| Thành phần | Thông số / Địa chỉ truy cập |
| :--- | :--- |
| **Địa chỉ WebApp** | `http://localhost:3000` (hoặc `http://localhost:3000/login`) |
| **Cơ sở dữ liệu** | PostgreSQL (`talung_cus_work`), kết nối qua Prisma ORM |
| **Môi trường chạy** | Node.js / Next.js Production Server (Port 3000) |
| **Khuyến nghị trình duyệt** | Google Chrome, Microsoft Edge, Safari (Hỗ trợ tốt Desktop & Mobile DevTools) |

---

## II. DANH SÁCH TÀI KHOẢN ĐĂNG NHẬP & PHÂN QUYỀN

Mật khẩu chung cho tất cả tài khoản thử nghiệm: **`demo123`** (Đã tích hợp sẵn 4 nút bấm chọn nhanh 1-chạm tại trang Login)

| STT | Tên đăng nhập | Họ và tên | Chức danh & Đơn vị | Vai trò (Role) & Phạm vi (Scope) | Chức năng nghiệp vụ chính |
| :---: | :--- | :--- | :--- | :--- | :--- |
| **1** | **`lanhdao`** | Đ/c Hoàng Văn Định | Chi cục trưởng<br>Ban Lãnh đạo Chi cục | `UNIT_LEADER`<br>Toàn đơn vị (`ORGANIZATION`) | - Xem Dashboard điều hành toàn diện<br>- Phê duyệt kế hoạch công tác toàn chi cục<br>- Xuất file Excel Mẫu A & Mẫu B<br>- Chốt kỳ số liệu, sinh mã băm SHA-256 |
| **2** | **`truongnhom_a`** | Đ/c Nguyễn Văn An | Trưởng bộ phận<br>BP Thủ tục Hải quan A | `DEPARTMENT_LEADER`<br>Bộ phận A (`DEPARTMENT`) | - Lập và trình duyệt kế hoạch Bộ phận A<br>- Giao việc, chỉ định cán bộ chủ trì/phối hợp<br>- Xét duyệt gia hạn hạn chót nhiệm vụ<br>- Xuất báo cáo thuộc Bộ phận A |
| **3** | **`canbo_a`** | Đ/c Trần Thị Mai | Cán bộ công chức<br>BP Thủ tục Hải quan A | `STAFF`<br>Bộ phận A (`DEPARTMENT`) | - Tác nghiệp tại trang "Việc của tôi"<br>- Khai báo đầu việc cá nhân biến động (3-6 việc)<br>- Ghi nhật ký thường xuyên & **1-chạm Không phát sinh**<br>- Bị chặn tải Excel (HTTP 403), chặn sửa việc Đội B |
| **4** | **`canbo_b`** | Đ/c Lê Hoàng Quân | Cán bộ công chức<br>BP Giám sát Hải quan B | `STAFF`<br>Bộ phận B (`DEPARTMENT`) | - Thực hiện nhiệm vụ kiểm tra giám sát Đội B<br>- Dùng để kiểm tra phân tách dữ liệu chống IDOR |
| **5** | **`admin`** | Đ/c Đặng Quốc Bảo | Quản trị viên hệ thống | `SYSTEM_ADMIN`<br>Hệ thống kỹ thuật | - Quản trị cơ cấu tổ chức & danh mục<br>- Trình thiết kế biểu mẫu động (Dynamic Forms v1->v2)<br>- Tra cứu lịch sử kiểm toán bất biến (Audit Trail)<br>- Bị Scope Guard chặn truy cập việc nghiệp vụ |

---

## III. DANH MỤC 16 MÀN HÌNH CHUẨN GOOGLE STITCH & TRANG HỆ THỐNG

### 1. Phân hệ Desktop (Màn hình máy tính)
| STT | Screen ID (Stitch) | Tên màn hình | Đường dẫn URL | Mô tả & Thành phần kiểm tra |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `089086aec3864b019c5af41b1319cf82` | Đăng nhập Desktop | `/login` | Bố cục 2 cột, form đăng nhập, 4 nút chọn nhanh tài khoản, ghi nhớ phiên |
| 2 | `12417506320912864407` | Dashboard KPI Điều hành | `/dashboard` | Thẻ chỉ số KPI, tỷ lệ hoàn thành, biểu đồ tiến độ 5 nhóm nghiệp vụ |
| 3 | `2443cdf63e214979b5a74c40779511ba` | Kế hoạch công tác | `/plans` | Danh sách kế hoạch tuần/tháng, trạng thái DRAFT/SUBMITTED/APPROVED |
| 4 | `25d2bbef1eed4a3bb5aef7fcee376979` | Danh sách nhiệm vụ | `/tasks` | Bộ lọc nghiệp vụ, tìm kiếm, phát lệnh giao việc, trạng thái tiến độ |
| 5 | `26cca4106e7047f0af538a76d53f9338` | Chi tiết nhiệm vụ | `/tasks/[id]` | Thông tin chi tiết, nhật ký cập nhật, đề xuất gia hạn, người phối hợp |
| 6 | `453d42cded034a6b807f9d88dcb5548d` | Việc của tôi | `/my-work` | Danh mục đầu việc cá nhân, cập nhật tiến độ tức thời, nộp nghiệm thu |
| 7 | `6835e08c233044cebdd3c966fef7fb1e` | Báo cáo & Thống kê | `/reports` | Xuất Excel Mẫu A (8 cột gốc), Mẫu B (13 cột chi tiết), Chốt kỳ SHA-256 |
| 8 | `d8279bd2bf0c4198b665f567223d0bf4` | Phê duyệt điều hành | `/approvals` | Nạp dữ liệu PostgreSQL: Nghiệm thu hoàn thành, Duyệt kế hoạch, Cho phép lùi hạn |

### 2. Phân hệ Mobile (Giao diện di động - Kiểm tra tại F12 DevTools hoặc thiết bị di động)
| STT | Screen ID (Stitch) | Tên màn hình | Đường dẫn URL | Mô tả & Thành phần kiểm tra |
| :---: | :--- | :--- | :--- | :--- |
| 8 | `6c85595ba47745ae9075391d1e280f87` | Đăng nhập Mobile | `/login` (Mobile) | Giao diện di động gọn gàng, bàn phím số/chữ tối ưu touch |
| 9 | `6de0e0a4a10f429b9af634b4709465ea` | Mobile Dashboard | `/dashboard` | Thẻ KPI cuộn dọc, Bottom Navigation bar, thông báo nổi |
| 10 | `76ee03a9efeb4a9a8c27ab0ddcaf0283` | Mobile Việc của tôi | `/my-work` | Danh sách nhiệm vụ chạm vuốt mượt mà, cập nhật 1 chạm |
| 11 | `7b483d3d95784cad9377ed26e2e6fd08` | Mobile Chi tiết việc | `/tasks/[id]` | Thẻ tiến độ, nút đề xuất lùi hạn, lịch sử hoạt động dạng timeline |
| 12 | `a1afd1c794c6454a8e161b43f25f4024` | Mobile Kế hoạch | `/plans` | Thẻ kế hoạch rút gọn, bộ lọc tuần/tháng linh hoạt |
| 13 | `a4e5421378a643b8a65a7ec5600b17aa` | Mobile Danh sách việc | `/tasks` | Danh sách dạng thẻ card tối ưu màn hình cảm ứng |
| 14 | `a82b540bccfa44f18a4613e415e5efa4` | Nhật ký công tác | `/routine` | Ghi nhận công việc định kỳ, **Nút 1-chạm "Không phát sinh"** |
| 15 | `cf3acf4ac7ce43edbb7642ce7bf521a9` | Thông báo & Cảnh báo | `/notifications` | Cảnh báo hạn chót khẩn cấp, nhắc việc định kỳ, đếm ngược |
| 16 | `d8279bd2bf0c...` / `e60360...` | Mobile Phê duyệt | `/approvals` | Trình duyệt và trả lại kế hoạch/gia hạn kèm lý do chỉ đạo |

### 3. Phân hệ Quản trị & Mở rộng (Milestone 4)
| STT | Phân hệ | Đường dẫn URL | Mô tả chức năng |
| :---: | :--- | :--- | :--- |
| 17 | Quản trị tổ chức | `/admin/organization` | Sơ đồ cây 6 phòng ban đơn vị, lịch sử bổ nhiệm & phân công |
| 18 | Biểu mẫu động | `/admin/forms` | Trình thiết kế biểu mẫu động (Dynamic Form Builder), phát hành v1 $\rightarrow$ v2 bất biến |
| 19 | Kiểm toán an ninh | `/admin/audit` | Tra cứu vết kiểm toán bất biến (Audit Trail) từ PostgreSQL |
| 20 | Cấu hình hệ thống | `/admin/system` | Tham số cấu hình vận hành, danh mục nhóm nghiệp vụ |

---

## IV. KỊCH BẢN KIỂM THỬ TỪNG BƯỚC CHO NGƯỜI DÙNG (UAT TEST STEPS)

### KỊCH BẢN 1: LÃNH ĐẠO ĐƠN VỊ ĐIỀU HÀNH & XUẤT BÁO CÁO EXCEL
1. **Đăng nhập:** Mở trình duyệt vào `http://localhost:3000/login`, nhập `lanhdao` / `demo123`.
2. **Kiểm tra Dashboard:** Hệ thống tự động chuyển vào `/dashboard`. Kiểm tra 4 thẻ KPI tổng quan (Tổng nhiệm vụ, Tỷ lệ hoàn thành, Đúng hạn, Chậm tiến độ).
3. **Kiểm tra Xuất Excel:**
   - Vào menu **Báo cáo & Thống kê** (`/reports`).
   - Nhấn nút **"Xuất Kế hoạch Tuần (Mẫu A)"**: Trình duyệt sẽ tải về file `KeHoachTuan_MauA_...xlsx`. Mở file trên Microsoft Excel: Kiểm tra đúng tiêu chuẩn văn bản nhà nước, khối tiêu đề "CỤC HẢI QUAN TỈNH CAO BẰNG", bảng 8 cột A1:H1, 5 nhóm nghiệp vụ.
   - Nhấn nút **"Xuất Chi tiết Đầu việc (Mẫu B)"**: Tải về file `ChiTietDauViec_MauB_...xlsx` gồm 13 cột phân tích chi tiết.
4. **Kiểm tra Chốt kỳ số liệu (Snapshot SHA-256):**
   - Tại trang `/reports`, cuộn xuống mục "Khóa kỳ & Tạo Snapshot".
   - Nhấn nút **"Chốt kỳ số liệu"**. Hệ thống khóa kỳ thành công (`isLocked=true`) và hiển thị mã băm bảo mật SHA-256 bất biến (ví dụ `SHA256:838348a3...`).

---

### KỊCH BẢN 2: TRƯỞNG BỘ PHẬN ĐIỀU HÀNH & GIAO VIỆC
1. **Đăng nhập:** Đăng xuất hoặc mở tab ẩn danh mới, đăng nhập tài khoản `truongnhom_a` / `demo123`.
2. **Kiểm tra Kế hoạch:** Vào `/plans`, xem kế hoạch công tác của Đội Nghiệp vụ A.
3. **Phân công & Phối hợp:** Vào `/tasks`, chọn 1 nhiệm vụ. Xem danh sách người chủ trì và các cán bộ phối hợp (multi-assignee).
4. **Quản lý lùi hạn chót:** Nếu cán bộ gửi yêu cầu lùi hạn, Trưởng bộ phận vào mục duyệt hạn: Hệ thống bảo toàn nguyên vẹn `originalDeadline` (hạn gốc), chỉ gia hạn ngày kết thúc thực tế kèm ghi chú phê duyệt.

---

### KỊCH BẢN 3: CÁN BỘ CÔNG CHỨC TÁC NGHIỆP & 1-CHẠM KHÔNG PHÁT SINH
1. **Đăng nhập:** Đăng nhập tài khoản `canbo_a` / `demo123`.
2. **Quản lý Việc của tôi:**
   - Vào `/my-work`. Cán bộ thấy danh sách 3 đến 6 đầu việc thực tế trong tuần (không bị ép buộc checklist tĩnh 48 dòng).
   - Thử kéo thanh tiến độ hoặc cập nhật tình trạng công việc lên 100%. Nhiệm vụ chuyển trạng thái `WAITING_REVIEW` (Chờ nghiệm thu).
3. **Nhật ký công tác & 1-chạm Không phát sinh:**
   - Vào trang **Nhật ký công tác** (`/routine`).
   - Tìm mục hoạt động thường xuyên (ví dụ: *Kiểm tra hàng hóa luồng đỏ*).
   - Nhấn nút **"Không phát sinh" (1-chạm)**: Bản ghi được lưu ngay với trạng thái `NOT_OCCURRED`, không ép cán bộ phải nộp số liệu giả và không tính là vi phạm hay hạ tỷ lệ hoàn thành.
4. **Kiểm tra Hộp thư Cảnh báo:**
   - Vào `/notifications`. Cán bộ thấy thông báo việc khẩn cấp sắp đến hạn kèm thẻ màu đỏ cam và thời gian đếm ngược.

---

### KỊCH BẢN 4: KIỂM THỬ AN NINH PHÂN QUYỀN (ANTI-IDOR & BẢO VỆ DỮ LIỆU)
1. **Thử nghiệm Cán bộ không có quyền xuất file:**
   - Khi đang đăng nhập bằng `canbo_a`, thử truy cập trực tiếp đường dẫn tải Excel: `http://localhost:3000/api/reports/export?template=legacy`.
   - **Kết quả kỳ vọng:** Hệ thống trả về lỗi **HTTP 403 Forbidden** (*"Tài khoản không có quyền xuất báo cáo"*).
2. **Thử nghiệm Truy cập chéo bộ phận (Scope Guard Anti-IDOR):**
   - Cán bộ Đội A không thể sửa hay xem nhiệm vụ của Đội B. Mọi hành vi can thiệp chéo đều bị chặn lại và hệ thống tự động ghi nhật ký `IDOR_ATTEMPT_BLOCKED` vào cơ sở dữ liệu.
3. **Thử nghiệm Quản trị viên kỹ thuật:**
   - Đăng nhập `admin` / `demo123`.
   - Vào `/admin/audit` để xem toàn bộ lịch sử kiểm toán bảo mật.
   - Khi Admin cố truy cập API nhiệm vụ nghiệp vụ (`/api/tasks`), hệ thống trả về HTTP 403 Forbidden để bảo vệ bí mật công tác nghiệp vụ.

---

### KỊCH BẢN 5: QUẢN TRỊ VIÊN THIẾT KẾ BIỂU MẪU ĐỘNG (DYNAMIC FORM BUILDER)
1. **Đăng nhập:** Đăng nhập `admin` / `demo123`.
2. **Mở trình thiết kế:** Vào `/admin/forms`.
3. **Tạo & Phát hành phiên bản mới:**
   - Thêm trường dữ liệu (ví dụ: *Biển số xe*, *Số container*, *Tình trạng seal*).
   - Xem trước giao diện hiển thị ngay lập tức (Live Preview).
   - Nhấn **"Phát hành phiên bản mới"**: Hệ thống tạo bản ghi phiên bản mới (v1 $\rightarrow$ v2) trong PostgreSQL, tự động đánh dấu phiên bản cũ là `SUPERSEDED` mà không xóa hay làm xáo trộn dữ liệu lịch sử đã nộp.

---

## V. KẾT QUẢ KIỂM THỬ KỸ THUẬT TỰ ĐỘNG (24/24 TIÊU CHÍ PASS)

Toàn bộ 24 tiêu chí chấp nhận đã được kiểm tra nghiêm ngặt bằng kịch bản tự động `scripts/run-full-acceptance-suite.ts`:

```
================================================================================
       TALUNG-CUS-WORK — TOÀN BỘ 24 TIÊU CHÍ NGHIỆM THU (AT-01 -> AT-24)        
================================================================================

PHẦN 1: TỔ CHỨC, NHÂN SỰ & DANH MỤC MẪU (AT-01, AT-02)
  [AT-01] Cơ cấu tổ chức & lịch sử phân công nhân sự     -> ✓ PASS
  [AT-02] Nhập danh mục 5 nhóm và 48 hoạt động mẫu       -> ✓ PASS

PHẦN 2: CHẾ ĐỘ BÁO CÁO & ĐẦU VIỆC CÁ NHÂN LINH HOẠT (AT-03 -> AT-07, AT-21)
  [AT-03] Chế độ ON_OCCURRENCE không phát sinh trong kỳ  -> ✓ PASS
  [AT-04] Xác nhận 1-chạm 'Không phát sinh' cho việc định kỳ -> ✓ PASS
  [AT-05] Cảnh báo việc định kỳ đến hạn chưa báo cáo     -> ✓ PASS
  [AT-06] Chế độ NO_REPORT không sinh nghĩa vụ báo cáo   -> ✓ PASS
  [AT-07] Chế độ ON_ASSIGNMENT khi chưa được giao việc   -> ✓ PASS
  [AT-21] Danh mục đầu việc cá nhân biến động theo kỳ    -> ✓ PASS

PHẦN 3: LIÊN KẾT ĐA KỲ, ĐIỀU HÀNH & PHÊ DUYỆT (AT-08 -> AT-11, AT-22)
  [AT-08] Một Task liên kết đa kỳ đếm DISTINCT Task ID   -> ✓ PASS
  [AT-09] Cập nhật hoàn thành chuyển WAITING_REVIEW      -> ✓ PASS
  [AT-10] Bảo toàn hạn gốc khi phê duyệt gia hạn nhiệm vụ -> ✓ PASS
  [AT-11] Chu trình phê duyệt kế hoạch DRAFT->RETURN->APPROVE -> ✓ PASS
  [AT-22] Phân công chủ trì và phối hợp đa cán bộ        -> ✓ PASS

PHẦN 4: BÁO CÁO, EXCEL ENGINE & AN TOÀN FORMULA (AT-13, AT-14, AT-17, AT-23)
  [AT-13] Xuất Excel Mẫu A chuẩn Kế hoạch công tác.xlsx  -> ✓ PASS
  [AT-14] Xuất Excel Mẫu B chi tiết theo từng đầu việc   -> ✓ PASS
  [AT-17] Kiểm soát quyền reports.export khi tải file Excel -> ✓ PASS
  [AT-23] Triệt tiêu lỗ hổng Formula / CSV Injection     -> ✓ PASS

PHẦN 5: BIỂU MẪU ĐỘNG, SNAPSHOT & BẢO MẬT HỆ THỐNG (AT-12, AT-15, AT-16, AT-18, AT-19, AT-20, AT-24)
  [AT-12] Phiên bản biểu mẫu động bất biến (Dynamic Forms) -> ✓ PASS
  [AT-15] Chốt kỳ báo cáo và Snapshot mã băm SHA-256     -> ✓ PASS
  [AT-16] Chặn đứng hành vi truy cập chéo đơn vị (Anti-IDOR) -> ✓ PASS
  [AT-18] Khóa tài khoản Quản trị kỹ thuật khỏi dữ liệu nghiệp vụ -> ✓ PASS
  [AT-19] Chuẩn hóa mã phản hồi HTTP (200, 201, 307, 401, 403) -> ✓ PASS
  [AT-20] Giao diện chuẩn Responsive 8 Viewports (2560px->360px) -> ✓ PASS
  [AT-24] Ghi vết Audit Trail kiểm toán bất biến         -> ✓ PASS

================================================================================
TỔNG KẾT BỘ KIỂM THỬ CHẤP NHẬN: 24/24 TIÊU CHÍ ĐẠT CHUẨN (100% PASS)
================================================================================
```

---

## VI. CÁC LỆNH KIỂM THỬ NHANH DÀNH CHO KỸ THUẬT VIÊN

Nếu cần chạy lại các kịch bản kiểm tra tự động độc lập qua dòng lệnh Terminal:
```bash
# 1. Chạy toàn bộ 24 tiêu chí nghiệm thu chấp nhận
npx tsx scripts/run-full-acceptance-suite.ts

# 2. Kiểm thử riêng Milestone 3 (Báo cáo, Excel Exporter, Formula Sanitizer, Routine)
npx tsx scripts/test-milestone-3.ts

# 3. Kiểm thử an ninh bảo mật & Chống IDOR (Scope Guard)
npx tsx scripts/test-security-suite.ts

# 4. Kiểm tra Responsive 8 Viewports trên 16 màn hình
npx tsx scripts/verify-responsive-viewport.ts
```

---
*Hệ thống hiện đang duy trì hoạt động ổn định trên máy chủ nội bộ. Quý Lãnh đạo và các bộ phận có thể bắt đầu quá trình kiểm thử thực tế.*

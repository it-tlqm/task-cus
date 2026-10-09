# TỪ ĐIỂN DỮ LIỆU TRIỂN KHAI (DATA DICTIONARY)
## HỆ THỐNG QUẢN LÝ KẾ HOẠCH & ĐIỀU HÀNH CÔNG VIỆC — HẢI QUAN TÀ LÙNG (`talung-cus-work`)

Tài liệu này chuẩn hóa tên bảng, kiểu dữ liệu, ràng buộc và ý nghĩa nghiệp vụ của các thực thể trong cơ sở dữ liệu PostgreSQL.

---

### 1. NHÓM TỔ CHỨC & NHÂN SỰ

#### Bảng `organizations` (Đơn vị chủ quản)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh duy nhất của đơn vị |
| `code` | VARCHAR(50) | UK | Not Null | Mã đơn vị (ví dụ: `HQ_TA_LUNG`) |
| `name` | VARCHAR(255) | | Not Null | Tên đơn vị (Hải quan Cửa khẩu quốc tế Tà Lùng) |
| `status` | VARCHAR(20) | | Default 'ACTIVE' | Trạng thái: `ACTIVE`, `INACTIVE` |
| `created_at`| TIMESTAMPTZ | | Default NOW() | Thời điểm tạo |

#### Bảng `org_units` (Phòng / Đội / Tổ công tác)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh bộ phận |
| `org_id` | UUID / String | FK | Not Null -> organizations | Tham chiếu đơn vị chủ quản |
| `parent_id`| UUID / String | FK | Nullable -> org_units | Tham chiếu đơn vị cấp trên (cây đệ quy) |
| `code` | VARCHAR(50) | | Not Null | Mã bộ phận (ví dụ: `DEPT_A`, `DEPT_B`) |
| `name` | VARCHAR(255) | | Not Null | Tên bộ phận (ví dụ: `Bộ phận Nghiệp vụ A`) |
| `level` | INTEGER | | Default 1 | Cấp bậc trong cây tổ chức |
| `sort_order`| INTEGER | | Default 0 | Thứ tự hiển thị |
| `status` | VARCHAR(20) | | Default 'ACTIVE' | Trạng thái: `ACTIVE`, `INACTIVE` |

#### Bảng `people` (Hồ sơ Cán bộ, Công chức)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh cá nhân |
| `code` | VARCHAR(50) | UK | Not Null | Mã cán bộ (ví dụ: `CB-001`) |
| `full_name`| VARCHAR(255) | | Not Null | Họ và tên cán bộ (mẫu demo) |
| `email` | VARCHAR(255) | | Nullable | Email nội bộ |
| `phone` | VARCHAR(50) | | Nullable | Số điện thoại liên hệ |
| `status` | VARCHAR(20) | | Default 'ACTIVE' | Trạng thái công tác |

#### Bảng `person_assignments` (Phân công công tác theo thời gian)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh phân công |
| `person_id`| UUID / String | FK | Not Null -> people | Cán bộ được phân công |
| `unit_id` | UUID / String | FK | Not Null -> org_units | Bộ phận công tác |
| `position_id`| UUID / String| FK | Nullable -> positions | Chức vụ giữ (Đội trưởng, Phó đội trưởng, Cán bộ) |
| `is_primary`| BOOLEAN | | Default TRUE | Vị trí chính hay kiêm nhiệm |
| `effective_from`| DATE | | Not Null | Ngày bắt đầu hiệu lực |
| `effective_to`| DATE | | Nullable | Ngày kết thúc hiệu lực |

---

### 2. NHÓM TÀI KHOẢN & PHÂN QUYỀN

#### Bảng `accounts` (Tài khoản người dùng)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh tài khoản |
| `person_id`| UUID / String | FK | UK, Not Null -> people | Liên kết 1-1 với hồ sơ cán bộ |
| `username` | VARCHAR(100) | UK | Not Null | Tên đăng nhập |
| `password_hash`| VARCHAR(255)| | Not Null | Mật khẩu băm an toàn |
| `status` | VARCHAR(20) | | Default 'ACTIVE' | `ACTIVE`, `LOCKED`, `DISABLED` |
| `last_login_at`| TIMESTAMPTZ | | Nullable | Thời điểm đăng nhập gần nhất |

#### Bảng `role_grants` (Cấp quyền theo phạm vi)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh cấp quyền |
| `account_id`| UUID / String | FK | Not Null -> accounts | Tài khoản được cấp quyền |
| `role_id` | UUID / String | FK | Not Null -> roles | Vai trò được cấp |
| `scope_type`| VARCHAR(30) | | Not Null | `OWN`, `ASSIGNED`, `DEPARTMENT`, `ORGANIZATION` |
| `scope_unit_id`| UUID / String| FK | Nullable -> org_units | Bộ phận áp dụng scope (nếu có) |
| `valid_from`| TIMESTAMPTZ | | Default NOW() | Thời gian bắt đầu hiệu lực |
| `valid_to` | TIMESTAMPTZ | | Nullable | Thời gian kết thúc hiệu lực |

---

### 3. NHÓM DANH MỤC & ĐẦU VIỆC CÁ NHÂN

#### Bảng `activity_groups` (5 Nhóm nghiệp vụ từ Excel gốc)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh nhóm |
| `code` | VARCHAR(50) | UK | Not Null | Mã nhóm: `TTHQ`, `GSHQ`, `TON_DONG`, `DANH_GIA_HQ`, `DANH_GIA_NGAY_TUAN` |
| `name` | VARCHAR(255) | | Not Null | Tên nhóm nguyên văn từ Excel |
| `source_row`| INTEGER | | Not Null | Dòng trong Excel (hàng 8–12) |
| `sort_order`| INTEGER | | Default 0 | Thứ tự hiển thị |

#### Bảng `activity_templates` (48 Hoạt động mẫu từ Excel gốc)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh hoạt động mẫu |
| `group_id` | UUID / String | FK | Not Null -> activity_groups | Nhóm nghiệp vụ trực thuộc |
| `code` | VARCHAR(50) | UK | Not Null | Mã gợi ý (ví dụ: `TTHQ-01`, `GSHQ-01`) |
| `title` | TEXT | | Not Null | Tên hoạt động |
| `source_raw_text`| TEXT | | Not Null | Nguyên văn từ cột C trong file Excel nguồn |
| `default_priority`| VARCHAR(20)| | Default 'Cao' | Mức độ ưu tiên gợi ý ban đầu |
| `reporting_mode`| VARCHAR(30)| | Default 'UNCONFIGURED' | Chế độ báo cáo: `UNCONFIGURED`, `EVERY_PERIOD`, `ON_OCCURRENCE`, `ON_ASSIGNMENT`, `NO_REPORT` |
| `review_status`| VARCHAR(30) | | Default 'NEEDS_REVIEW' | Trạng thái rà soát: `NEEDS_REVIEW`, `VERIFIED`, `RETIRED` |

#### Bảng `personal_work_items` (Danh mục đầu việc thực tế của cá nhân theo kỳ)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh đầu việc cá nhân |
| `person_id`| UUID / String | FK | Not Null -> people | Cán bộ phụ trách đầu việc |
| `period_id`| UUID / String | FK | Not Null -> reporting_periods | Kỳ áp dụng (ngày/tuần/tháng) |
| `plan_item_id`| UUID / String| FK | Nullable -> plan_items | Thuộc hạng mục kế hoạch nào (nếu có) |
| `template_id`| UUID / String | FK | Nullable -> activity_templates | Tham chiếu hoạt động mẫu (nếu chọn từ mẫu) |
| `title` | TEXT | | Not Null | Tên đầu việc (có thể tự tạo hoặc lấy từ mẫu) |
| `sort_order`| INTEGER | | Default 0 | Thứ tự hiển thị của người đó trong kỳ |
| `status` | VARCHAR(30) | | Default 'ACTIVE' | Trạng thái áp dụng: `ACTIVE`, `COMPLETED`, `DISCONTINUED` |
| `version` | INTEGER | | Default 1 | Phiên bản bản ghi (Optimistic locking) |

---

### 4. NHÓM KẾ HOẠCH & NHIỆM VỤ

#### Bảng `tasks` (Nhiệm vụ được giao / chỉ đạo cụ thể)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã nhiệm vụ duy nhất (Single Task ID) |
| `code` | VARCHAR(50) | UK | Not Null | Mã hiển thị (ví dụ: `TASK-2026-001`) |
| `title` | TEXT | | Not Null | Tên/Nội dung nhiệm vụ |
| `description`| TEXT | | Nullable | Chi tiết biện pháp thực hiện |
| `owner_id` | UUID / String | FK | Not Null -> people | Cán bộ chủ trì |
| `unit_id` | UUID / String | FK | Not Null -> org_units | Bộ phận chủ trì |
| `priority` | VARCHAR(20) | | Default 'Cao' | `Cao`, `Trung bình`, `Thấp` |
| `status` | VARCHAR(30) | | Default 'NOT_STARTED' | `NOT_STARTED`, `IN_PROGRESS`, `WAITING_REVIEW`, `DONE`, `CANCELED` |
| `original_deadline`| TIMESTAMPTZ| | Not Null | Hạn chót ban đầu được giao |
| `current_deadline` | TIMESTAMPTZ| | Not Null | Hạn chót hiện tại (sau điều chỉnh) |
| `has_issue`| BOOLEAN | | Default FALSE | Cờ báo có vướng mắc |
| `issue_notes`| TEXT | | Nullable | Nội dung khó khăn, vướng mắc |
| `expected_result_text`| TEXT | | Nullable | Kết quả dự kiến |
| `actual_result_text`| TEXT | | Nullable | Kết quả thực tế đạt được |

#### Bảng `plan_task_links` (Liên kết Kế hoạch - Nhiệm vụ chống đếm trùng)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã định danh liên kết |
| `plan_item_id`| UUID / String| FK | Not Null -> plan_items | Hạng mục thuộc kế hoạch Tháng/Tuần/Ngày |
| `task_id` | UUID / String | FK | Not Null -> tasks | Nhiệm vụ được liên kết |
| `created_at`| TIMESTAMPTZ | | Default NOW() | Thời điểm liên kết |

---

### 5. NHÓM NHẬT KÝ THƯỜNG XUYÊN & BIỂU MẪU ĐỘNG

#### Bảng `routine_entries` (Ghi nhận hoạt động thường xuyên)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã bản ghi nhật ký |
| `period_id`| UUID / String | FK | Not Null -> reporting_periods | Kỳ báo cáo |
| `person_id`| UUID / String | FK | Not Null -> people | Cán bộ ghi nhận |
| `unit_id` | UUID / String | FK | Not Null -> org_units | Bộ phận của cán bộ |
| `template_id`| UUID / String | FK | Nullable -> activity_templates | Hoạt động mẫu liên quan |
| `work_item_id`| UUID / String| FK | Nullable -> personal_work_items | Đầu việc cá nhân liên quan |
| `occurrence_status`| VARCHAR(30)| | Not Null | `OCCURRED` (Có phát sinh) hoặc `NOT_OCCURRED` (Không phát sinh) |
| `notes` | TEXT | | Nullable | Ghi chú thêm |

#### Bảng `form_template_versions` (Phiên bản biểu mẫu động)
| Cột | Kiểu dữ liệu | Khóa | Ràng buộc | Ý nghĩa nghiệp vụ |
|---|---|---|---|---|
| `id` | UUID / String | PK | Not Null | Mã phiên bản biểu mẫu |
| `form_template_id`| UUID / String| FK | Not Null -> form_templates | Biểu mẫu gốc |
| `version` | INTEGER | | Not Null | Số thứ tự phiên bản (1, 2, 3...) |
| `schema_json`| JSONB | | Not Null | Cấu trúc trường: labels, types, validation rules |
| `status` | VARCHAR(20) | | Default 'PUBLISHED' | `DRAFT`, `PUBLISHED`, `RETIRED` |
| `published_at`| TIMESTAMPTZ | | Nullable | Thời điểm xuất bản |

# MỤC LỤC TÀI LIỆU DỰ ÁN (docs/) — cập nhật 19/10/2026

> **Đọc nhanh:** bàn giao mới nhất là [HANDOVER_YC26_29_2026-10-19.md](HANDOVER_YC26_29_2026-10-19.md);
> trạng thái yêu cầu tại [TRANG_THAI_YC_01_29.md](TRANG_THAI_YC_01_29.md);
> vận hành tại [HUONG_DAN_VAN_HANH_HAI_QUAN.md](HUONG_DAN_VAN_HANH_HAI_QUAN.md).

## 1. Bàn giao theo đợt (mới → cũ)

| Tài liệu | Nội dung chính |
| --- | --- |
| [HANDOVER_YC26_29_2026-10-19.md](HANDOVER_YC26_29_2026-10-19.md) | Gói YC-26→29 (số liệu giao ban, bảng đối chiếu thuế, chọn CB-014) + rà soát P0 14 bản ghi + sửa hiển thị khối số liệu trên Bảng điều hành desktop (19/10) |
| [HANDOVER_YC24_2026-10-18.md](HANDOVER_YC24_2026-10-18.md) | YC-24 — phân công nhiệm vụ & sổ trực theo mẫu hải quan |
| [HANDOVER_YC23_YC25_2026-10-18.md](HANDOVER_YC23_YC25_2026-10-18.md) | YC-23 + YC-25 — danh mục chọn đầu việc cho kế hoạch cá nhân |
| [HANDOVER_CUSTOMS_FEEDBACK_2026-10-15.md](HANDOVER_CUSTOMS_FEEDBACK_2026-10-15.md) | Cập nhật theo phản hồi của Hải quan Tà Lùng (tên đơn vị, chức danh, logo) |
| [HANDOVER_AND_TEST_GUIDE.md](HANDOVER_AND_TEST_GUIDE.md) | Bàn giao kỹ thuật + hướng dẫn kiểm thử UAT |

## 2. Trạng thái & phân tích nghiệp vụ

| Tài liệu | Nội dung chính |
| --- | --- |
| [TRANG_THAI_YC_01_29.md](TRANG_THAI_YC_01_29.md) | Bảng trạng thái tổng hợp YC-01→29 (đợt 3, 19/10) |
| [BAO_CAO_P0_YC26_29_2026-10-19.md](BAO_CAO_P0_YC26_29_2026-10-19.md) | P0 — rà soát 14 bản ghi nhập liệu CB-014 ngày 18/10 (đang chờ quyết định PA1/PA2) |
| [PHAN_LOAI_XAC_NHAN_49_CHI_TIEU.md](PHAN_LOAI_XAC_NHAN_49_CHI_TIEU.md) | Phân loại mục xác nhận cho 49 chỉ tiêu giao ban (đề xuất, chờ Hải quan xác nhận) |
| [GIAO_BAN_SO_LIEU_PHASE1_PHAN_TICH.md](GIAO_BAN_SO_LIEU_PHASE1_PHAN_TICH.md) | Phân tích giai đoạn 1 — số liệu giao ban & dashboard thuế (YC-16→22) |
| [ANH_XA_BIEU_MAU_DANH_GIA.md](ANH_XA_BIEU_MAU_DANH_GIA.md) | Ánh xạ biểu mẫu đánh giá — bản 2 (17/10) |
| [DE_XUAT_MOI_TRUONG_UAT.md](DE_XUAT_MOI_TRUONG_UAT.md) | Đề xuất môi trường UAT riêng (chờ thực hiện) |

## 3. Kiến trúc, quyết định & vận hành

| Tài liệu | Nội dung chính |
| --- | --- |
| [DECISIONS.md](DECISIONS.md) | Architecture Decision Records (ADR) |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | Từ điển dữ liệu triển khai |
| [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) | Triển khai vận hành — xem ghi chú **hiện trạng** đầu file (Vercel đang chạy vs phương án on-prem Docker/Nginx) |
| [HUONG_DAN_VAN_HANH_HAI_QUAN.md](HUONG_DAN_VAN_HANH_HAI_QUAN.md) | Sổ tay vận hành cho Chi cục |
| [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) | Lộ trình go-live 5 giai đoạn |

## 4. Kiểm thử, kiểm toán & QA

| Tài liệu | Nội dung chính |
| --- | --- |
| [FULL_SYSTEM_UAT_REPORT.md](FULL_SYSTEM_UAT_REPORT.md) | Báo cáo nghiệm thu tích hợp toàn hệ thống |
| [REVIEW_AUDIT_2026-10-15.md](REVIEW_AUDIT_2026-10-15.md) | Review/audit độc lập (15/10) |
| [BACKEND_TRUTH_AUDIT.md](BACKEND_TRUTH_AUDIT.md) | Kiểm toán chức năng thực tế (backend) |
| [RA_SOAT_AN_TOAN_DANG_NHAP_VA_PHAN_QUYEN.md](RA_SOAT_AN_TOAN_DANG_NHAP_VA_PHAN_QUYEN.md) | Rà soát an toàn đăng nhập & phân quyền |
| [VISUAL_QA_REPORT.md](VISUAL_QA_REPORT.md) | Nghiệm thu thị giác & tương tác thực tế |
| [MILESTONE_2_REPORT.md](MILESTONE_2_REPORT.md) | Nghiệm thu kỹ thuật — Milestone 2 (quản trị công việc lõi) |

> Ghi chú: sau sự cố "khối số liệu ẩn trên desktop" (19/10), quy ước nghiệm thu UI mới là
> **kiểm tra phần tử NHÌN THẤY THẬT** (kích thước > 0, không bị ẩn) — không chỉ đọc DOM.
> Xem mục 7b trong [HANDOVER_YC26_29_2026-10-19.md](HANDOVER_YC26_29_2026-10-19.md).

## 5. Hướng dẫn sử dụng theo vai trò

- [USER_GUIDE_LEADER.md](USER_GUIDE_LEADER.md) — cẩm nang cho Lãnh đạo Chi cục / Trưởng bộ phận
- [USER_GUIDE_OFFICER.md](USER_GUIDE_OFFICER.md) — cẩm nang cho Cán bộ công chức

## 6. Thiết kế & giao diện

- [DESIGN.md](DESIGN.md) — Design system (đối chiếu Google Stitch)
- [MOTION_SPEC.md](MOTION_SPEC.md) — Quy chuẩn chuyển động & motion tokens
- [STITCH_SYNC_REPORT.md](STITCH_SYNC_REPORT.md) — Báo cáo xác minh kết nối Stitch MCP

## 7. Thư mục con & tài liệu ở gốc repo

- Thư mục ảnh/bằng chứng: `screenshots/`, `visual-qa/`, `stitch-export/`, `exports/`
- **Dữ liệu nguồn Hải quan gửi:** `Dữ liệu-file-hai-quan-gui/`, `Dữ liệu.zip` — chỉ lưu cục bộ,
  đã bị `.gitignore` chặn, KHÔNG commit (chứa thông tin nghiệp vụ).
- Ở gốc repo:
  - [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) — Ngữ cảnh + PRD + blueprint (bản duy nhất; bản tên dài đã thành con trỏ)
  - [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) — kế hoạch triển khai ban đầu (tài liệu lịch sử)
  - [`../ROADMAP.md`](../ROADMAP.md) — trỏ tới `GO_LIVE_ROADMAP.md`
  - [`../AGENTS.md`](../AGENTS.md) — quy ước công cụ/agent khi làm việc trong repo
  - [`../scripts/README.md`](../scripts/README.md) — mục lục script vận hành & kiểm thử

# BÁO CÁO XÁC MINH KẾT NỐI GOOGLE STITCH MCP & ĐỒNG BỘ THIẾT KẾ
## DỰ ÁN: `talung-cus-work` — HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG

> **Thời điểm cập nhật:** 09/10/2026 (Milestone 1.1 — Đồng bộ hoàn tất 100% 16 màn hình Stitch)  
> **Người thực hiện:** Technical Lead, Software Architect & Full-stack Engineer  
> **Project ID:** `1706229019122664463`  
> **Trạng thái kết nối MCP:** `CONNECTED` (15 tools JSON-RPC hoạt động)  
> **Tổng số màn hình UI đã đồng bộ:** **16/16 màn hình (7 Desktop + 9 Mobile 390px)**  
> **Tài nguyên tải về:** 100% tệp HTML/CSS và ảnh chụp PNG đã lưu tại [`docs/stitch-export/`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/)

---

## 1. DANH SÁCH CHI TIẾT 16 MÀN HÌNH GIAO DIỆN ĐÃ ĐỒNG BỘ TỪ STITCH MCP

Tất cả 16 màn hình đều sử dụng **Screen ID thực tế** thu được từ kết quả gọi `list_screens` của Stitch MCP (không dùng ID placeholder):

| STT | Screen ID thực | Tên màn hình trên Stitch | Thiết bị / Kích thước | Tài nguyên HTML | Ảnh chụp màn hình PNG |
|:---:|:---|:---|:---:|:---:|:---:|
| **D01** | `089086aec3864b019c5af41b1319cf82` | **Dashboard Lãnh Đạo Điều Hành** | Desktop (2560×5910) | Có sẵn trong code | [`089086ae...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/089086aec3864b019c5af41b1319cf82_Dashboard_L%C3%A3nh_%C4%90%E1%BA%A1o_%C4%90i%E1%BB%81u_H%C3%A0nh.png) |
| **D02** | `d8279bd2bf0c4198b665f567223d0bf4` | **Kế Hoạch Công Tác Tuần** | Desktop (2560×5370) | Có sẵn trong code | [`d8279bd2...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/d8279bd2bf0c4198b665f567223d0bf4_K%E1%BA%BF_Ho%E1%BA%A1ch_C%C3%B4ng_T%C3%A1c_Tu%E1%BA%A7n.png) |
| **D03** | `a1afd1c794c6454a8e161b43f25f4024` | **Công Việc Của Tôi** | Desktop (2560×4042) | Có sẵn trong code | [`a1afd1c7...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/a1afd1c794c6454a8e161b43f25f4024_C%C3%B4ng_Vi%E1%BB%87c_C%E1%BB%A7a_T%C3%B4i.png) |
| **D04** | `26cca4106e7047f0af538a76d53f9338` | **Nhiệm Vụ Chỉ Đạo & Giao Việc** | Desktop (2560×4772) | [`26cca410...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/26cca4106e7047f0af538a76d53f9338_Nhi%E1%BB%87m_V%E1%BB%A5_Ch%E1%BB%89_%C4%90%E1%BA%A1o_&_Giao_Vi%E1%BB%87c.html) | [`26cca410...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/26cca4106e7047f0af538a76d53f9338_Nhi%E1%BB%87m_V%E1%BB%A5_Ch%E1%BB%89_%C4%90%E1%BA%A1o_&_Giao_Vi%E1%BB%87c.png) |
| **D05** | `6c85595ba47745ae9075391d1e280f87` | **Nhật Ký Tác Nghiệp & Biểu Mẫu Động** | Desktop (2560×3846) | [`6c85595b...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/6c85595ba47745ae9075391d1e280f87_Nh%E1%BA%ADt_K%C3%BD_T%C3%A1c_Nghi%E1%BB%87p_&_Bi%E1%BB%83u_M%E1%BA%ABu_%C4%90%E1%BB%99ng.html) | [`6c85595b...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/6c85595ba47745ae9075391d1e280f87_Nh%E1%BA%ADt_K%C3%BD_T%C3%A1c_Nghi%E1%BB%87p_&_Bi%E1%BB%83u_M%E1%BA%ABu_%C4%90%E1%BB%99ng.png) |
| **D06** | `a4e5421378a643b8a65a7ec5600b17aa` | **Báo Cáo Trực Tuyến & Cấu Hình Mẫu XLSX** | Desktop (2560×4822) | [`a4e54213...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/a4e5421378a643b8a65a7ec5600b17aa_B%C3%A1o_C%C3%A1o_Tr%E1%BB%B1c_Tuy%E1%BA%BFn_&_C%E1%BA%A5u_H%C3%ACnh_M%E1%BA%ABu_XLSX.html) | [`a4e54213...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/a4e5421378a643b8a65a7ec5600b17aa_B%C3%A1o_C%C3%A1o_Tr%E1%BB%B1c_Tuy%E1%BA%BFn_&_C%E1%BA%A5u_H%C3%ACnh_M%E1%BA%ABu_XLSX.png) |
| **D07** | `25d2bbef1eed4a3bb5aef7fcee376979` | **Quản Trị Hệ Thống & Cấu Hình** | Desktop (2560×4628) | [`25d2bbef...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/25d2bbef1eed4a3bb5aef7fcee376979_Qu%E1%BA%A3n_Tr%E1%BB%8B_H%E1%BB%87_Th%E1%BB%91ng_&_C%E1%BA%A5u_H%C3%ACnh.html) | [`25d2bbef...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/25d2bbef1eed4a3bb5aef7fcee376979_Qu%E1%BA%A3n_Tr%E1%BB%8B_H%E1%BB%87_Th%E1%BB%91ng_&_C%E1%BA%A5u_H%C3%ACnh.png) |
| **M01** | `6de0e0a4a10f429b9af634b4709465ea` | **Đăng Nhập Hệ Thống (Mobile)** | Mobile 390px (780×2370) | [`6de0e0a4...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/6de0e0a4a10f429b9af634b4709465ea_%C4%90%C4%83ng_Nh%E1%BA%ADp_H%E1%BB%87_Th%E1%BB%91ng_(Mobile).html) | [`6de0e0a4...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/6de0e0a4a10f429b9af634b4709465ea_%C4%90%C4%83ng_Nh%E1%BA%ADp_H%E1%BB%87_Th%E1%BB%91ng_(Mobile).png) |
| **M02** | `e603607363fd424d95c1e47d9bf41a5a` | **Dashboard Điều Hành (Mobile)** | Mobile 390px (780×2308) | [`e6036073...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/e603607363fd424d95c1e47d9bf41a5a_Dashboard_%C4%90i%E1%BB%81u_H%C3%A0nh_(Mobile).html) | [`e6036073...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/e603607363fd424d95c1e47d9bf41a5a_Dashboard_%C4%90i%E1%BB%81u_H%C3%A0nh_(Mobile).png) |
| **M03** | `6835e08c233044cebdd3c966fef7fb1e` | **Kế Hoạch Công Tác (Mobile)** | Mobile 390px (780×5032) | [`6835e08c...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/6835e08c233044cebdd3c966fef7fb1e_K%E1%BA%BF_Ho%E1%BA%A1ch_C%C3%B4ng_T%C3%A1c_(Mobile).html) | [`6835e08c...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/6835e08c233044cebdd3c966fef7fb1e_K%E1%BA%BF_Ho%E1%BA%A1ch_C%C3%B4ng_T%C3%A1c_(Mobile).png) |
| **M04** | `76ee03a9efeb4a9a8c27ab0ddcaf0283` | **Phê Duyệt Lãnh Đạo (Mobile)** | Mobile 390px (780×2986) | [`76ee03a9...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/76ee03a9efeb4a9a8c27ab0ddcaf0283_Ph%C3%AA_Duy%E1%BB%87t_L%C3%A3nh_%C4%90%E1%BA%A1o_(Mobile).html) | [`76ee03a9...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/76ee03a9efeb4a9a8c27ab0ddcaf0283_Ph%C3%AA_Duy%E1%BB%87t_L%C3%A3nh_%C4%90%E1%BA%A1o_(Mobile).png) |
| **M05** | `2443cdf63e214979b5a74c40779511ba` | **Công Việc Của Tôi (Mobile)** | Mobile 390px (780×3528) | [`2443cdf6...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/2443cdf63e214979b5a74c40779511ba_C%C3%B4ng_Vi%E1%BB%87c_C%E1%BB%A7a_T%C3%B4i_(Mobile).html) | [`2443cdf6...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/2443cdf63e214979b5a74c40779511ba_C%C3%B4ng_Vi%E1%BB%87c_C%E1%BB%A7a_T%C3%B4i_(Mobile).png) |
| **M06** | `453d42cded034a6b807f9d88dcb5548d` | **Chi Tiết Nhiệm Vụ (Mobile)** | Mobile 390px (780×3794) | [`453d42cd...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/453d42cded034a6b807f9d88dcb5548d_Chi_Ti%E1%BA%BFt_Nhi%E1%BB%87m_V%E1%BB%A5_(Mobile).html) | [`453d42cd...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/453d42cded034a6b807f9d88dcb5548d_Chi_Ti%E1%BA%BFt_Nhi%E1%BB%87m_V%E1%BB%A5_(Mobile).png) |
| **M07** | `a82b540bccfa44f18a4613e415e5efa4` | **Nhật Ký Tác Nghiệp (Mobile)** | Mobile 390px (780×3458) | [`a82b540b...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/a82b540bccfa44f18a4613e415e5efa4_Nh%E1%BA%ADt_K%C3%BD_T%C3%A1c_Nghi%E1%BB%87p_(Mobile).html) | [`a82b540b...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/a82b540bccfa44f18a4613e415e5efa4_Nh%E1%BA%ADt_K%C3%BD_T%C3%A1c_Nghi%E1%BB%87p_(Mobile).png) |
| **M08** | `7b483d3d95784cad9377ed26e2e6fd08` | **Báo Cáo Trực Tuyến (Mobile)** | Mobile 390px (780×2912) | [`7b483d3d...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/7b483d3d95784cad9377ed26e2e6fd08_B%C3%A1o_C%C3%A1o_Tr%E1%BB%B1c_Tuy%E1%BA%BFn_(Mobile).html) | [`7b483d3d...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/7b483d3d95784cad9377ed26e2e6fd08_B%C3%A1o_C%C3%A1o_Tr%E1%BB%B1c_Tuy%E1%BA%BFn_(Mobile).png) |
| **M09** | `cf3acf4ac7ce43edbb7642ce7bf521a9` | **Thông Báo Điều Hành (Mobile)** | Mobile 390px (780×2896) | [`cf3acf4a...html`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/cf3acf4ac7ce43edbb7642ce7bf521a9_Th%C3%B4ng_B%C3%A1o_%C4%90i%E1%BB%81u_H%C3%A0nh_(Mobile).html) | [`cf3acf4a...png`](file:///d:/thanhnx/OpenCode/talung-cus-work/docs/stitch-export/cf3acf4ac7ce43edbb7642ce7bf521a9_Th%C3%B4ng_B%C3%A1o_%C4%90i%E1%BB%81u_H%C3%A0nh_(Mobile).png) |

*(Ghi chú: 02 tệp còn lại trong Stitch Project là tài liệu `PROJECT_CONTEXT_HAI_QUAN_TA_LUNG.md` [ID `12417506320912864407`] và `STITCH_SYNC_REPORT.md` [ID `b23d51d7673e4674acfed6137753a6cf`]).*

---

## 2. QUY CHUẨN THIẾT KẾ ĐÃ ÁP DỤNG TRÊN ỨNG DỤNG WEBAPP

1. **Mobile First Responsive (390px Viewport):**
   - Áp dụng các class `pt-safe` và `pb-safe` cho khoảng an toàn trên màn hình điện thoại có tai thỏ / thanh điều hướng hệ thống.
   - Thanh Bottom Navigation Bar cố định ở đáy màn hình di động với vùng chạm tối thiểu 44×44px.
   - Thẻ hiển thị công việc dạng card dọc (Card-based list) thay vì cố ép hiển thị bảng 8 cột trên màn hình hẹp.

2. **Bảo mật và trạng thái dữ liệu trên giao diện:**
   - Dải banner màu cam cảnh báo bắt buộc `DỮ LIỆU GIẢ LẬP (DEMO)` cố định trên đầu trang.
   - Cột C hiển thị tên nghiệp vụ chính thức **"Danh mục đầu việc"** (biến động theo từng cá nhân).
   - 48 hoạt động mẫu mang badge cảnh báo màu vàng `CHƯA XÁC NHẬN CHÍNH THỨC (NEEDS_REVIEW)`.

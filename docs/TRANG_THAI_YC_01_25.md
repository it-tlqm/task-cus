# BẢNG TRẠNG THÁI YÊU CẦU YC-01 → YC-25

**Ngày cập nhật:** 17/10/2026 · **Nguồn đối chiếu:** lịch sử commit Git, `docs/GIAO_BAN_SO_LIEU_PHASE1_PHAN_TICH.md`, các quyết định ngày 17/10/2026.

> ⚠️ Các mã YC-10, YC-15, YC-17, YC-23, YC-24, YC-25 **chưa từng xuất hiện trong kho tài liệu/git của dự án**. Đề nghị đơn vị cung cấp danh sách yêu cầu gốc để đối chiếu 1-1 (không tự suy diễn nội dung).

| Mã | Nội dung (theo nguồn hiện có) | Trạng thái | Bằng chứng / ghi chú |
| :-- | :-- | :-- | :-- |
| YC-01 → YC-09 | Nhóm 9 yêu cầu UAT 16/10: phối hợp nhiệm vụ, sửa, chống trùng, hủy trùng, tiến độ 5 mức, nhãn lịch trực… | ✅ Hoàn thành (triển khai) | Commit `96b3061` (16/10/2026). Chi tiết từng mã cần đối chiếu danh sách gốc của đơn vị |
| YC-10 | — chưa có nguồn trong kho tài liệu | ❓ Chưa xác định | Cần danh sách gốc |
| YC-11 | Danh mục sản phẩm/đầu việc theo QĐ 1277 (v1) | ✅ Hoàn thành | Commit `602034d` (GĐ2) |
| YC-12 | Kết quả tháng (KQ tháng GĐ2) | ✅ Hoàn thành | Commit `602034d` |
| YC-13 | Xuất Bảng 1 + mẫu 01A giữ công thức gốc | ✅ Hoàn thành (GĐ3) | Commit `f55ad8b` |
| YC-14 | Điểm tính thử KQ tháng theo công thức mẫu | ✅ Hoàn thành mức "tính thử" | Commit `dac5edc`; gắn nhãn "tham khảo — chưa chính thức"; **điểm chính thức chờ công thức được duyệt** |
| YC-15 | — chưa có nguồn trong kho tài liệu | ❓ Chưa xác định | Cần danh sách gốc |
| YC-16 | Đưa số thuế lên trang chủ (dashboard) | ✅ Hoàn thành (GĐ2) | Khu "Tình hình thu NSNN" trên dashboard; YC-16.3 (tách "số thuế phát sinh" vs "Thu NSNN") còn chờ xác nhận — xem `KPI_2C_2D_2E_ANH_XA_CONG_THUC.md` mục 8 |
| YC-17 | — chưa rõ trong nguồn hiện có | ❓ Cần đối chiếu | Nếu thuộc nhóm 16→22 sẽ bổ sung khi đơn vị xác nhận danh sách gốc |
| YC-18 | Mục riêng phục vụ giao ban (menu + phân hệ) | ✅ Hoàn thành (GĐ2/GĐ3) | Nhóm menu "Giao ban": Số liệu / Nhập số liệu / Báo cáo Word / Cấu hình |
| YC-19 | Số liệu giao ban: 19.2 mốc lũy kế; 19.4 phân loại chỉ tiêu | ✅ Hoàn thành (GĐ2) | Mốc Đề xuất→Xác nhận; phân loại chỉ tiêu theo ô tô/than cốc…; chỉ mốc CONFIRMED được tính lũy kế |
| YC-20 | Xuất Word báo cáo tuần theo mẫu | ✅ Hoàn thành (GĐ3) | Commit `512f90c`; snapshot phiên bản (đã lưu thì sửa nguồn không đổi) |
| YC-21 | Menu Giao ban & KQ tháng — hai cách hiểu (a)/(b) | ✅ **CHỐT (b) ngày 17/10/2026** | Giữ KQ tháng nguyên chỗ; Giao ban quản lý số liệu + báo cáo tuần; không gộp; đã kiểm tra menu Desktop/Mobile đáp ứng — ADR-006 |
| YC-22 | Quy trình kiểm soát số liệu (22.2: mức phù hợp, không nặng) | ✅ Hoàn thành tính năng (cấu hình bật/tắt) | **Chưa bật cho chỉ tiêu nào**; chờ duyệt phân loại A/B/C/D — `PHAN_LOAI_XAC_NHAN_49_CHI_TIEU.md` |
| YC-23 | — chưa có nguồn trong kho tài liệu | ❓ Chưa xác định | Cần danh sách gốc |
| YC-24 | — chưa có nguồn trong kho tài liệu | ❓ Chưa xác định | Cần danh sách gốc |
| YC-25 | — chưa có nguồn trong kho tài liệu | ❓ Chưa xác định | Cần danh sách gốc |

## Ghi chú

- Trạng thái "Hoàn thành" = đã triển khai & có bằng chứng commit; **không đồng nghĩa đã nghiệm thu** (nghiệm thu theo mục 7 chỉ đạo: Giao ban snapshot / nhập số liệu / đăng nhập / menu — chờ đơn vị chạy UAT).
- Các việc đang chờ xác nhận của đơn vị: YC-16.3 (nghĩa "số thuế phát sinh"), YC-12/14 (công thức điểm chính thức), YC-19 các mốc/chỉ tiêu thật, YC-22 (bật mức A hay A+B), YC-21 điều chỉnh (nếu sau UAT đơn vị muốn khác).
- Khi đơn vị gửi danh sách gốc, cập nhật lại bảng này và đối chiếu từng mã.

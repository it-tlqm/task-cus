# BẢNG TRẠNG THÁI YÊU CẦU YC-01 → YC-25 (CẬP NHẬT 17/10/2026 — ĐỢT 2)

**Ngày cập nhật:** 17/10/2026 · **Nguồn đối chiếu:** lịch sử commit Git, `docs/GIAO_BAN_SO_LIEU_PHASE1_PHAN_TICH.md`, `docs/ANH_XA_BIEU_MAU_DANH_GIA.md`, các chốt ngày 17/10/2026 (đợt 2).

**Thang trạng thái:** ✅ Đã có đầy đủ · 🟡 Có một phần · ➖ Chưa có · ⏸ Chưa thể nghiệm thu do thiếu dữ liệu hoặc quy tắc.

> 📌 **Đợt 2 (17/10/2026):** đơn vị đã cung cấp nội dung cho 6 mã trước đây thiếu nguồn — **YC-10, YC-15, YC-17, YC-23, YC-24, YC-25** — đã cập nhật bên dưới. Không còn mã "chưa xác định".

| Mã | Nội dung | Trạng thái | Bằng chứng / ghi chú |
| :-- | :-- | :-- | :-- |
| YC-01 → YC-09 | Nhóm 9 yêu cầu UAT 16/10: phối hợp nhiệm vụ, sửa, chống trùng, hủy trùng, tiến độ 5 mức, nhãn lịch trực… | ✅ Đã có đầy đủ (triển khai) | Commit `96b3061` (16/10/2026). Chi tiết từng mã đối chiếu danh sách gốc; **nghiệm thu chờ UAT trên môi trường riêng** |
| YC-10 | **Giữ nguyên Danh mục công việc thường xuyên** (không gộp/sửa) | ✅ Đã có đầy đủ — giữ nguyên | Phân hệ Nhật ký công tác + danh mục 5 nhóm nghiệp vụ còn nguyên trạng; các đợt 16–17/10 **không sửa cấu trúc danh mục**; kiểm tra trực quan khi UAT |
| YC-11 | Danh mục sản phẩm/đầu việc theo QĐ 1277 (v1) | ✅ Đã có đầy đủ | Commit `602034d` (GĐ2) |
| YC-12 | Kết quả tháng (KQ tháng GĐ2) | ✅ Đã có đầy đủ | Commit `602034d` |
| YC-13 | Xuất Bảng 1 + mẫu 01A giữ công thức gốc | ✅ Đã có đầy đủ | Commit `f55ad8b` |
| YC-14 | Điểm tính thử KQ tháng theo công thức mẫu | 🟡 Có một phần | Commit `dac5edc`; gắn nhãn "tham khảo — chưa chính thức". **Điểm chính thức: ⏸ chưa thể nghiệm thu — thiếu ngưỡng xếp loại** (câu hỏi 2, `ANH_XA_BIEU_MAU_DANH_GIA.md`) |
| YC-15 | **Giữ riêng biểu mẫu & cơ chế đánh giá LÃNH ĐẠO** (01B/02B tách khỏi công chức) | ➖ Chưa có trong hệ thống (đang tách riêng đúng nguyên tắc) · ⏸ | App chưa có 01B/02B; hiện **không trộn** với hệ công chức ✔; công thức gốc 01B/02B đã trích xuất được (đợt 2 — `ANH_XA_BIEU_MAU_DANH_GIA.md` mục 4.2–4.3) nhưng **chưa được lệnh xây** — cần chủ trương riêng khi triển khai |
| YC-16 | Đưa số thuế lên trang chủ (dashboard) | ✅ Đã có đầy đủ (16.1 · 16.2) · ⏸ cho 16.3 | Khu "Tình hình thu NSNN" trên dashboard; YC-16.3 (tách "số thuế phát sinh" vs "Thu NSNN") **chờ đơn vị xác nhận** — xem `ANH_XA_BIEU_MAU_DANH_GIA.md` mục 8 |
| YC-17 | **Người được phân công nhập số liệu nghiệp vụ từng ngày** (phục vụ lũy kế + Giao ban) | ✅ Đã có đầy đủ (tính năng GĐ2) · ⏸ nghiệm thu bằng số thật | Phân công nhập/xác nhận theo người–nhóm–chỉ tiêu (hiệu lực từ/đến, số ngày được lùi); nhập theo ngày; lũy kế chỉ tính mốc CONFIRMED; tổng hợp giao ban. Nghiệm thu bằng số thật **chờ UAT** |
| YC-18 | Mục riêng phục vụ giao ban (menu + phân hệ) | ✅ Đã có đầy đủ (GĐ2/GĐ3) | Nhóm menu "Giao ban": Số liệu / Nhập số liệu / Báo cáo Word / Cấu hình |
| YC-19 | Số liệu giao ban: 19.2 mốc lũy kế; 19.4 phân loại chỉ tiêu | ✅ Đã có đầy đủ (tính năng) · ⏸ | Mốc Đề xuất→Xác nhận; chỉ mốc CONFIRMED được tính lũy kế. **Mốc "hết Tuần 41" CHƯA xác nhận; chỉ tiêu BTC/UBND/KH tháng CHƯA nhập** → chưa thể nghiệm thu bằng số thật |
| YC-20 | Xuất Word báo cáo tuần theo mẫu | ✅ Đã có đầy đủ (GĐ3) | Commit `512f90c`; snapshot phiên bản (đã lưu thì sửa nguồn không đổi) |
| YC-21 | Menu Giao ban & KQ tháng — hai cách hiểu (a)/(b) | ✅ **CHỐT (b) ngày 17/10/2026** | Giữ KQ tháng nguyên chỗ; Giao ban quản lý số liệu + báo cáo tuần; không gộp; đã kiểm tra menu Desktop/Mobile — ADR-006 |
| YC-22 | Quy trình kiểm soát số liệu (22.2: mức phù hợp, không nặng) | ✅ Đã có đầy đủ (tính năng cấu hình bật/tắt) | **Chốt 17/10/2026 (đợt 2): CHƯA phê duyệt bật kể cả mức A** — `PHAN_LOAI_XAC_NHAN_49_CHI_TIEU.md` |
| YC-23 | **Công việc thường xuyên + Danh mục sản phẩm theo QĐ: cùng tab, chọn ở cột riêng, nguồn dữ liệu độc lập** | 🟡 Có một phần | Hai nguồn **đã tách đúng & độc lập** ✔ (nhật ký/đầu việc mẫu ↔ danh mục QĐ1277); **CHƯA có màn "1 tab – 2 cột chọn"** (hiện chọn ở 2 nơi: lập kế hoạch chọn đầu việc mẫu; KQ tháng nhập mã sản phẩm) |
| YC-24 | **Phân công nhiệm vụ theo ngày/vị trí trực** trong Lịch trực (căn cứ `so phan cong nhiem vu.xls`) | 🟡 Có một phần | Lịch trực có ngày + ca (Sáng/Chiều/Cả ngày) + **điểm trực (vị trí)** + người trực + lưu vết xếp/sửa/xóa; **đối chiếu từng mục với file gốc .xls chờ UAT** |
| YC-25 | **Danh mục đầu việc riêng từng bộ phận** cho lập kế hoạch cá nhân (khác danh mục SP tính điểm) | 🟡 Có một phần | Lập kế hoạch chọn được từ 48 đầu việc mẫu (5 nhóm) hoặc tự nhập; **CHƯA có danh mục RIÊNG theo từng bộ phận**; đã tách khỏi danh mục sản phẩm tính điểm ✔ |

## Chốt trạng thái ngày 17/10/2026 (đợt 2) — đang giữ nguyên

1. **49 chỉ tiêu: CHƯA phê duyệt bật kể cả mức A** (không thay đổi `requireConfirm`).
2. **Mốc lũy kế "hết Tuần 41": CHƯA xác nhận** (không dùng tính lũy kế).
3. **Chỉ tiêu BTC / UBND / KH tháng: CHƯA nhập.**
4. **Công thức suy đoán: KHÔNG được dùng** — chờ bảng ánh xạ được duyệt.
5. **JWT_SECRET: chưa xoay** (chỉ xoay khi có căn cứ rò rỉ hoặc cần thu hồi toàn bộ phiên).
6. **Biến môi trường Vercel: KHÔNG xóa trong bước này.**
7. **Nguyên tắc:** Quản trị hệ thống **không mặc nhiên** có thẩm quyền xác nhận số liệu thuế/kết quả nghiệp vụ — đã rà soát, ghi nhận 1 điểm tiềm ẩn cần xử lý khi được lệnh (module số liệu) — `RA_SOAT_AN_TOAN_DANG_NHAP_VA_PHAN_QUYEN.md` mục 5.
8. **Bước này: KHÔNG migration, KHÔNG seed, KHÔNG deploy thay đổi code** — chỉ cập nhật tài liệu.
9. **Gói công việc tiếp theo đề xuất (duy nhất 1 gói):** thiết lập **môi trường UAT độc lập** — `DE_XUAT_MOI_TRUONG_UAT.md` (chỉ đề xuất, chờ duyệt).

## Ghi chú

- Trạng thái "Đã có/hoàn thành" = đã triển khai & có bằng chứng commit — **không đồng nghĩa đã nghiệm thu** (nghiệm thu chờ UAT trên môi trường riêng, xem `DE_XUAT_MOI_TRUONG_UAT.md`).
- Việc bật tính điểm chính thức / bật kiểm soát số liệu: chờ quyết định của đơn vị sau khi trả lời các câu hỏi ở `ANH_XA_BIEU_MAU_DANH_GIA.md` mục 9.
- Các việc đang chờ đơn vị: YC-16.3 (nghĩa "số thuế phát sinh"), YC-14 (ngưỡng xếp loại), YC-19 (mốc/chỉ tiêu thật), YC-22 (quyết định bật mức nào — hiện chưa bật kể cả A), YC-23/24/25 (xác nhận mức đáp ứng khi UAT).

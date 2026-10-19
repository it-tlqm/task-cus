# BẢNG TRẠNG THÁI YÊU CẦU YC-01 → YC-29 (CẬP NHẬT 19/10/2026 — ĐỢT 3)

**Ngày cập nhật:** 19/10/2026 · **Nguồn đối chiếu:** lịch sử commit Git, `docs/GIAO_BAN_SO_LIEU_PHASE1_PHAN_TICH.md`, `docs/ANH_XA_BIEU_MAU_DANH_GIA.md`, các chốt ngày 17/10/2026 (đợt 2) và gói YC-26→29 ngày 19/10/2026 (đợt 3, nhánh `feat/yc26-29-metrics-dashboard`).

**Thang trạng thái:** ✅ Đã có đầy đủ · 🟡 Có một phần · ➖ Chưa có · ⏸ Chưa thể nghiệm thu do thiếu dữ liệu hoặc quy tắc.

> 📌 **Đợt 2 (17/10/2026):** đơn vị đã cung cấp nội dung cho 6 mã trước đây thiếu nguồn — **YC-10, YC-15, YC-17, YC-23, YC-24, YC-25** — đã cập nhật bên dưới. Không còn mã "chưa xác định".

> 📌 **Đợt 3 (19/10/2026):** bổ sung **YC-26 → YC-29** + kết quả rà soát P0 (14 bản ghi CB-014 nhập ngày 18/10). Gói này **đã triển khai Production ngày 19/10/2026** (merge commit `43dff84`) để nghiệm thu bằng **tài khoản DEMO** — **nghiệm thu thật 47/47 PASS**; **không migration, không đụng dữ liệu thật, không đụng dữ liệu CB-014** (chỉ tạo + xoá ngay 2 phân công test có audit); rollback code-first nếu cần. Chi tiết: `HANDOVER_YC26_29_2026-10-19.md`.

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
| YC-26 | **Bảng so sánh kết quả thu NSNN**: Chỉ tiêu BTC (năm) · Chỉ tiêu UBND tỉnh (năm) · Kế hoạch tháng · So với tháng trước · So với cùng kỳ năm trước | ✅ Đã có đầy đủ (tính năng, đợt 3) · ⏸ quy tắc chờ xác nhận | 5 dòng đối chiếu gắn tại khu Số liệu giao ban; **nguồn BTC/UBND nhận diện theo nhãn chứa "BTC"/"UBND" (kỳ Năm), KH tháng theo kỳ Tháng**; chỉ hiện tỷ lệ khi đủ tử số + mẫu số, thiếu → "Chưa có dữ liệu đối chiếu"; **không dùng chỉ tiêu giao nhãn [DEMO] làm nguồn chính thức** (chỉ tiêu DEMO hiện nhãn "Demo" riêng); **banner "Dữ liệu dùng thử/chưa đối soát — không sử dụng làm số liệu báo cáo chính thức." tại khu vực số liệu**; nhãn "Quy tắc đối chiếu: CHƯA XÁC NHẬN"; các số 1.685/1.700/200 tỷ chỉ là tham chiếu, KHÔNG nạp thành dữ liệu. Quy tắc đối chiếu (cùng kỳ năm trước) **chờ Hải quan xác nhận** |
| YC-27 | **Sửa lỗi không tìm thấy cán bộ CB-014 khi phân công nhập số liệu** | ✅ Đã có đầy đủ (đợt 3) | Nguyên nhân gốc: ô chọn người là `<select>` thường, gõ "CB-014" không tự tìm (dữ liệu và quyền của CB-014 vẫn đúng). Đã thay bằng **ô chọn người có tìm kiếm (mã/tên không dấu/đơn vị)** + backend **chặn người không tồn tại/đã ngừng công tác** + **chống trùng phân công** (gửi lặp → cập nhật/báo đã tồn tại, không tạo dòng trùng). Quyền và vai trò CB-014 **giữ nguyên** (có kiểm chứng) |
| YC-28 | **Phân công nhiều chỉ tiêu một lần** cho một cán bộ | ✅ Đã có đầy đủ (đợt 3) | Bộ chọn nhiều chỉ tiêu dạng checkbox: tìm theo tên/mã (không dấu), lọc theo nhóm, **Chọn tất cả đang lọc (N)** / **Bỏ chọn trong phạm vi lọc**, đếm số đã chọn; **mặc định KHÔNG chọn sẵn 49 chỉ tiêu**; **bước xác nhận riêng trước khi lưu**; lưu hàng loạt (≤100/lần) có chống trùng + ghi audit `METRIC_ADMIN_ASSIGNMENT_BULK_SAVED`; quyền "Được xác nhận" **mặc định TẮT** |
| YC-29 | **Trang chủ: số liệu giao ban dạng BẢNG** (Chỉ tiêu · Trong ngày · Tuần · Lũy kế tháng · Lũy kế năm · Trạng thái) | ✅ Đã có đầy đủ (đợt 3) + **fix hiển thị desktop 19/10** (`af80afd`) | Bảng có đường kẻ, dòng nhóm chỉ tiêu, định dạng số Việt Nam; **phân biệt rõ "chưa nhập" (—) với số 0 thực tế**; trạng thái tháng: Chưa nhập / Đã nhập / Đã xác nhận / **Đã chốt báo cáo**; giữ nguyên các thẻ KPI; khu so sánh YC-26 đặt tại trang Số liệu giao ban; desktop xem đủ, mobile **chỉ cuộn trong khung bảng** (trang không tràn ngang). **Fix 19/10:** khối trước đây chỉ nằm trong bố cục mobile nên desktop không thấy — đã bổ sung hiển thị trên desktop (vị trí như mobile, dưới khu lọc) + nâng kiểm thử sang "nhìn thấy thật" (`visible`); nghiệm thu Production 22/22 PASS |

## Chốt trạng thái ngày 19/10/2026 (đợt 3) — gói YC-26→29 + P0

1. **Triển khai Production ngày 19/10/2026 (theo chỉ đạo):** gói YC-26→29 (nhánh `feat/yc26-29-metrics-dashboard`) được merge vào `main` và deploy để **nghiệm thu bằng tài khoản DEMO**; không dùng tài khoản cán bộ thật để ghi thử; mọi thao tác test tạo/xoá phân công thử đều dọn sạch.
2. **KHÔNG migration, KHÔNG đổi cấu trúc dữ liệu** (schema giữ nguyên; gói chỉ thêm/sửa code ứng dụng).
3. **P0 (đọc, không sửa):** trong 14 bản ghi CB-014 nhập ngày 18/10 — **3 bản ghi khớp chính xác cột lũy kế năm nhóm Ô tô trên nguồn 16/10; 1 bản ghi (THU_NSNN/Hàng hóa khác) chưa đối chiếu được nguồn nhưng không thể là số phát sinh ngày; 2 bản ghi Than cốc không đủ căn cứ kết luận sai; 8 bản ghi còn lại bình thường**. **Không kết luận toàn bộ 14 bản ghi là sai.** **Không xoá/không sửa** — báo cáo bằng chứng đã lập, đề xuất phương án **chờ cấp có thẩm quyền quyết định**.
4. **Cảnh báo mềm chống nhập nhầm lũy kế + cảnh báo dữ liệu dùng thử** (đợt 3): khi lưu số liệu, hệ thống hiện cảnh báo "giá trị bất thường" nhưng **KHÔNG chặn lưu**; khi khu vực số liệu đang có dữ liệu DEMO trộn số thật, hiển thị banner **"Dữ liệu dùng thử/chưa đối soát — không sử dụng làm số liệu báo cáo chính thức."**; đều có ghi vết.
5. **YC-26:** quy tắc nhận diện nguồn đối chiếu (BTC/UBND theo nhãn; KH tháng theo kỳ Tháng; "cùng kỳ năm trước" dùng cột Lũy kế) **chờ Hải quan xác nhận** trước khi dùng chính thức — số 1.685/1.700/200 tỷ **không được nạp** như dữ liệu.
6. **49 chỉ tiêu: tiếp tục CHƯA bật kiểm tra** (không thay đổi `requireConfirm`); quyền "Được xác nhận" khi phân công hàng loạt **mặc định TẮT**.
7. **Bước này: KHÔNG seed dữ liệu thật, KHÔNG tạo chỉ tiêu giao ngoài môi trường test cục bộ**; mọi thao tác kiểm thử chỉ trên DB cục bộ (localhost:54329), có dọn sạch sau test.
8. **Tài liệu bàn giao đợt 3:** `HANDOVER_YC26_29_2026-10-19.md` (kèm báo cáo P0, bằng chứng kiểm thử API/UI, ảnh chụp).

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
- Các việc đang chờ đơn vị: YC-16.3 (nghĩa "số thuế phát sinh"), YC-14 (ngưỡng xếp loại), YC-19 (mốc/chỉ tiêu thật), YC-22 (quyết định bật mức nào — hiện chưa bật kể cả A), YC-23/24/25 (xác nhận mức đáp ứng khi UAT), **YC-26 (quy tắc đối chiếu "cùng kỳ năm trước" + nguồn BTC/UBND/KH tháng)**, **P0 đợt 3 (phương án xử lý các bản ghi CB-014: 3 ô khớp lũy kế năm nhóm Ô tô; 1 ô chưa đối chiếu được nguồn; 2 ô Than cốc cần nguồn nếu muốn chốt)**.

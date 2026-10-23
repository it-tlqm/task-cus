# S3 — Phụ lục danh mục 49 chỉ tiêu (snapshot đọc-only)

- Database: `talung_v3_phase_c (local test)`
- Contract: **APPROVED — S0_DECISION_LOG_2026-10-23**
- Kỳ chụp: tháng 10/2026; báo cáo tháng đã lưu: CÓ
- Production touched: **NO**

| # | Nhóm | Mã | Tên | Kiểu | Đơn vị | expectDaily | Bản ghi T10 | Trạng thái hiện tại | Target chính thức | Target DEMO | Đề xuất measureMode | Đề xuất tần suất |
|---:|---|---|---|---|---|---:|---:|---|---:|---:|---|---|
| 1 | THUE | `THU_NSNN` | Thu NSNN (số thuế phát sinh) | FLOW | VND/đồng | CÓ | 51 | DA_CHOT | 0 | 3 | PERIOD_FLOW | DAILY |
| 2 | THUE | `OTO_XE` | Số lượng xe ô tô nhập khẩu | FLOW | COUNT/xe | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 3 | THUE | `TRI_GIA_USD` | Trị giá hàng hóa nhập khẩu | FLOW | USD/USD | CÓ | 34 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 4 | THUE | `MGH_HOAN_BO` | Miễn giảm, hoàn thuế — số bộ hồ sơ | FLOW | COUNT/bộ | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 5 | THUE | `MGH_HOAN_TIEN` | Miễn giảm, hoàn thuế — số tiền | FLOW | VND/đồng | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 6 | THUE | `MGH_KT_BO` | Không thu — số bộ hồ sơ | FLOW | COUNT/bộ | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 7 | THUE | `MGH_KT_TIEN` | Không thu — số tiền | FLOW | VND/đồng | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 8 | THUE | `PHI_PS` | Phí hải quan — số phát sinh phải thu trong kỳ | FLOW | VND/đồng | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 9 | THUE | `PHI_THU` | Phí hải quan — số đã thu trong kỳ | FLOW | VND/đồng | CÓ | 17 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 10 | THUE | `PHI_LK_THU` | Phí hải quan — lũy kế số đã thu | DERIVED | VND/đồng | CÓ | 0 | CHUA_NHAP | 0 | 0 | DERIVED | DERIVED |
| 11 | THUE | `PHI_CON` | Phí hải quan — còn phải thu cuối kỳ | DERIVED | VND/đồng | CÓ | 0 | CHUA_NHAP | 0 | 0 | DERIVED | DERIVED |
| 12 | THUE | `NO_THUE` | Nợ thuế | BALANCE | VND/đồng | KHÔNG | 7 | DA_CHOT | 0 | 0 | SNAPSHOT | PERIOD_END |
| 13 | THUE | `XOA_NO` | Xóa nợ thuế — số tiền (lũy kế) | FLOW | VND/đồng | KHÔNG | 3 | DA_CHOT | 0 | 0 | CUMULATIVE | EVENT |
| 14 | KIM_NGACH | `DN_PS` | Số doanh nghiệp phát sinh | FLOW | COUNT/DN | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 15 | KIM_NGACH | `XNK_TK` | XNK — số lượng tờ khai | FLOW | COUNT/tờ khai | CÓ | 16 | DA_CHOT | 0 | 2 | PERIOD_FLOW | DAILY |
| 16 | KIM_NGACH | `XNK_USD` | XNK — kim ngạch | FLOW | USD/USD | CÓ | 16 | DA_CHOT | 0 | 2 | PERIOD_FLOW | DAILY |
| 17 | KIM_NGACH | `GS_TK` | Giám sát — số lượng tờ khai | FLOW | COUNT/tờ khai | CÓ | 16 | DA_CHOT | 0 | 2 | PERIOD_FLOW | DAILY |
| 18 | KIM_NGACH | `GS_USD` | Giám sát — kim ngạch | FLOW | USD/USD | CÓ | 16 | DA_CHOT | 0 | 2 | PERIOD_FLOW | DAILY |
| 19 | KIM_NGACH | `CDB_KHACH` | Cư dân biên giới — lượt hành khách xuất nhập cảnh | FLOW | COUNT/lượt | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 20 | KIM_NGACH | `CDB_TK` | Cư dân biên giới — tờ khai | FLOW | COUNT/tờ khai | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 21 | KIM_NGACH | `CDB_USD` | Cư dân biên giới — kim ngạch | FLOW | USD/USD | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 22 | THAM_VAN | `TV_TK` | Tờ khai tham vấn trong kỳ | FLOW | COUNT/tờ khai | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 23 | THAM_VAN | `TV_CHO` | Tờ khai chờ tham vấn | BALANCE | COUNT/tờ khai | KHÔNG | 3 | DA_CHOT | 0 | 0 | SNAPSHOT | PERIOD_END |
| 24 | QLRR | `RR_KH` | Hồ sơ xử lý thông tin — theo kế hoạch giao | FLOW | COUNT/hồ sơ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 25 | QLRR | `RR_NGOAI` | Hồ sơ xử lý thông tin — ngoài kế hoạch | FLOW | COUNT/hồ sơ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 26 | QLRR | `RR_TONG` | Hồ sơ xử lý thông tin — tổng | DERIVED | COUNT/hồ sơ | CÓ | 0 | CHUA_NHAP | 0 | 0 | DERIVED | DERIVED |
| 27 | QLRR | `RR_TIN` | Số tin thiết lập tiêu chí | FLOW | COUNT/tin | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 28 | KSBL | `KS_BG` | Bắt giữ, xử lý | FLOW | COUNT/vụ | CÓ | 1 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 29 | KSBL | `KS_VPHC` | Chủ trì xử lý VPHC | FLOW | COUNT/vụ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 30 | KSBL | `KS_VPHC_KS` | Vi phạm kiểm soát hải quan | FLOW | COUNT/vụ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 31 | KSBL | `KS_VPHC_TT` | Vi phạm thủ tục hải quan | FLOW | COUNT/vụ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 32 | KSBL | `KS_PHAT` | Số tiền phạt VPHC | FLOW | VND/đồng | CÓ | 4 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 33 | KSBL | `KS_HS` | Chủ trì xử lý hình sự | FLOW | COUNT/vụ | CÓ | 0 | CHUA_NHAP | 0 | 1 | PERIOD_FLOW | EVENT |
| 34 | KSBL | `KS_PH` | Phối hợp bắt giữ, xử lý | FLOW | COUNT/vụ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 35 | KSBL | `KS_TUYEN` | Tuyên truyền vận động quần chúng | FLOW | COUNT/cuộc | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 36 | KSBL | `KS_TUAN` | Tuần tra, kiểm soát hải quan | FLOW | COUNT/lượt | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 37 | KSBL | `KS_DTNCNTH` | Lập hồ sơ đối tượng nghiệp vụ trọng điểm | FLOW | COUNT/hồ sơ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 38 | KSBL | `KS_CA` | Xác lập chuyên án | FLOW | COUNT/chuyên án | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 39 | KSBL | `KS_MM` | Sử dụng máy móc, thiết bị chuyên dùng | FLOW | COUNT/lượt | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 40 | KSBL | `KS_CHO_GIO` | Huấn luyện chó nghiệp vụ — số giờ | FLOW | COUNT/giờ | CÓ | 3 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 41 | KSBL | `KS_CHO_LAN` | Huấn luyện chó nghiệp vụ — số lần | FLOW | COUNT/lần | CÓ | 2 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 42 | TONG_HOP | `KT_CUOC` | Số cuộc kiểm tra sau thông quan | FLOW | COUNT/cuộc | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 43 | TONG_HOP | `KT_QD` | Quyết định kiểm tra sau thông quan | FLOW | COUNT/QĐ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 44 | TONG_HOP | `KT_TB` | Thông báo kết quả kiểm tra sau thông quan | FLOW | COUNT/TB | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | DAILY |
| 45 | TONG_HOP | `KT_QD_AN` | Quyết định ấn định thuế | FLOW | COUNT/QĐ | CÓ | 16 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 46 | TONG_HOP | `KT_TIEN_AN` | Số tiền ấn định thuế | FLOW | VND/đồng | CÓ | 2 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 47 | TONG_HOP | `KT_TIEN_CN` | Số tiền chậm nộp | FLOW | VND/đồng | CÓ | 3 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 48 | TONG_HOP | `KT_QD_XP` | Quyết định xử phạt VPHC (KS sau thông quan) | FLOW | COUNT/QĐ | CÓ | 2 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |
| 49 | TONG_HOP | `KT_TIEN_XP` | Số tiền phạt qua kiểm tra sau thông quan | FLOW | VND/đồng | CÓ | 2 | DA_CHOT | 0 | 1 | PERIOD_FLOW | EVENT |

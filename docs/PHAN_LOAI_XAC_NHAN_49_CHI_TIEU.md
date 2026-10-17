# PHÂN LOẠI MỨC XÁC NHẬN CHO 49 CHỈ TIÊU SỐ LIỆU GIAO BAN — ĐỀ XUẤT

**Ngày lập:** 17/10/2026 · **Trạng thái:** ĐỀ XUẤT — **chưa bật/tắt bất kỳ cấu hình nào**, chờ lãnh đạo duyệt. **Chốt 17/10/2026 (đợt 2): chưa phê duyệt bật kể cả mức A — giữ nguyên đề xuất, chờ quyết định.**
**Bối cảnh:** hiện 49/49 chỉ tiêu đều tắt "Cần kiểm tra" (`requireConfirm=false`), dữ liệu nhập vào được ghi nhận ngay (RECORDED).

---

## 1. Ba mức dữ liệu (phân biệt rõ theo chỉ đạo)

| Mức | Trạng thái hệ thống | Ý nghĩa |
| :-- | :-- | :-- |
| **Đã nhập** | `RECORDED` (khi tắt quy trình) hoặc `DRAFT` (khi bật) | Bản ghi số liệu đã có trên hệ thống |
| **Đã xác nhận** | `CONFIRMED` (chỉ tồn tại khi chỉ tiêu bật "Cần kiểm tra") | Người có thẩm quyền đã kiểm tra đúng/sai |
| **Đã chốt báo cáo** | Phiên bản báo cáo (`BriefingReportVersion` — snapshot Word) | Bản báo cáo đã lưu, số liệu đóng băng, sửa nguồn sau không làm đổi bản đã lưu |

Điểm quan trọng: với 49 chỉ tiêu hiện tại, **chỉ tồn tại mức "Đã nhập"; muốn có mức "Đã xác nhận" phải bật quy trình cho chỉ tiêu đó**; mức "Đã chốt báo cáo" đã có sẵn cho mọi chỉ tiêu qua lưu phiên bản báo cáo.

## 2. Mốc lũy kế & chỉ tiêu giao — quyền và cơ chế đã có (không cần code thêm)

- **Mốc lũy kế** (`metric_baselines`): tạo ở trạng thái **Đề xuất (PROPOSED)** → lãnh đạo/quản trị bấm **"Xác nhận mốc"** → **CONFIRMED**; **chỉ mốc CONFIRMED mới được dùng để tính lũy kế**; lưu `người đề xuất / người xác nhận / thời điểm` (audit `BASELINE_PROPOSED`, `BASELINE_CONFIRMED`). Không cộng lặp ngày trong mốc (chỉ cộng phát sinh **sau** ngày mốc).
- **Chỉ tiêu giao** (`metric_plan_targets`): nhãn tự do ("Chỉ tiêu BTC", "Chỉ tiêu UBND", "KH tháng", "Chỉ tiêu giao"), kỳ hiệu lực YEAR/QUARTER/MONTH + năm + số kỳ; lưu người cập nhật + thời điểm; mọi thay đổi đều ghi audit.
- Hiện **đúng 0 mốc / 0 chỉ tiêu giao** trong DB — không có số liệu nào được seed sẵn; mốc "hết Tuần 41 (11/10/2026)" **chưa phải số liệu chính thức** cho đến khi lãnh đạo tự nhập và bấm xác nhận.

## 3. Đề xuất phân loại 49 chỉ tiêu theo mức cần kiểm tra

| Mức | Số lượng | Nguyên tắc |
| :-- | --: | :-- |
| **A — bắt buộc "Gửi kiểm tra → Xác nhận"** | 12 | Chỉ tiêu TIỀN và SỐ DƯ trọng yếu (ưu tiên theo chỉ đạo: Thu NSNN, Nợ thuế & số dư, kim ngạch tiền) |
| **B — nên kiểm tra** | 16 | Kim ngạch & số liệu trọng yếu xuất hiện trong báo cáo chính thức, chưa phải tiền |
| **C — nhập là ghi nhận** | 18 | Hoạt động nội bộ, ít rủi ro, không xuất hiện như con số trọng yếu |
| **D — dẫn xuất, không cần xác nhận** | 3 | Hệ thống tự tính từ chỉ tiêu đã nhập (không có ô nhập tay) |

### 3.1. Mức A — 12 chỉ tiêu (đề xuất bật quy trình xác nhận)

| # | Mã | Tên | Lý do |
| --: | :-- | :-- | :-- |
| 1 | `THU_NSNN` | Thu NSNN (số thuế phát sinh) | Chỉ tiêu tiền số 1, lên dashboard + báo cáo Word |
| 2 | `NO_THUE` | Nợ thuế (số dư) | Số dư — theo chỉ đạo "Nợ thuế và số dư" |
| 3 | `XOA_NO` | Xóa nợ thuế — số tiền (lũy kế) | Tiền, ảnh hưởng số dư nợ |
| 4 | `PHI_PS` | Phí hải quan — phát sinh phải thu trong kỳ | Tiền |
| 5 | `PHI_THU` | Phí hải quan — đã thu trong kỳ | Tiền |
| 6 | `MGH_HOAN_TIEN` | Miễn giảm, hoàn thuế — số tiền | Tiền (hoàn thuế) |
| 7 | `MGH_KT_TIEN` | Không thu — số tiền | Tiền |
| 8 | `KT_TIEN_AN` | Số tiền ấn định thuế (KTSTQ) | Tiền |
| 9 | `KT_TIEN_CN` | Số tiền chậm nộp (KTSTQ) | Tiền |
| 10 | `KT_TIEN_XP` | Số tiền phạt qua KTSTQ | Tiền |
| 11 | `KS_PHAT` | Số tiền phạt VPHC | Tiền |
| 12 | `TV_CHO` | Tờ khai chờ tham vấn (số dư) | Số dư liên tục — cập nhật theo ngày |

### 3.2. Mức B — 16 chỉ tiêu (nên kiểm tra)

`XNK_USD`, `XNK_TK` (kim ngạch & tờ khai XNK) · `GS_USD`, `GS_TK` (giám sát) · `CDB_USD`, `CDB_KHACH`, `CDB_TK` (cư dân biên giới) · `TRI_GIA_USD` (trị giá hàng NK) · `OTO_XE` (xe ô tô NK) · `DN_PS` (doanh nghiệp phát sinh) · `KS_BG` (bắt giữ, xử lý) · `KS_VPHC` (chủ trì xử lý VPHC) · `KS_PH` (phối hợp) · `KS_HS` (chủ trì xử lý hình sự) · `KT_CUOC` (số cuộc KTSTQ) · `KT_QD_AN` (QĐ ấn định thuế — cặp đếm của chỉ tiêu tiền A#8).

### 3.3. Mức C — 18 chỉ tiêu (nhập là ghi nhận)

`TV_TK` · `KT_QD` · `KT_TB` · `KT_QD_XP` · `KS_VPHC_KS` · `KS_VPHC_TT` · `KS_TUYEN` · `KS_TUAN` · `KS_DTNCNTH` · `KS_CA` · `KS_MM` · `KS_CHO_GIO` · `KS_CHO_LAN` · `RR_KH` · `RR_NGOAI` · `RR_TIN` · `MGH_HOAN_BO` · `MGH_KT_BO`.

### 3.4. Mức D — 3 chỉ tiêu dẫn xuất (không nhập tay, không cần xác nhận)

`RR_TONG` (= RR_KH + RR_NGOAI) · `PHI_LK_THU` (= PHI_THU + mốc số dư) · `PHI_CON` (= PHI_PS − PHI_THU + mốc số dư).

## 4. Cách triển khai sau khi được duyệt (không cần sửa code)

Bật **từng chỉ tiêu** tại: *Giao ban → Cấu hình số liệu → tab chỉ tiêu → ô "Cần kiểm tra (Nháp → Gửi → Xác nhận)"*.
Luồng sau khi bật: `DRAFT` (nháp) → người nhập bấm **Gửi kiểm tra** (`SUBMITTED`) → lãnh đạo **Xác nhận** (`CONFIRMED`) hoặc **Yêu cầu sửa** (`NEEDS_FIX`); mọi bước lưu vết người/thời điểm/giá trị trước-sau.

**Đề xuất thứ tự duyệt:** duyệt mức **A (12 chỉ tiêu)** trước → chạy thử 1–2 tuần → nếu êm mới xét tới mức B. **Không bật đồng loạt 49 chỉ tiêu.**

> **Chốt đợt 2 (17/10/2026):** đơn vị **chưa phê duyệt bật kể cả mức A** — giữ nguyên đề xuất, chỉ triển khai khi có quyết định mới.

## 5. Việc KHÔNG làm trong bước này

- Không thay đổi `requireConfirm` của bất kỳ chỉ tiêu nào (chờ duyệt).
- Không seed chỉ tiêu giao / mốc lũy kế / số liệu thật.
- Không chấm điểm, không xếp loại.

# S3 — RÀ SOÁT DANH MỤC & ĐỀ XUẤT CONTRACT YC-06 / YC-07

**Session:** S3 — Phase C  
**Branch:** `codex/v3-phase-c-metrics`  
**Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`  
**Database đã dùng:** `talung_v3_phase_c` (localhost, test)  
**Trạng thái:** `WAIT_CONTRACT` — **chưa sửa schema/API dùng chung với S2**  
**Ngày:** 23/10/2026

> Tài liệu này là **báo cáo rà soát + đề xuất**. Không phải quyết định nghiệp vụ, không phải lệnh triển khai, không phải xác nhận Production.

---

## 0. Kết luận điều hành

1. Danh mục hiện có **49 chỉ tiêu active / 6 nhóm / 5 phân loại**. Cấu trúc đủ để tiếp tục, nhưng **chưa đủ để biểu diễn đúng 6 trạng thái dữ liệu** mà YC-06 yêu cầu.
2. Trong database test: **49/49 chỉ tiêu giao hiện tại là `[DEMO]`**, **0 chỉ tiêu giao chính thức**. Vì vậy mọi tỷ lệ chính thức hiện phải là **“Chưa giao chỉ tiêu”**, không phải 0% và không phải tỷ lệ DEMO.
3. **636 bản ghi** tháng 10/2026 đều là `RECORDED`; **0 bản ghi `CONFIRMED`**. Báo cáo tháng 10 đã có phiên bản lưu, nên logic hiện tại gắn `LOCKED` cho mọi chỉ tiêu có bản ghi — kể cả khi chưa ai xác nhận.
4. Công thức `%` hiện tại có 4 lỗ hổng contract: không lọc chỉ tiêu giao theo đúng năm/kỳ; không phân biệt 0 với thiếu; không có chiều đánh giá; không có trạng thái nguồn/chỉ tiêu giao.
5. **Đề nghị S0 chốt 12 câu hỏi contract** trong `S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md` trước khi S3 sửa `metrics.ts`, API `/api/metrics/*`, `/giao-ban`, `/giao-ban/cau-hinh` hay schema.
6. Đã dựng **mock/pure test 43/43 PASS** cho các trạng thái và quy tắc tỷ lệ đề xuất; test không kết nối DB/API, không dùng Production.

---

## 1. Phạm vi, phương pháp và bằng chứng

### 1.1. Đã làm

- Đọc master plan, assignment card S3, biên bản YC-01 → YC-07, các tài liệu giao ban hiện có.
- Đọc mã nguồn: `src/server/metrics.ts`, `src/app/api/metrics/summary/route.ts`, `src/app/api/metrics/admin/route.ts`, `src/app/giao-ban/page.tsx`, `src/app/giao-ban/cau-hinh/page.tsx`, `src/components/dashboard/TaxSummarySection.tsx`, `prisma/schema.prisma`.
- Chạy truy vấn **read-only** trên `talung_v3_phase_c`; sinh snapshot và phụ lục 49 chỉ tiêu.
- Viết mock/pure test cho trạng thái dữ liệu, trạng thái chỉ tiêu giao và tỷ lệ.

### 1.2. Bằng chứng

| Bằng chứng | Đường dẫn |
|---|---|
| Snapshot danh mục 49 chỉ tiêu (JSON) | `docs/evidence/multi-session/S3/catalog-snapshot.json` |
| Phụ lục bảng 49 chỉ tiêu | `docs/evidence/multi-session/S3/catalog-appendix.md` |
| Script rà soát read-only | `scripts/review-phase-c-catalog.ts` |
| Mock/pure test contract | `scripts/test-phase-c-contract-proposal.ts` |
| Câu hỏi contract gửi S0 | `docs/evidence/multi-session/S3/S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md` |
| Handoff | `docs/evidence/multi-session/S3/S3_HANDOFF_WAIT_CONTRACT_2026-10-23.md` |

### 1.3. Giới hạn

- Chỉ đọc database test của worktree S3; **không đọc/ghi Production**.
- Chưa chạy UAT, chưa sửa dữ liệu, chưa tạo chỉ tiêu giao chính thức.
- Các con số DEMO trong DB chỉ là fixture; không dùng làm căn cứ công bố.
- Chưa kết luận thay nghiệp vụ về C1 (chỉ tiêu nào được giao, chu kỳ, chiều đánh giá).

---

## 2. Snapshot danh mục

### 2.1. Số lượng

| Hạng mục | Giá trị | Ghi chú |
|---|---:|---|
| Nhóm chỉ tiêu | 6 | THUE, KIM_NGACH, THAM_VAN, QLRR, KSBL, TONG_HOP |
| Chỉ tiêu | 49 | tất cả `active=true` |
| Phân loại | 5 | THU_NSNN: 3; TRI_GIA_USD: 2 |
| `valueKind` | FLOW 44 · BALANCE 2 · DERIVED 3 | BALANCE: NO_THUE, TV_CHO; DERIVED: PHI_LK_THU, PHI_CON, RR_TONG |
| `expectDaily=true` | 46/49 | chỉ NO_THUE, XOA_NO, TV_CHO là false |
| `requireConfirm=true` | 0/49 | tất cả đang ghi nhận trực tiếp `RECORDED` |
| Chỉ tiêu giao | 49 | **49 DEMO, 0 chính thức** |
| Mốc lũy kế | 47 | **47 DEMO, 0 chính thức** |
| Bản ghi tháng 10/2026 | 636 | tất cả `RECORDED`; 152 bản ghi giá trị 0; 17 ngày có dữ liệu (02–18/10) |
| Bản ghi `CONFIRMED` | 0 | chưa có xác nhận |
| Phiên bản báo cáo tháng 10 | 1 | làm logic hiện tại gắn `LOCKED` cho mọi chỉ tiêu có bản ghi |
| Phân công nhập liệu | 14 | có dòng trùng cùng người/nhóm; cần kiểm tra fixture |

### 2.2. Các chỉ tiêu không có dữ liệu tháng 10 (trong fixture)

`PHI_LK_THU`, `PHI_CON`, `RR_TONG` (DERIVED) và `KS_HS` (FLOW, 0 bản ghi).

### 2.3. Các chỉ tiêu không có chỉ tiêu giao (kể cả DEMO)

`TV_CHO`, `RR_TONG`, `PHI_LK_THU`, `PHI_CON`, `NO_THUE`, `XOA_NO`.

> Đây là 6 chỉ tiêu **không nhất thiết phải có chỉ tiêu giao**. Không được tự gán mục tiêu cho đủ 49.

---

## 3. Phát hiện rà soát

### F1 — 100% chỉ tiêu giao hiện tại là DEMO, không có chỉ tiêu chính thức

- `catalog-snapshot.json`: `officialTargets = 0`, `demoTargets = 49`.
- UI `/giao-ban` có ẩn tỷ lệ của chip `[DEMO]`, nhưng `computeMetricSummary` vẫn tính `percent` cho DEMO và trả về API.
- `computeMetricComparison` lọc DEMO bằng regex `^\\s*\\[DEMO`, không có cờ dữ liệu chính thức ở tầng API.
- Hệ quả: bất kỳ consumer nào đọc `targets[].percent` hoặc `comparison` đều có thể dùng nhầm DEMO như số chính thức.

**Đề xuất:** API phải trả cờ `isOfficial`/`dataSource` (hoặc tương đương) cho chỉ tiêu giao và mốc; không dựa vào regex nhãn. Chỉ tiêu DEMO không được tính vào `CHUA_GIAO`/`ĐÃ GIAO` chính thức và không được dùng để tính `%` chính thức.

### F2 — Mô hình trạng thái hiện tại không biểu diễn được YC-06

`computeMetricSummary` chỉ trả:

```ts
type MetricMonthState = "NONE" | "RECORDED" | "CONFIRMED" | "LOCKED";
```

Cách gán hiện tại (`metrics.ts:632-637`):

- `NONE`: không có bản ghi trong tháng.
- `RECORDED`: có bản ghi, kể cả `DRAFT`, `SUBMITTED`, `NEEDS_FIX`.
- `CONFIRMED`: có **ít nhất một** bản ghi `CONFIRMED`, dù còn ngày khác chưa xác nhận.
- `LOCKED`: có bất kỳ phiên bản báo cáo tháng, dù chưa xác nhận.

Thiếu các trạng thái: `CHƯA_ĐỦ_KỲ`, `KHÔNG_PHÁT_SINH`, `KHÔNG_ÁP_DỤNG`, `CHƯA_PHÂN_CÔNG`, `ĐÃ_NHẬP + THIẾU_KỲ`.

**Quan sát runtime read-only (tháng 10/2026, DB test):**

| Mã | Giá trị tháng | Giá trị năm | `monthState` hiện tại | Vấn đề |
|---|---:|---:|---|---|
| `PHI_LK_THU` | 2.911.400.000 | 56.111.400.000 | `NONE` | Có số DERIVED nhưng báo “Chưa nhập” vì không có bản ghi trực tiếp |
| `PHI_CON` | 558.210.000 | 4.658.210.000 | `NONE` | Cùng lỗi; số còn phải thu vẫn hiển thị |
| `RR_TONG` | 83 | 1.381 | `NONE` | Cùng lỗi |
| `KS_HS` | `null` | 5 | `NONE` | Năm có mốc DEMO nhưng tháng không có bản ghi; target năm 7 hiển thị 71,4% bên cạnh trạng thái tháng “Chưa nhập” |

**Hệ quả:** trạng thái đang được suy từ **bản ghi trực tiếp**, không từ **giá trị đang hiển thị**. Với DERIVED/BALANCE, một dòng có thể vừa có số vừa bị gắn “Chưa nhập”. Ngoài ra target kỳ năm có thể đứng cạnh trạng thái kỳ tháng mà không ghi rõ kỳ, dễ gây hiểu nhầm tỷ lệ.

**Đề xuất:** trạng thái phải tính trên **nguồn của giá trị đang hiển thị** (entry/baseline/derivation) và phải trả kèm `period` của target. Với DERIVED, nếu có giá trị thì không được là `CHUA_NHAP`; nếu thiếu input thì ghi “Thiếu dữ liệu thành phần”.


### F3 — Công thức `%` có thể dùng sai chỉ tiêu giao

Tại `metrics.ts:337`:

```ts
prisma.metricPlanTarget.findMany({ where: { metricId: { in: metricIds } } })
```

Không lọc `year`. Tại `metrics.ts:596-607`, mọi target của chỉ tiêu đều được map; `periodType` quyết định cột, nhưng **không kiểm tra** `t.year` và `t.periodNo` với kỳ đang xem. Hệ quả:

- Target năm 2025 vẫn có thể hiển thị cạnh số năm 2026.
- Target tháng 9 vẫn có thể tính trên cột tháng 10.
- Target quý 4 vẫn có thể tính trên cột quý đang xem khác.
- Nhiều target cùng kỳ không có quy tắc chọn; UI hiển thị tất cả.
- Target kỳ năm/quý có thể đứng cạnh trạng thái kỳ tháng mà không ghi rõ kỳ, ví dụ `KS_HS` target năm 7 → 71,4% trong khi trạng thái tháng là “Chưa nhập”.

**Đề xuất:** target phải khớp chính xác `year + periodType + periodNo` với cột đang xem; target khác kỳ không được dùng để tính. Nếu cần hiển thị target khác kỳ, ghi rõ “kỳ khác”, không trộn vào %.

### F4 — 0, thiếu, âm và mẫu số 0 chưa được phân biệt

`metrics.ts:603-606`:

```ts
const targetValue = Number(t.valueNumeric);
const percent = col !== null && targetValue > 0
  ? Math.round((col / targetValue) * 1000) / 10
  : null;
```

Các trường hợp đều trả `null` như nhau:

- chưa có target;
- target = 0;
- target < 0;
- thực hiện thiếu;
- thực hiện chưa xác nhận;
- lệch đơn vị.

UI chỉ hiện `—`, không phân biệt “Chưa giao chỉ tiêu”, “Mẫu số 0”, “Thiếu dữ liệu thực hiện”. Trái nguyên tắc “thiếu khác 0” và “không ra 0% khi thiếu mẫu số”.

**Đề xuất:** trả `percentState` + `reason` thay vì chỉ `number | null`; xem bảng §5.3.

### F5 — Chưa có chiều đánh giá; UI tự gắn màu “đạt/vượt”

`/giao-ban/page.tsx:395-402`:

```tsx
t.percent >= 100 ? "xanh" : "vàng"
```

Không có `direction` trên target. Với chỉ tiêu “càng thấp càng tốt” (vi phạm, chậm nộp, nợ, tồn chờ…), xanh khi ≥100% là sai nghiệp vụ. C1 chưa chốt chiều đánh giá.

**Đề xuất:** thêm `direction` (C1) và **không tô màu đạt/vượt** khi `direction = CHUA_CHOT`. Chỉ hiển thị “thực hiện / chỉ tiêu” trung tính.

### F6 — Lũy kế / DERIVED chưa rõ nghĩa

- `PHI_LK_THU` (DERIVED, `includeBaseline=true`, term `PHI_THU`) và `PHI_CON` (DERIVED, `includeBaseline=true`, terms `PHI_PS - PHI_THU`) đều **không có mốc LEDGER** trên chính chỉ tiêu DERIVED. `valueOf` chỉ tìm baseline `LEDGER` của `metricId` hiện tại (`metrics.ts:492`), không lấy baseline của term. Vì vậy hiện chúng chỉ cộng bản ghi trong kỳ, không phải “lũy kế đã thu” hay “còn phải thu cuối kỳ” như tên gọi.
- `XOA_NO` có nhãn “(lũy kế)” nhưng `valueKind=FLOW`; cột tháng chỉ cộng phát sinh trong tháng, cột năm mới dùng mốc YEAR. Nhãn dễ gây hiểu nhầm.
- `NO_THUE` và `TV_CHO` là BALANCE (số dư thời điểm), nhưng UI dùng chung `—` = “chưa nhập”; chưa có nhãn “chưa có số dư”.

**Đề xuất:** bổ sung `measureMode` tường minh (`PERIOD_FLOW`, `CUMULATIVE`, `SNAPSHOT`, `DERIVED`) và `baselineScope`; không suy nghĩa chỉ từ `valueKind` + tên. S2/S0 cần chốt cách tính `PHI_*`, `XOA_NO`, `NO_THUE`, `TV_CHO`.

### F7 — Gộp phân loại có thể che dữ liệu thiếu

`metrics.ts:545-551` dùng `sumNullable`; nếu một phân loại có dữ liệu và phân loại khác `null`, tổng chỉ cộng phần có. Ví dụ `THU_NSNN` có 3 phân loại; thiếu `THAN_COC` nhưng có `O_TO` và `KHAC` thì tổng vẫn ra số, không báo thiếu.

**Đề xuất:** trả `classificationComplete`/`missingClassifications`; nếu chỉ tiêu có phân loại bắt buộc thì `%` tổng chỉ tính khi đủ, hoặc ghi rõ “tổng chưa đủ phân loại”.

### F8 — Cảnh báo “Thiếu N ngày” dựa trên lịch, không dựa trên lịch nghiệp vụ

`metrics.ts:620-630` lấy mọi ngày lịch trong tuần, trừ ngày tương lai; không trừ cuối tuần, ngày lễ, ngày không áp dụng, ngày chưa được phân công. Trong fixture, dữ liệu dừng 18/10 nên mọi chỉ tiêu FLOW `expectDaily` sẽ báo thiếu 5 ngày (19–23/10).

**Đề xuất:** chỉ báo thiếu khi có `expectedCalendar`/`expectedSlots` được duyệt; nếu chưa có, hiển thị “Số ngày có bản ghi” thay vì “Thiếu N ngày”. Không tự coi 5 ngày lịch là 5 ngày nghiệp vụ.

### F9 — Quyền cấu hình chỉ tiêu giao còn dùng `isMetricsAdmin`

`isMetricsAdmin` (`metrics.ts:49-52`) cho phép `UNIT_LEADER` hoặc người có `system.config`. API target dùng đúng cổng này (`api/metrics/admin/route.ts:245`).

Trái nguyên tắc YC-07: “không cấp `system.config` chỉ để nhập chỉ tiêu nghiệp vụ”. Cần quyền nghiệp vụ riêng, ví dụ `giao_ban.target.view/manage/confirm`, và `SYSTEM_ADMIN` không mặc nhiên có quyền nghiệp vụ.

### F10 — Thiếu lịch sử/nguồn/trạng thái của chỉ tiêu giao

`MetricPlanTarget` (`schema.prisma:1543-1560`) chỉ có `label`, kỳ, giá trị, `note`, `updatedById`, `createdAt/updatedAt`. Không có:

- `status` (nháp/xác nhận/khóa/hủy);
- `sourceType`/`sourceNote`/`sourceRef` bắt buộc;
- `direction`;
- `unitType` snapshot / kiểm tra đơn vị;
- revision history (old/new, lý do, người sửa);
- `scope` (đơn vị/phòng ban).

Audit hiện tại có `TARGET_CREATED/UPDATED/DELETED` nhưng update chỉ ghi dữ liệu mới, không ghi giá trị cũ; không thay thế được lịch sử điều chỉnh.

### F11 — Chưa có chiều phạm vi đơn vị

`metric_daily_entries` không có `unit_id` (`schema.prisma:1478-1497`); `metric_plan_targets` không có `scope`. Mọi bản ghi và target hiện là **toàn hệ thống**. YC-07 nói “theo phạm vi”; nếu nghiệp vụ cần chỉ tiêu theo phòng ban/đơn vị, đây là migration dùng chung với S2, không thể vá nhỏ.

### F12 — Vài điểm dữ liệu danh mục cần làm rõ (không phải lỗi chắc chắn)

- `TRI_GIA_USD`, `XNK_USD`, `GS_USD`, `CDB_USD` hiển thị đơn vị `USD/USD`; nên chuẩn hóa nhãn.
- `XOA_NO` là FLOW nhưng tên “lũy kế”; cần chốt `measureMode`.
- `expectDaily=true` cho cả 3 chỉ tiêu DERIVED (PHI_LK_THU, PHI_CON, RR_TONG) là cấu hình gây nhiễu, dù `missingDates` chỉ tính cho FLOW.
- 14 phân công có dòng trùng cùng người/nhóm; cần kiểm tra fixture, không phải dữ liệu chính thức.

---

## 4. Đề xuất mô hình trạng thái dữ liệu (YC-06)

### 4.1. Hai trục thay vì một enum

**Trục 1 — `recordState`** (trạng thái bản ghi):

| Giá trị | Điều kiện | Ý nghĩa |
|---|---|---|
| `CHUA_NHAP` | Không có bản ghi hợp lệ trong kỳ | Chưa có số liệu |
| `DA_NHAP` | Có bản ghi, chưa phải tất cả `CONFIRMED` | Đã nhập, chưa xác nhận |
| `DA_XAC_NHAN` | Tất cả bản ghi bắt buộc `CONFIRMED` | Đã xác nhận |
| `DA_CHOT` | Có phiên bản báo cáo kỳ | Đã chốt báo cáo |
| `KHONG_PHAT_SINH` | Có xác nhận “không phát sinh” cho toàn kỳ | 0 có căn cứ |
| `KHONG_AP_DUNG` | Chỉ tiêu/kỳ không thuộc phạm vi | Không áp dụng |

**Trục 2 — `coverage`** (độ đầy đủ):

| Giá trị | Điều kiện |
|---|---|
| `DU_KY` | Đủ số slot/ngày dự kiến |
| `THIEU_KY` | Có dữ liệu nhưng thiếu slot/ngày dự kiến |
| `KHONG_XAC_DINH` | Chưa có lịch/kỳ dự kiến hoặc chỉ tiêu không theo ngày |

### 4.2. Mapping ra nhãn hiển thị

Ưu tiên từ trên xuống:

| Điều kiện | Nhãn hiển thị | Ghi chú |
|---|---|---|
| `KHONG_AP_DUNG` | **Không áp dụng** | Không hiện 0 |
| `CHUA_NHAP` | **Chưa nhập** | Không hiện 0 |
| `KHONG_PHAT_SINH` | **Không phát sinh** | 0 có xác nhận/căn cứ |
| `DA_CHOT` | **Đã chốt báo cáo** | Kèm ngày/phiên bản |
| `DA_XAC_NHAN` | **Đã xác nhận** | |
| `DA_NHAP` + `THIEU_KY` | **Chưa đủ kỳ** | Kèm “đã nhập · thiếu N ngày” nếu có lịch |
| `DA_NHAP` + `DU_KY`/`KHONG_XAC_DINH` | **Đã nhập** | |

> Một dòng có thể vừa “đã nhập” vừa “chưa đủ kỳ”; vì vậy không nên ép thành một enum duy nhất. Nếu S0 muốn một enum hiển thị, dùng mapping trên và vẫn giữ `coverage` trong payload.

### 4.3. Quy tắc bắt buộc

- Không có bản ghi → `null`/`CHUA_NHAP`, **không** 0.
- Bản ghi giá trị 0 đã nhập → vẫn là dữ liệu (`DA_NHAP`/`DA_XAC_NHAN`), chỉ thành `KHONG_PHAT_SINH` khi có xác nhận không phát sinh.
- `DA_CHOT` không đồng nghĩa `DA_XAC_NHAN`; phải giữ cả hai thông tin.
- `KHONG_AP_DUNG` phải có căn cứ cấu hình (metric/kỳ/phạm vi), không suy từ việc thiếu bản ghi.

---

## 5. Đề xuất cấu hình chỉ tiêu giao (YC-07)

### 5.1. Trường tối thiểu

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `metricId` | Có | Chỉ tiêu active |
| `classificationId` | Không | Nếu có, phải thuộc đúng metric |
| `scope` | Có | `TOAN_CUC` / `DON_VI` / `PHONG_BAN` — chờ Q1 |
| `periodType` | Có | `YEAR` / `QUARTER` / `MONTH` |
| `year`, `periodNo` | Có | `periodNo=null` nếu YEAR |
| `labelCode` | Có | `BTC`, `UBND`, `KH_THANG`, `KH_QUY`, `KH_NAM`, `KHAC` — tránh free text |
| `label` | Có | Tên hiển thị |
| `valueBase` | Có | Lưu đơn vị gốc; `>= 0` |
| `unitType`/`unitLabel` snapshot | Có | Phải khớp metric tại thời điểm tạo |
| `direction` | Có | `CAO_HON_TOT` / `THAP_HON_TOT` / `TRUNG_TINH` / `CHUA_CHOT` |
| `sourceType`, `sourceNote`, `sourceRef` | Có (chính thức) | Văn bản/quyết định/căn cứ |
| `status` | Có | `DRAFT` → `CONFIRMED` → `LOCKED`; `VOID`/`SUPERSEDED` khi thay thế |
| `effectiveFrom/To` | Khuyến nghị | Hiệu lực kỳ |
| `createdBy`, `confirmedBy`, `confirmedAt` | Có | Tách người nhập/người xác nhận nếu cần |
| `note` | Không | Ghi chú |
| `revisionNo`/bảng revision | Có | Lưu old/new, lý do, thời điểm |

### 5.2. Quy tắc validate

1. Chỉ tiêu phải tồn tại và `active`; classification phải thuộc đúng metric.
2. `periodType`/`periodNo`/`year` hợp lệ; target chỉ dùng cho đúng cột kỳ đang xem.
3. `valueBase >= 0`; từ chối số âm. Target 0 phải có quy tắc riêng (xem 5.3), không tự coi là “không giao”.
4. Đơn vị target phải khớp đơn vị metric; nếu metric đổi đơn vị/scale, target cũ phải giữ snapshot và cảnh báo.
5. Không cho hai target trùng `metric + classification + labelCode + period + scope`; nếu muốn nhiều phương án (BTC/UBND/KH) thì khác `labelCode`.
6. Target chính thức phải `CONFIRMED` và có nguồn; target `DRAFT` chỉ hiển thị “nháp”, không dùng tính % chính thức.
7. Sửa target đã `CONFIRMED` phải tạo revision; sửa target đã `LOCKED` phải qua quy trình mở khóa.
8. Xóa target phải là `VOID`/`SUPERSEDED` có lý do, không xóa cứng mất lịch sử.
9. `DEMO` phải là cờ dữ liệu (`isOfficial=false`), không dựa vào nhãn `[DEMO]`.

### 5.3. Chính sách tính `%`

| Tình huống | Kết quả | Lý do |
|---|---|---|
| Không áp dụng | Không tính | `KHONG_AP_DUNG` |
| Không có target | Không tính | `THIEU_CHI_TIEU` / “Chưa giao chỉ tiêu” |
| Target `DRAFT` | Không tính chính thức | `CHI_TIEU_CHUA_XAC_NHAN` (có thể hiện “tạm tính” nếu S0 cho phép) |
| Target = 0 | Không tính | `MAU_SO_BANG_0`; không trả 0% |
| Target < 0 | Không tính | `CHI_TIEU_AM` |
| Thực hiện thiếu bản ghi | Không tính | `THIEU_THUC_HIEN` |
| Thực hiện thiếu kỳ | Không tính chính thức | `THUC_HIEN_CHUA_DU_KY` (có thể “tạm tính”) |
| Thực hiện chưa xác nhận + metric `requireConfirm` | Không tính | `THUC_HIEN_CHUA_XAC_NHAN` |
| Lệch đơn vị | Không tính | `LECH_DON_VI` |
| `direction=THAP_HON_TOT` hoặc `CHUA_CHOT` | Không tự tính đạt/vượt | `CHUA_CO_QUY_TAC_CHIEU`; hiển thị trung tính |
| Thực hiện 0 đã xác nhận, target > 0 | **0,00%** | 0 là dữ liệu thật, không phải thiếu |
| Hợp lệ | `actual / target × 100` | 2 chữ số thập phân, làm tròn half-up |
| Đã chốt báo cáo | Vẫn tính theo snapshot | Ghi nhãn “Đã chốt” |

**Quy ước hiển thị đề xuất:**

- `null`/không tính → `—` + lý do; **không** `0%`.
- Có tính → `xx,xx%` (2 chữ số thập phân).
- Chưa chốt chiều → không tô xanh/đỏ; chỉ hiện số và nhãn “chưa có quy tắc đánh giá”.
- `0%` chỉ xuất hiện khi tử số = 0 và mẫu số > 0, cả hai đều hợp lệ.

---

## 6. Đề xuất phân loại danh mục (chờ C1)

Không thay đổi 49 mã, không thêm/bớt chỉ tiêu trước khi C1 chốt. Chỉ đề xuất metadata để biểu diễn đúng:

| Nhóm | Số chỉ tiêu | Điểm cần chốt |
|---|---:|---|
| THUE | 13 | THU_NSNN có 3 phân loại; PHI_LK_THU/PHI_CON là DERIVED; XOA_NO là lũy kế; NO_THUE là số dư |
| KIM_NGACH | 8 | Các chỉ tiêu FLOW theo ngày; 4 chỉ tiêu USD |
| THAM_VAN | 2 | TV_TK FLOW; TV_CHO BALANCE |
| QLRR | 4 | RR_TONG DERIVED; 3 chỉ tiêu FLOW |
| KSBL | 14 | Nhiều chỉ tiêu sự kiện (KS_HS, KS_PHAT…) không phát sinh hằng ngày |
| TONG_HOP | 8 | Nhiều chỉ tiêu sự kiện (KT_QD_AN, KT_TIEN_AN, KT_QD_XP…) |

**Đề xuất `measureMode`:**

- `PERIOD_FLOW`: 43 chỉ tiêu FLOW thông thường.
- `CUMULATIVE`: `XOA_NO`, `PHI_LK_THU` (cần chốt cách cộng mốc).
- `SNAPSHOT`: `NO_THUE`, `TV_CHO`.
- `DERIVED`: `RR_TONG`, `PHI_CON`.
- `PHI_LK_THU` có thể là `DERIVED + CUMULATIVE`; cần C1/S2 chốt một cách biểu diễn.

**Đề xuất tần suất:** chỉ giữ `expectDaily=true` cho chỉ tiêu thực sự phát sinh hằng ngày. Các mã sự kiện cần C1 xác nhận, ví dụ: `KS_BG`, `KS_HS`, `KS_PHAT`, `KS_CHO_GIO`, `KS_CHO_LAN`, `KT_QD_AN`, `KT_TIEN_AN`, `KT_TIEN_CN`, `KT_QD_XP`, `KT_TIEN_XP`, `XOA_NO`. Không tự đổi cấu hình khi chưa duyệt.

**Đề xuất target applicability:** `PENDING_C1` cho cả 49. Không mặc định gán target cho mọi chỉ tiêu; 6 chỉ tiêu hiện không có target có thể là `KHONG_AP_DUNG` nếu C1 xác nhận.

---

## 7. Test/mock đã dựng

### 7.1. Nội dung

`scripts/test-phase-c-contract-proposal.ts` — pure functions + fixture, **không DB/API**:

- 12 test trạng thái dữ liệu (A1–A12).
- 8 test trạng thái chỉ tiêu giao (B1–B8).
- 18 test tỷ lệ (C1–C18).
- 5 test gộp phân loại (D1–D5).

### 7.2. Kết quả

```text
PASS 43/43, FAIL 0
```

Các điểm đã khóa bằng test:

- thiếu dữ liệu ≠ 0;
- 0 đã nhập ≠ không phát sinh;
- 0 đã xác nhận + target > 0 → 0,00% hợp lệ;
- target 0 → không tính, không trả 0%;
- target khác năm/kỳ → không dùng;
- target nháp → không tính chính thức;
- thực hiện thiếu kỳ/chưa xác nhận → không tính chính thức (trừ khi policy cho phép tạm tính);
- lệch đơn vị → không tính;
- chiều “thấp hơn tốt”/chưa chốt → không tự gắn đạt/vượt;
- thiếu phân loại → không cộng như đủ.

### 7.3. Cách chạy

```powershell
npx tsx scripts/test-phase-c-contract-proposal.ts
```

### 7.4. Giới hạn

Đây là **executable proposal**, không phải logic production. Khi contract được chốt, S3 sẽ thay bằng implementation thật và test tích hợp; không import script này vào app.

---

## 8. Những gì S3 chưa làm

- **Chưa sửa** `prisma/schema.prisma`, migration, `src/server/metrics.ts`, API `/api/metrics/*`.
- **Chưa sửa** `/giao-ban`, `/giao-ban/cau-hinh`, Dashboard, quyền, audit.
- **Chưa tạo/sửa/xóa** chỉ tiêu giao, mốc lũy kế, bản ghi.
- **Chưa đổi** `requireConfirm`, `expectDaily`, `showOnDashboard`.
- **Chưa dùng** Production; mọi truy vấn là local test read-only.
- **Chưa chốt** C1, B1/B2, quyền, scope.

---

## 9. Đề nghị S0

1. Chốt các câu hỏi trong `S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md`, tối thiểu Q1–Q6 và Q8–Q10.
2. Chỉ định owner schema: S2 (shared) hay S3 (target-only) cho các trường mới.
3. Xác nhận danh sách chỉ tiêu giao chính thức + chu kỳ + chiều đánh giá (C1) hoặc chấp nhận trạng thái `PENDING_C1`.
4. Xác nhận chính sách `%` (mục 5.3) và mức hiển thị (chỉ `/giao-ban` hay cả Dashboard).
5. Sau khi có xác nhận bằng văn bản, S3 mới bắt đầu sửa code trên nhánh `codex/v3-phase-c-metrics`.

---

**KẾT LUẬN:** Danh mục 49 chỉ tiêu có thể giữ nguyên, nhưng **contract dữ liệu và chỉ tiêu giao phải chốt trước**. Đề xuất tách `recordState`/`coverage`, thêm trạng thái + nguồn + chiều cho target, và chỉ tính `%` khi target/actual hợp lệ. Không coi thiếu là 0; không tự gắn đạt/vượt; không dùng Production.

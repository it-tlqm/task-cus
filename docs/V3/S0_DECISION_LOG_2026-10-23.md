# S0 — DECISION LOG ĐÃ ĐƯỢC CHỦ DỰ ÁN CHẤP THUẬN

**Ngày chốt:** 23/10/2026  
**Người chốt:** Chủ dự án (xác nhận trong phiên điều phối S0: “tất cả đều như đề xuất”)  
**Phạm vi:** S3 — YC-06/07; S6 — YC-09/10/11  
**Trạng thái:** **APPROVED** — dùng làm căn cứ triển khai có kiểm soát.  
**Không phải lệnh deploy Production.**

> Các quyết định dưới đây chấp thuận đúng các đề xuất trong handoff S3/S6 và tài liệu spec. Không tự mở rộng thêm quyền, role, công thức hoặc phạm vi dữ liệu ngoài nội dung đã chốt.

---

## 1. S3 — YC-06 / YC-07

### 1.1. Quyết định APPROVED

| Mã | Quyết định đã chốt |
|---|---|
| **Q1** | **A — Toàn cục (`TOAN_CUC`) cho MVP Phase C.** Chưa thêm `unit_id/scopeUnitId` vào entries/targets trong đợt này. Per-unit là backlog M1, phải có migration/release riêng với S2. UI ghi rõ “Chỉ tiêu cấp Cục”. |
| **Q2** | **B — Target có vòng `DRAFT → CONFIRMED`.** Target `DRAFT` chỉ hiển thị tạm tính có nhãn, **không** dùng cho % chính thức/báo cáo. Chỉ target `CONFIRMED` mới tính chính thức. Bắt buộc nguồn/căn cứ + revision + audit. |
| **Q3** | **A — S2 sở hữu schema shared và `src/server/metrics.ts`.** S3 chỉ sửa target UI/helper/test sau khi S2 công bố schema; không sửa shared schema/API trước. |
| **Q4** | **Theo đề xuất S3 §5.3:** không tính % khi thiếu target, target = 0, target < 0, thiếu thực hiện, thiếu kỳ, lệch đơn vị, chưa xác nhận (nếu metric yêu cầu), hoặc chiều đánh giá chưa chốt. Thực hiện = 0 đã xác nhận + target > 0 ⇒ **0,00%**. Làm tròn **2 chữ số thập phân, half-up**. Nhiều target cùng kỳ hiển thị theo `labelCode`, không tự chọn. Báo cáo đã chốt dùng snapshot. |
| **Q5** | **B — Hai trục `recordState + coverage`, map ra 6 nhãn YC-06.** Trạng thái phải tính trên nguồn giá trị đang hiển thị, không chỉ bản ghi trực tiếp; xử lý đúng DERIVED/BALANCE. |
| **Q6** | **Approved approach:** thêm `measureMode`/`baselineScope` tường minh; không suy từ `valueKind`/tên. Riêng nghĩa lũy kế/snapshot của `PHI_LK_THU`, `PHI_CON`, `XOA_NO`, `NO_THUE`, `TV_CHO` tiếp tục **PENDING_BUSINESS_INPUT** cho tới khi có quy tắc nghiệp vụ chi tiết; khi đó hiển thị “chưa có quy tắc tổng hợp”, không tự tính. |
| **Q7** | **S0 đã chốt:** chưa bật cảnh báo “Thiếu N ngày” khi chưa có lịch nghiệp vụ. Hiển thị “Số ngày có bản ghi” và khoảng dữ liệu thực tế; không đổi `expectDaily` hàng loạt. |
| **Q8** | **B — Quyền nghiệp vụ riêng**: dùng `metrics.config` cho cấu hình/chỉ tiêu giao và `metrics.entry_all` cho nhập toàn bộ; assignment `canEnter`/`canConfirm` cho phạm vi được phân công. Không dùng `system.config`; `SYSTEM_ADMIN` không mặc nhiên có quyền nghiệp vụ. Nếu cần quyền target-only chi tiết hơn, bổ sung ở migration sau, không chồng tên trong đợt này. |
| **Q9** | **API trả cờ `isOfficial`/`dataSource`.** Chỉ target `isOfficial=true` mới tính % chính thức; DEMO hiển thị nhãn riêng, không vào báo cáo chính thức. Không dùng regex `[DEMO]` làm logic nghiệp vụ. |
| **Q10** | **Tiếp tục `PENDING_C1`.** Chưa tự gán danh sách chỉ tiêu giao, chu kỳ, chiều đánh giá. UI hiển thị “Chưa có quy tắc đánh giá”; không tô đạt/vượt. |
| **Q11** | **S0 đã chốt:** 2 chữ số thập phân, dấu `,` vi-VN; không tính hiển thị `—` + lý do, không `0%`; số 0 thật hiển thị `0` + đơn vị. |
| **Q12** | **S0 đã chốt:** `/giao-ban` trước; Dashboard/báo cáo Word chỉ sau khi UX/lãnh đạo chốt, không tự thêm. |

### 1.2. Đồng bộ với hợp đồng B-C-1 của S2

- **Q8:** S0 chấp nhận `metrics.config` / `metrics.entry_all` là quyền nghiệp vụ riêng của B-C-1; S3 dùng các quyền này, không tự thêm `giao_ban.target.*` trong đợt này.
- **Q9 — BLOCKER:** S2 hiện vẫn nhận diện DEMO bằng nhãn `[DEMO]` trong `src/server/metrics.ts` (dòng 424, 927) và hợp đồng B-C-1 dòng 190. Theo Q9 đã duyệt, phải dùng cờ `isOfficial`/`dataSource`; S2 phải sửa trước khi S0 merge S2.
- **Q11/YC-02 — BLOCKER:** API B-C-1 đang làm tròn 1 chữ số; quyết định Q11/YC-02 là **2 chữ số thập phân**. S2 phải sửa API/test/UI và cập nhật acceptance (78,18 / 77,49 / 109,67) trước khi merge.
- B1/B2/C1 vẫn PENDING; không hard-code.

### 1.3. B-C-2 alignment — S0 chốt

| Mã | Quyết định S0 |
|---|---|
| **D3** | B-C-2/DB/API **giữ `PROPOSED`**; S3 map nội bộ/UI sang `DRAFT` (nhãn “Dự thảo”). Không đổi tên schema/status chỉ để đồng nhất hiển thị. |
| **D4** | B-C-2 giữ `comparisonKind` tường minh (`BTC_YEAR`/`UBND_YEAR`/`MONTH_PLAN`); S3 map sang `labelCode` (`BTC`/`UBND`/`KH_THANG`). **Không dùng regex nhãn**. |
| **D5** | B-C-2 phải cung cấp tường minh: `direction` trên target (`HIGHER_IS_BETTER`/`LOWER_IS_BETTER`/`NEUTRAL`/`NOT_SET`) và `measureMode`/`baselineScope` cho metric/baseline. S2 đề xuất field vật lý/read-model trong B-C-2; S0 review. S3 không suy từ `valueKind`/tên. C1 vẫn PENDING. |
| **D6** | S2 seed/kiểm tra `metrics.config` và `metrics.entry_all`; assignment `canEnter`/`canConfirm`; `SYSTEM_ADMIN` không mặc nhiên; không `system.config`. |
| **D7** | **D7=A:** S3 sở hữu service/route target-only mới (`src/server/metric-targets.ts`, `/api/metrics/targets/*`). S2 sở hữu schema và `src/server/metrics.ts`. S3 không sửa `/api/metrics/admin`, `/api/metrics/summary`, `/api/metrics/entries`, Dashboard. |
| **D8** | Mọi create/update/confirm/lock/void target ghi revision + audit old/new/status/source; lưu proposed/confirmed/locked by/at. |
| **D9** | Chỉ S3 triển khai sau khi B-C-2 publish + migration rehearsal + S0 merge; không merge `main`/Production. |

### 1.4. Điều kiện triển khai S3

- **Được làm ngay:** pure helper/state model + test; chuẩn bị target UI component ở mức độc lập nếu không cần API/schema shared.
- **Chưa được làm:** sửa `prisma/schema.prisma`, `src/server/metrics.ts`, `/api/metrics/*`, `/giao-ban`, `/giao-ban/cau-hinh` hoặc migration cho tới khi S2 công bố schema/contract.
- Khi S2 merge schema, S3 rebase và chỉ sửa **target-only** theo Q3=A.
- Không dùng dữ liệu DEMO làm số chính thức; không đổi `requireConfirm`, `expectDaily`, `showOnDashboard` hàng loạt.

---

## 2. S6 — YC-09 / YC-10 / YC-11

### 2.1. YC-09 — Per-person

**APPROVED P1:**

- Thêm mô hình **kết quả phần việc từng người** trên Task (`TaskParticipantResult` logic).
- Giữ **một ApprovalCase chung** cho cả Task; không tạo case/điểm tháng riêng cho từng người.
- Chủ trì tổng hợp và nộp kết quả chung; collaborator chỉ gửi/sửa phần mình, không ghi đè kết quả chung, không đổi assignee, không hủy, không nộp thay.
- Task cũ không có dữ liệu per-person vẫn chạy bình thường.

**Các mã đã chốt:**

| Mã | Quyết định |
|---|---|
| **E9.1** | **Chỉ Task** giai đoạn 1; chưa mở PersonalWorkItem per-person. |
| **E9.2** | **S-ALL:** chủ trì nộp chung khi tất cả phần bắt buộc đã báo; ngoại lệ phải có lý do + audit. |
| **E9.3** | Khi final REJECT/CLARIFY: giữ phần đã `ACCEPTED`, trả lại phần được chọn; không xóa toàn bộ mặc định. |
| **E9.4** | Collaborator **không** ghi nhận điểm tháng giai đoạn 1; tránh tính trùng. |
| **E9.5** | Chủ trì vắng/ủy quyền nộp thay: **chờ YC-11**, không tự chuyển quyền. |
| **E9.6** | **Không partial approval từng người** giai đoạn 1; một quyết định cuối cho Task. |

### 2.2. YC-10 — Quality 65–100

**APPROVED Q1:**

- Gắn quality với **lượt quyết định duyệt** (`ApprovalDecision`), theo vòng.
- Giá trị: `65, 70, 75, 80, 85, 90, 95, 100`; mặc định `NULL`, không tự 100.
- Giai đoạn 1: **chỉ hiển thị/audit/sheet phụ**; không đổi Bảng 1, `qualityRatio c`, `taskResultScore`, `finalGrade`, hệ số QĐ1277 hoặc điểm chính thức.
- Sửa sau duyệt: bất biến + yêu cầu điều chỉnh có lý do/audit; không sửa trực tiếp.

| Mã | Quyết định |
|---|---|
| **E10.1** | Q1 — quality cho **kết quả Task**, không cho từng người/QĐ1277. |
| **E10.2** | M1 — **bắt buộc** với `TASK_RESULT` khi `AGREE`; không bắt buộc với `REJECT/CLARIFY`. |
| **E10.3** | **Có**, mức 65–70 vẫn hợp lệ; không tự biến thành REJECT. |
| **E10.4** | A1 — bất biến sau quyết định; điều chỉnh qua yêu cầu riêng có lý do/audit. |
| **E10.5** | (a) **chỉ hiển thị/audit/sheet phụ** giai đoạn 1; chưa vào điểm/export chính thức. |
| **E10.6** | Owner + tuyến duyệt + người quyết định được xem quality; collaborator không mặc nhiên. |
| **E10.7** | Không tự tổng hợp quality từng người thành quality Task; nếu cần Q2 phải quyết định riêng. |

### 2.3. YC-11 — Team/deputy/stage

**APPROVED R1:**

- Hai bước nghiệp vụ: **pre-check theo `PersonSupervision`** → **quyết định cuối bằng ApprovalCase hiện có**.
- “Nhóm/đội” giai đoạn 1 = **bộ phận cấp 2 hiện tại**.
- Phó chỉ pre-check khi có quan hệ phụ trách/ủy quyền; không mặc nhiên cùng quyền Trưởng.
- Không tạo `TEAM_LEADER`/`DEPUTY_LEADER`; không seed `person_supervisions`; thiếu tuyến thì **chờ phân tuyến**, không fallback.

| Mã | Quyết định |
|---|---|
| **E11.1** | T1 — bộ phận cấp 2 hiện tại; chưa tạo Team entity. |
| **E11.2** | D1 — Phó chỉ pre-check; quyết định cuối cần ủy quyền chính thức. |
| **E11.3** | R1 — pre-check là sự kiện riêng, không phải ApprovalCase thứ hai. |
| **E11.4** | S1 — thiếu tuyến thì chờ phân tuyến; không fallback. |
| **E11.5** | M2 nếu per-person được triển khai: mỗi phần việc pre-check theo tuyến người đó; final theo đơn vị chủ trì. |
| **E11.6** | Một người pre-check là đủ; ghi rõ ai đã pre-check. |
| **E11.7** | Snapshot tuyến tại thời điểm xử lý; thay đổi tuyến giữa kỳ không viết lại lịch sử. |
| **E11.8** | Áp dụng cho **Task result** giai đoạn 1. |
| **E11.9** | (a) người có thẩm quyền hiện tại quyết định cuối, trừ khi có Q-RB1 riêng. |

### 2.4. Quyền

| Mã | Quyết định |
|---|---|
| **P-1** | **Không** thêm `TEAM_LEADER`/`DEPUTY_LEADER`; dùng `PersonSupervision`/Position. |
| **P-2** | **Chưa** thêm `tasks.precheck`; chỉ đề xuất nếu supervision không đủ. |
| **P-3** | **Chưa** thêm `approvals.quality.adjust`; chỉ sau khi triển khai A1. |
| **P-4** | Cấu hình tuyến tiếp tục theo `org.manage`/admin hiện có; không tự cấp. |
| **P-5** | `SYSTEM_ADMIN` **không** có quyền nghiệp vụ. |

---

## 3. Cổng triển khai

1. **S4** hoàn tất hotfix YC-09 + YC-08/YC-12 trước; S4 **không** tự thêm per-person/quality/stage.
2. **S2** công bố schema/contract target trước; **S3** chỉ target-only sau đó.
3. **S6** không code trên nhánh spec. Sau khi S4 merge, S0 mở **nhánh implementation riêng** theo 3 phase: per-person → quality → pre-check/final.
4. Mỗi phase: additive migration, rehearsal fixture, typecheck/prisma validate/build, regression Task/approval, security test, UAT; rollback giữ dữ liệu.
5. Không merge `main`, không deploy, không ghi Production nếu chưa có lệnh riêng.

---

## 4. Trạng thái hiện tại

- Quyết định S3: **APPROVED**, S3 được tiếp tục phần độc lập; schema/API chờ S2.
- Quyết định S6: **APPROVED**, spec đủ căn cứ; implementation chờ S4 merge và nhánh riêng.
- Không merge code S3/S6 vào integration ở bước này.
- Production: **NO**.

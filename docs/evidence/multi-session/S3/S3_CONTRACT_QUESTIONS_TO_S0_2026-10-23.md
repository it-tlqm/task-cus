# S3 → S0 — CÂU HỎI CONTRACT YC-06 / YC-07

**Từ:** S3 — Phase C  
**Đến:** S0 (Integration Owner), đồng gửi S2 (Phase B)  
**Branch:** `codex/v3-phase-c-metrics`  
**Trạng thái:** `APPROVED` theo `D:\thanhnx\OpenCode\talung-integration\docs\V3\S0_DECISION_LOG_2026-10-23.md`

**Ngày:** 23/10/2026

> **Đã chốt:** toàn bộ Q1–Q12 được S0 phê duyệt tại decision log ngày 23/10/2026.
> Tài liệu này giữ lại **phương án gốc + lý do** để truy vết; quyết định có hiệu lực là bảng 1.1 trong decision log.
> Các ô “S0 chốt” bên dưới là bản đề xuất lịch sử, không thay thế decision log.

### Bảng quyết định đã APPROVED

| Mã | S0 đã chốt |
|---|---|
| Q1 | **A — Toàn cục `TOAN_CUC`** cho MVP; chưa thêm `unit_id/scopeUnitId`; per-unit là backlog M1. |
| Q2 | **B — `DRAFT → CONFIRMED`**; DRAFT chỉ tạm tính, CONFIRMED mới tính chính thức; bắt buộc nguồn + revision + audit. |
| Q3 | **A — S2 sở hữu schema shared + `src/server/metrics.ts`**; S3 chỉ target UI/helper/test sau khi S2 công bố schema. |
| Q4 | Theo đề xuất S3 §5.3: không tính % khi thiếu target/0/âm/thiếu thực hiện/thiếu kỳ/lệch đơn vị/chưa xác nhận/chiều chưa chốt; 0 thực + target > 0 = **0,00%**; 2 chữ số half-up. |
| Q5 | **B — hai trục `recordState + coverage`**, map 6 nhãn; trạng thái tính trên nguồn giá trị đang hiển thị. |
| Q6 | Approved approach `measureMode`/`baselineScope`; 5 mã `PHI_LK_THU`, `PHI_CON`, `XOA_NO`, `NO_THUE`, `TV_CHO` tiếp tục **PENDING_BUSINESS_INPUT**. |
| Q7 | **Chưa bật “Thiếu N ngày”**; hiển thị “Số ngày có bản ghi” + khoảng dữ liệu thực tế; không đổi `expectDaily` hàng loạt. |
| Q8 | **B — quyền nghiệp vụ hiện có** `metrics.config` cho target, `metrics.entry_all` cho nhập liệu + assignment `canEnter`/`canConfirm`; không `giao_ban.target.*`, không `system.config`. |
| Q9 | API trả **`isOfficial`/`dataSource`**; chỉ target official tính % chính thức; không dùng regex `[DEMO]`. |
| Q10 | **Tiếp tục `PENDING_C1`**; UI “Chưa có quy tắc đánh giá”; không tô đạt/vượt. |
| Q11 | **2 chữ số thập phân, dấu `,`**; không tính hiển thị `—` + lý do, không `0%`; số 0 thật hiển thị `0` + đơn vị. |
| Q12 | `/giao-ban` trước; Dashboard/báo cáo Word sau khi UX/lãnh đạo chốt. |

---

## 0. Tóm tắt cần quyết

| Mã | Quyết định | Blocking? | Đề xuất S3 |
|---|---|---|---|
| **Q1** | Phạm vi dữ liệu/chỉ tiêu: toàn cục hay theo đơn vị/phòng ban? | **CÓ** | Lát đầu: `TOAN_CUC`; nếu cần per-unit thì chờ migration chung với S2 |
| **Q2** | Chỉ tiêu giao có cần `DRAFT → CONFIRMED` không? | **CÓ** | Có, nếu `%` dùng chính thức; cho phép tạm tính khi `DRAFT` |
| **Q3** | Ai sở hữu schema target dùng chung? | **CÓ** | S2 sở hữu migration shared; S3 cung cấp field spec + test |
| **Q4** | Chính sách `%`: mẫu số 0, thiếu kỳ, chưa xác nhận, làm tròn | **CÓ** | Chỉ tính khi target/actual hợp lệ; 2 chữ số; không 0% khi thiếu |
| **Q5** | Mô hình trạng thái dữ liệu: 1 enum hay 2 trục? | **CÓ** | 2 trục `recordState` + `coverage`, map ra 6 nhãn |
| **Q6** | Nghĩa lũy kế/snapshot cho `PHI_*`, `XOA_NO`, `NO_THUE`, `TV_CHO` | **CÓ** | `measureMode` tường minh; chốt riêng từng mã |
| **Q7** | Lịch ngày dự kiến để báo “Thiếu N ngày” | Không chặn code, chặn UI | Chưa báo thiếu ngày khi chưa có lịch nghiệp vụ |
| **Q8** | Quyền cấu hình target: `isMetricsAdmin` hay quyền riêng? | **CÓ** | `metrics.config` cho target; `metrics.entry_all`/assignment cho nhập liệu; không `giao_ban.target.*` |
| **Q9** | Cách đánh dấu DEMO/chính thức ở API | **CÓ** | Cờ `isOfficial`/`dataSource`, không dùng regex nhãn |
| **Q10** | Danh sách chỉ tiêu được giao + chu kỳ + chiều (C1) | **CÓ** | `PENDING_C1` cho tới khi lãnh đạo chốt; không tự gán |
| **Q11** | Định dạng/tỷ lệ hiển thị | Không chặn | 2 chữ số thập phân; `—` + lý do khi không tính |
| **Q12** | Mức hiển thị: chỉ `/giao-ban` hay cả Dashboard | Không chặn | `/giao-ban` trước; Dashboard sau khi UX chốt |

---

## Q1 — Phạm vi dữ liệu và chỉ tiêu giao

**Hiện trạng:** `metric_daily_entries` không có `unit_id`; `metric_plan_targets` không có `scope`. Mọi số liệu/target đang là toàn hệ thống. YC-07 nói “theo phạm vi”, nhưng chưa rõ là phạm vi đơn vị, phòng ban, hay chỉ là phạm vi kỳ/chỉ tiêu.

**Phương án:**

- **A. Toàn cục (`TOAN_CUC`) cho lát đầu.** Không đổi schema. Ghi rõ trong UI “Chỉ tiêu cấp Cục”; per-unit là backlog M1. Nhanh, ít rủi ro, nhưng chưa đáp ứng nếu lãnh đạo muốn giao chỉ tiêu cho từng phòng ban.
- **B. Thêm `scopeUnitId`/`unit_id` vào entries + targets.** Đúng nghiệp vụ hơn nhưng là migration dùng chung với S2, ảnh hưởng query, quyền, báo cáo, backfill. Cần S0/S2 lên kế hoạch riêng.
- **C. Chỉ thêm `scope` dạng text/JSON trên target, dữ liệu thực vẫn toàn cục.** Không nhất quán; không khuyến nghị.

**Đề xuất S3:** **A** cho Phase C MVP, với điều kiện lãnh đạo xác nhận 49 chỉ tiêu hiện tại là cấp Cục và chưa cần giao theo phòng ban. Nếu cần per-unit, chọn **B** và tách migration/release riêng; S3 chờ.

**S0 chốt:** ☐ A ☐ B ☐ C — Ghi chú: ________

---

## Q2 — Quy trình trạng thái của chỉ tiêu giao

**Hiện trạng:** tạo target là có hiệu lực ngay; chỉ có `updatedById`, audit create/update/delete; không có `status` hay người xác nhận.

**Phương án:**

- **A. Nhập là hiệu lực ngay.** Bắt buộc `sourceNote`, ghi audit old/new. Đơn giản, phù hợp nếu lãnh đạo tin cậy người nhập.
- **B. `DRAFT → CONFIRMED`.** Target nháp không dùng tính `%` chính thức; người có quyền xác nhận. Phù hợp nguyên tắc “nguồn/căn cứ, lịch sử điều chỉnh” và đồng bộ với mốc lũy kế `PROPOSED → CONFIRMED`.
- **C. Dùng `ApprovalCase`.** Quá nặng cho cấu hình số liệu; không khuyến nghị.

**Đề xuất S3:** **B** nếu `%` được dùng trong báo cáo chính thức; **A** nếu chỉ cần cấu hình nhanh và chấp nhận rủi ro. Trong cả hai, bắt buộc nguồn + revision.

**S0 chốt:** ☐ A ☐ B ☐ C — Ghi chú: ________

---

## Q3 — Owner schema và API target

**Hiện trạng:** `MetricPlanTarget` nằm trong schema chung; S2 sở hữu contract dữ liệu B/C theo master plan.

**Cần chốt:**

1. Ai thêm các trường `status`, `sourceType/sourceNote/sourceRef`, `direction`, `scope`, `confirmedBy/At`, `revision`?
2. Ai sửa `src/server/metrics.ts` (`computeMetricSummary`, `computeMetricComparison`)?
3. Ai sửa `/api/metrics/admin` và `/giao-ban/cau-hinh`?

**Phương án:**

- **A. S2 sở hữu schema + `metrics.ts`; S3 chỉ sửa UI target và test.** Ít conflict nhất, nhưng S3 phụ thuộc nhịp S2.
- **B. S3 sở hữu target-only (schema target + API target + UI); S2 sở hữu entries/comparison.** Cần S0 phân quyền file rõ.
- **C. S3 làm tất cả metric module.** Dễ conflict với S2; không khuyến nghị.

**Đề xuất S3:** **A** cho schema shared; S3 được sửa **target-only** sau khi S2 merge schema, và cung cấp test/field spec. Nếu S0 muốn tách nhánh nhanh, chọn **B** và ghi rõ file ownership.

**S0 chốt:** ☐ A ☐ B ☐ C — Ghi chú: ________

---

## Q4 — Chính sách tính `%`

**Đề xuất chi tiết:** xem `S3_CATALOG_REVIEW_2026-10-23.md` §5.3.

Các điểm cần S0/S2 xác nhận:

1. **Thiếu target** → “Chưa giao chỉ tiêu”, không tính, không 0%.
2. **Target = 0** → “Mẫu số 0”, không tính, không 0%.
3. **Target < 0** → từ chối hoặc “Chỉ tiêu âm”, không tính.
4. **Thực hiện thiếu kỳ** → không tính chính thức; có cho phép “tạm tính” không?
5. **Thực hiện chưa xác nhận**:
   - metric `requireConfirm=true` → không tính chính thức;
   - metric `requireConfirm=false` → tính tạm hay tính chính thức?
6. **Thực hiện = 0 đã xác nhận**, target > 0 → **0,00%** (đúng, không phải thiếu).
7. **Làm tròn:** 2 chữ số thập phân, half-up? (YC-02 đang 2 chữ số; code hiện tại 1 chữ số.)
8. **Chiều đánh giá:** chỉ tô “đạt/vượt” khi `direction` đã chốt; `THAP_HON_TOT` không dùng công thức `actual/target` mặc định.
9. **Đã chốt báo cáo:** vẫn tính theo snapshot; nhãn “Đã chốt”.
10. **Nhiều target cùng kỳ:** hiển thị tất cả theo `labelCode` hay chỉ target được chọn? Đề xuất hiển thị theo `labelCode`, không tự chọn.

**S0 chốt:** ☐ Theo đề xuất §5.3 ☐ Sửa: ________

---

## Q5 — Mô hình trạng thái dữ liệu

**Phương án:**

- **A. Một enum 7 giá trị** (`CHUA_NHAP`, `CHUA_DU_KY`, `KHONG_PHAT_SINH`, `DA_NHAP`, `DA_XAC_NHAN`, `DA_CHOT`, `KHONG_AP_DUNG`). Dễ hiểu nhưng mất thông tin “đã nhập nhưng thiếu kỳ” và “đã chốt nhưng chưa xác nhận”.
- **B. Hai trục `recordState` + `coverage`**, map ra nhãn hiển thị. Giữ được cả hai thông tin; API rõ hơn; test dễ hơn.

**Đề xuất S3:** **B**. Nếu S0 cần enum duy nhất cho UI, vẫn giữ `coverage` trong payload và dùng mapping §4.2.

**Lưu ý bắt buộc:** trạng thái phải tính trên **nguồn của giá trị đang hiển thị**, không chỉ bản ghi trực tiếp. Trong DB test, `PHI_LK_THU`, `PHI_CON`, `RR_TONG` có số DERIVED nhưng đang bị gắn `NONE`; `KS_HS` có mốc năm nhưng tháng `NONE`. Nếu không sửa, YC-06 vẫn sai dù có thêm enum.

**S0 chốt:** ☐ A ☐ B — Ghi chú: ________

---

## Q6 — Nghĩa lũy kế/snapshot

Cần chốt cho các mã đặc biệt:

| Mã | Hiện tại | Câu hỏi |
|---|---|---|
| `PHI_LK_THU` | DERIVED, term `PHI_THU`, `includeBaseline=true` | Lũy kế đã thu = mốc LEDGER + phát sinh sau mốc? Mốc nằm ở đâu? |
| `PHI_CON` | DERIVED, `PHI_PS - PHI_THU`, `includeBaseline=true` | Còn phải thu = mốc còn phải thu + PS − THU sau mốc? |
| `XOA_NO` | FLOW, nhãn “lũy kế” | Là phát sinh trong kỳ hay lũy kế từ đầu năm? |
| `NO_THUE` | BALANCE | Số dư cuối kỳ lấy bản ghi mới nhất ≤ ngày xem? |
| `TV_CHO` | BALANCE | Số đang chờ tại ngày xem? |

**Đề xuất:** thêm `measureMode` + `baselineScope` tường minh; không suy từ `valueKind`/tên. Nếu chưa chốt, các mã này hiển thị “chưa có quy tắc tổng hợp”, không tự tính.

**S0/S2 chốt:** ________

---

## Q7 — Lịch ngày dự kiến và cảnh báo “Thiếu N ngày”

**Hiện trạng:** `missingDates` lấy mọi ngày lịch trong tuần; 46/49 chỉ tiêu `expectDaily=true`. Fixture dừng 18/10 → báo thiếu 5 ngày (19–23/10) cho mọi chỉ tiêu FLOW, kể cả chỉ tiêu sự kiện.

**Cần chốt:**

1. Chỉ tiêu nào thực sự phát sinh hằng ngày?
2. Có trừ cuối tuần/ngày lễ không?
3. Ngày không được phân công có bị coi là thiếu không?
4. “Không phát sinh” đã xác nhận có được miễn cảnh báo thiếu không?

**Đề xuất:** chưa bật cảnh báo “Thiếu N ngày” cho tới khi có lịch nghiệp vụ; thay bằng “Số ngày có bản ghi” và “Kỳ dữ liệu: 02–18/10”. Không đổi `expectDaily` hàng loạt khi chưa duyệt.

**S0 chốt:** ________

---

## Q8 — Quyền cấu hình chỉ tiêu giao (đã APPROVED)

**S0 đã chốt:** dùng quyền nghiệp vụ hiện có của B-C-1:

- `metrics.config`: cấu hình chỉ tiêu, target, mốc, phân công, mục nhận xét.
- `metrics.entry_all`: nhập/sửa mọi chỉ tiêu (không cần assignment).
- Assignment `canEnter`/`canConfirm`: phạm vi được phân công.
- **Không** dùng `system.config`; `SYSTEM_ADMIN` không mặc nhiên có quyền nghiệp vụ.
- **Không** thêm `giao_ban.target.*` trong đợt này.

**S0 chốt:** ☑ `metrics.config` / `metrics.entry_all` + assignment

---

## Q9 — DEMO và dữ liệu chính thức ở tầng API

**Hiện trạng:** 49/49 target là `[DEMO]`; API vẫn trả `targets[].percent`; UI `/giao-ban` ẩn phần trăm DEMO, nhưng consumer khác có thể dùng nhầm.

**Cần chốt:**

1. Thêm cờ `isOfficial`/`dataSource` cho target/baseline/entry?
2. Ai sở hữu việc lọc DEMO: API summary, UI, hay cả hai?
3. Có cho phép trộn DEMO + thật trong cùng kỳ không? (Hiện có banner cảnh báo.)

**Đề xuất:** API trả cờ; `computeMetricSummary` chỉ tính `%` chính thức từ target `isOfficial=true`; DEMO hiển thị nhãn riêng và không vào báo cáo. Không dùng regex `[DEMO]` làm logic nghiệp vụ.

**S0/S2 chốt:** ________

---

## Q10 — C1: danh sách chỉ tiêu được giao, chu kỳ, chiều đánh giá

Đây là quyết định nghiệp vụ, S3 không tự chốt. Cần lãnh đạo cung cấp:

1. Chỉ tiêu nào **thực sự được giao** (không phải cả 49).
2. Chu kỳ: năm/quý/tháng; có kế thừa năm mới không.
3. Chiều: cao hơn tốt / thấp hơn tốt / trung tính.
4. Chỉ tiêu 0, điều chỉnh giữa kỳ, nhiều người đồng quản lý.
5. Đơn vị tính và phạm vi.

**Đề xuất:** để `targetApplicability = PENDING_C1` và `direction = CHUA_CHOT` cho tới khi có danh sách. UI hiển thị “Chưa có quy tắc đánh giá”, không tô màu.

**S0 chốt:** ☐ Đã có danh sách (đính kèm) ☐ Tiếp tục PENDING

---

## Q11 — Định dạng hiển thị

- `%`: 2 chữ số thập phân (`78,18%`), dấu `,` theo vi-VN.
- Không tính: `—` + lý do; không `0%`.
- Số tiền: theo `displayScale` hiện tại; không đổi đơn vị lưu.
- `0` thật: hiển thị `0` + đơn vị; `KHONG_PHAT_SINH` hiển thị `0` + nhãn.

**S0 chốt:** ☐ Theo đề xuất ☐ Sửa: ________

---

## Q12 — Mức hiển thị

- `/giao-ban`: hiển thị target + `%` + trạng thái (bắt buộc).
- Dashboard: chỉ hiển thị tỷ lệ trọng tâm nếu UX/lãnh đạo chọn; không tự thêm.
- Báo cáo Word: chỉ dùng target chính thức; không dùng DEMO.

**S0 chốt:** ________

---

## 1. Điều kiện triển khai (đã đáp ứng)

S0 đã phê duyệt toàn bộ Q1–Q12 tại `S0_DECISION_LOG_2026-10-23.md`. Theo Q3=A:

- **Được làm ngay:** pure helper/state model + test; target UI draft độc lập (mock) — **đã hoàn tất**.
- **Chưa được làm:** `prisma/schema.prisma`, `src/server/metrics.ts`, `/api/metrics/*`, `/giao-ban`, `/giao-ban/cau-hinh`, migration shared — **chờ S2 công bố schema**.
- Khi S2 merge schema, S3 rebase và chỉ sửa **target-only**.

Không dùng dữ liệu DEMO làm số chính thức; không đổi `requireConfirm`, `expectDaily`, `showOnDashboard` hàng loạt.

---

## 2. Đề nghị S2 phối hợp

- Xác nhận `computeMetricComparison` cũng cần lọc target theo `year`/`periodNo` (hiện chỉ lọc `month`).
- Chốt target chính thức cho `THU_NSNN` (BTC/UBND/KH tháng) và cách đánh dấu `isOfficial`.
- Chốt ai sửa `src/server/metrics.ts` và thứ tự merge: S2 schema trước, S3 rebase sau.
- Không dùng số DEMO trong DB test để tuyên bố tỷ lệ chính thức.

---

## 3. Trạng thái hiện tại

```text
SESSION: S3
YC: YC-06 / YC-07
BRANCH: codex/v3-phase-c-metrics
BASE_SHA: 50daed3 (docs) / a68d31e (code)
STATUS: WAIT_B_C_2 — helper/UI mock đã merge; chờ S2 sửa Q9/Q11 + B-C-2
SCHEMA_OR_MIGRATION: NONE
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: NO — target-only chờ B-C-2
```

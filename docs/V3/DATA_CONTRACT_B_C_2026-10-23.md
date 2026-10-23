# HỢP ĐỒNG DỮ LIỆU B/C — YC-01/02 (Phase B) và YC-06/07 (Phase C)

**Mã hợp đồng:** `B-C-1` — **Ngày:** 23/10/2026
**Bên soạn:** S2 — Phase B (`codex/v3-phase-b-revenue`)
**Bên nhận để phối hợp:** S0 — Integration Owner; S3 — Phase C (`codex/v3-phase-c-metrics`)
**Trạng thái:** **ĐỀ XUẤT ĐÓNG BĂNG KỸ THUẬT** — không thay thế quyết định nghiệp vụ còn mở.
**Phạm vi:** dữ liệu số liệu giao ban dùng chung cho Thu NSNN (YC-01/02) và trạng thái/chỉ tiêu/tỷ lệ (YC-06/07).
**Nguyên tắc:** hợp đồng này chỉ mô tả cấu trúc, quy ước trạng thái, công thức và quyền. Các quyết định B1/B2/C1 vẫn **PENDING** và không được hard-code.

---

## 1. Ranh giới sở hữu

| Thành phần | S2 (B) sở hữu | S3 (C) được dùng | Ghi chú |
|---|---|---|---|
| `MetricDefinition`, `MetricGroup`, `MetricClassification` | Đọc; thêm trường chỉ khi có contract | Đọc | Không tự đổi nghĩa `valueKind`, `displayScale` |
| `MetricDailyEntry` + `MetricEntryRevision` | Nhập/sửa/xác nhận/audit | Đọc trạng thái | B không đổi cách C hiển thị trạng thái; C không ghi trực tiếp |
| `MetricBaseline` + revision | Nhập mốc lũy kế, xác nhận, audit | Đọc mốc `CONFIRMED`/`LOCKED` | Mốc là ảnh chụp lũy kế, **không phải** bản ghi ngày |
| `MetricPlanTarget` + revision | Nhập chỉ tiêu gốc, xác nhận/chốt, audit | Đọc để tính `% thực hiện` | Bổ sung `comparisonKind` để **không suy đoán từ nhãn** |
| `MetricEntryAssignment` | Phân công nhập/xác nhận | Đọc quyền hiển thị | Không dùng `system.config` thay quyền nghiệp vụ |
| `BriefingReportVersion` | Đọc trạng thái khóa tháng | Đọc | Khóa báo cáo là mốc `LOCKED` của kỳ tháng |

**Quy tắc vàng:** S3 được phép đọc và mở rộng phía C, nhưng **không được** đổi ngữ nghĩa các trường B đã công bố trong tài liệu này. Mọi thay đổi phá vỡ hợp đồng phải có S2 + S0 chấp thuận bằng văn bản.

---

## 2. Phân biệt FLOW và lũy kế (bắt buộc)

### 2.1. `MetricDailyEntry` — giá trị phát sinh theo ngày

- `valueNumeric` lưu **đơn vị gốc**; UI nhập theo `displayScale` và API quy đổi (`value × displayScale`).
- Một dòng duy nhất theo khóa `(metricId, classificationId, entryDate)`.
- `valueKind = FLOW`: cộng dồn các bản ghi trong kỳ.
- `valueKind = BALANCE`: lấy bản ghi mới nhất đến cuối kỳ (số dư), **không cộng**.
- `valueKind = DERIVED`: tính từ công thức `derivation`; API từ chối nhập trực tiếp.
- `entryDate` là ngày phát sinh (date-only, UTC), không phải ngày nhập máy.

**Cấm:** nhập một số lũy kế năm/tháng vào ô phát sinh ngày rồi coi là FLOW. Hệ thống đã có cảnh báo mềm `detectSuspiciousEntryValues`; cảnh báo **không tự sửa dữ liệu** và **không chặn** (theo quyết định hiện hành), nhưng UI phải hiển thị rõ.

### 2.2. `MetricBaseline` — mốc lũy kế tại ngày chốt

- `cumKind`:
  - `MONTH` / `QUARTER` / `YEAR`: mốc lũy kế của đúng kỳ, chỉ dùng khi `asOfDate` nằm trong kỳ đang xem.
  - `LEDGER`: số dư liên tục, áp dụng từ `asOfDate` trở đi, không hết hạn.
- Chỉ mốc `status = CONFIRMED` hoặc `LOCKED` được dùng để tính.
- Công thức không trùng lặp:

```text
Giá trị lũy kế kỳ = giá trị mốc (nếu có mốc hợp lệ trong kỳ)
                  + tổng các bản ghi FLOW có entryDate > asOfDate và <= ngày cuối kỳ
```

- Nếu không có mốc: lũy kế kỳ = tổng các bản ghi FLOW trong kỳ.
- **Không** tự phân bổ số lũy kế ra các ngày trước mốc; **không** cộng mốc như một bản ghi phát sinh độc lập.

### 2.3. Quy ước `null` khác `0`

| Tình huống | Giá trị API | Hiển thị |
|---|---|---|
| Chưa có bản ghi/mốc | `null` | `—` + “Chưa có số liệu” |
| Có bản ghi bằng 0 đã nhập | `0` | `0` + trạng thái tương ứng |
| Không áp dụng | `null` + `applicable=false` (C bổ sung) | “Không áp dụng” |
| Mẫu số 0/thiếu | `percent = null` | “Chưa xác định” / “Chưa có dữ liệu đối chiếu” |

**Cấm** chuyển `null` thành `0` hoặc `0%` ở API/UI.

---

## 3. Trạng thái dữ liệu (dùng chung B/C)

### 3.1. Trạng thái bản ghi ngày (`MetricDailyEntry.status`)

| Mã | Ý nghĩa | Ai chuyển |
|---|---|---|
| `DRAFT` | Đã nhập, chờ gửi kiểm tra (chỉ chỉ tiêu `requireConfirm`) | Người được `canEnter` |
| `RECORDED` | Đã ghi nhận (chỉ tiêu không bắt buộc kiểm tra) | Người được `canEnter` |
| `SUBMITTED` | Đã gửi kiểm tra | Người được `canEnter` |
| `CONFIRMED` | Đã xác nhận | Người được `canConfirm` |
| `NEEDS_FIX` | Cần điều chỉnh | Người được `canConfirm` |

Khóa tháng: `BriefingReportVersion` tồn tại cho `periodType=MONTH`, `periodKey=YYYY-MM` ⇒ UI hiển thị `LOCKED` (đã chốt báo cáo). Không sửa bản ghi đã `SUBMITTED/CONFIRMED` nếu không có quyền quản trị số liệu; mọi sửa đổi ghi `MetricEntryRevision`.

### 3.2. Trạng thái chỉ tiêu gốc (`MetricPlanTarget.status`)

| Mã | Ý nghĩa | Được dùng tính % chính thức? |
|---|---|---|
| `PROPOSED` | Đã nhập/đề xuất, chưa xác nhận | **Không** (chỉ hiển thị tham khảo, gắn nhãn) |
| `CONFIRMED` | Đã xác nhận | **Có** |
| `LOCKED` | Đã chốt | **Có**; không sửa nếu không có quyền mở khóa |

Mỗi lần tạo/sửa/xác nhận/chốt ghi một dòng `MetricPlanTargetRevision` + `AuditEvent`.

### 3.3. Trạng thái mốc lũy kế (`MetricBaseline.status`)

`PROPOSED → CONFIRMED → LOCKED`. Chỉ `CONFIRMED`/`LOCKED` tham gia tính toán. Sửa mốc đã `CONFIRMED` phải tạo revision và đưa về `PROPOSED` để xác nhận lại, trừ khi đã `LOCKED` (từ chối).

### 3.4. Ánh xạ sang bộ trạng thái C (YC-06)

S3 được phép suy ra bộ trạng thái chi tiết từ dữ liệu B, theo bảng sau; **không** lưu đè lên trạng thái B:

| Trạng thái C | Điều kiện từ dữ liệu B |
|---|---|
| `CHUA_NHAP` | Không có entry, không có baseline, không có target |
| `CHUA_DU_KY` | Có entry nhưng thiếu ngày bắt buộc (`expectDaily`) trong kỳ; hoặc thiếu mốc bắt buộc đã cấu hình |
| `KHONG_PHAT_SINH` | Có bản ghi `0` đã `RECORDED`/`CONFIRMED` cho kỳ (không suy từ null) |
| `DA_NHAP` | Có entry `DRAFT`/`RECORDED`/`NEEDS_FIX` |
| `DA_XAC_NHAN` | Có entry `CONFIRMED` hoặc tháng đã `LOCKED` |
| `KHONG_AP_DUNG` | Do C cấu hình theo chỉ tiêu/kỳ; B không tự sinh |

---

## 4. Hợp đồng API so sánh Thu NSNN (YC-01)

### 4.1. Endpoint

```http
GET /api/metrics/summary?year=2026&month=10&week=42&quarter=4&comparison=1
Authorization: Bearer <token>
```

Chỉ người đã đăng nhập được đọc. Không yêu cầu `system.config`.

### 4.2. Cấu trúc `comparison` (phiên bản `B-C-1`)

```jsonc
{
  "version": "B-C-1",
  "rule": {
    "targetSource": "EXPLICIT_COMPARISON_KIND",
    "prevMonth": "PENDING_B1",
    "samePeriodLastYear": "PENDING_B1",
    "notes": "Chưa chốt so cùng số ngày hay cả tháng; API không trả % cho 2 dòng này."
  },
  "anchors": { "year": 2026, "month": 10, "monthLabel": "Tháng 10/2026", "prevMonthLabel": "Tháng 9/2026", "lastYearLabel": "Tháng 10/2025" },
  "rows": [
    {
      "metricId": "…",
      "code": "THU_NSNN",
      "name": "Thu NSNN (số thuế phát sinh)",
      "unitType": "VND",
      "unitLabel": "đồng",
      "displayScale": 1,
      "decimals": 0,
      "yearCum": 1317372334554,
      "monthCum": 219341201856,
      "latestDate": "2026-10-22",
      "btc": {
        "targetId": "…",
        "label": "Chỉ tiêu BTC năm 2026",
        "comparisonKind": "BTC_YEAR",
        "targetValue": 1685000000000,
        "percent": 78.2,
        "periodLabel": "Năm 2026",
        "status": "CONFIRMED",
        "sourceNote": "Quyết định giao chỉ tiêu…",
        "confirmedAt": "2026-10-23T…",
        "basis": "YEAR_CUM",
        "ruleState": "OFFICIAL"
      },
      "ubnd": { "...": "cùng cấu trúc, comparisonKind=UBND_YEAR" },
      "monthPlan": { "...": "comparisonKind=MONTH_PLAN, basis=MONTH_CUM, periodLabel='Tháng 10/2026'" },
      "prevMonth": {
        "value": null,
        "percent": null,
        "label": "Tháng 9/2026",
        "basis": "FULL_PREVIOUS_MONTH_CUM",
        "ruleState": "PENDING_B1"
      },
      "samePeriodLastYear": {
        "value": null,
        "percent": null,
        "label": "Tháng 10/2025",
        "basis": "FULL_MONTH_LAST_YEAR_CUM",
        "ruleState": "PENDING_B1"
      }
    }
  ]
}
```

### 4.3. Quy tắc tính đã chốt

```text
% BTC  = yearCum / targetValue(BTC_YEAR, đúng năm) × 100
% UBND = yearCum / targetValue(UBND_YEAR, đúng năm) × 100
% KH tháng = monthCum / targetValue(MONTH_PLAN, đúng tháng/năm) × 100
```

- Làm tròn **1 chữ số thập phân** ở API; UI hiển thị đúng 1–2 chữ số theo cấu hình.
- Chỉ tính khi: tử số `!== null`, mẫu số `> 0`, target `status ∈ {CONFIRMED, LOCKED}`, target **không** mang nhãn `[DEMO...]`.
- Không có target/không khớp kỳ/nhiều target cùng loại ⇒ `targetValue=null`, `percent=null`, `ambiguous=true` nếu nhiều.
- **Không** nhận diện BTC/UBND/KH tháng bằng chuỗi nhãn. Dùng `comparisonKind` đã cấu hình tường minh.

### 4.4. Hai dòng đang PENDING (B1)

`prevMonth` và `samePeriodLastYear`:

- API **có thể** trả `value` (số lũy kế của kỳ đối chiếu) để minh bạch dữ liệu, nhưng **luôn** `percent = null`, `ruleState = "PENDING_B1"`.
- UI **không** hiển thị phần trăm, không gắn chip tăng/giảm, không kết luận tốt/xấu.
- Khi chủ dự án chốt B1, hợp đồng sẽ nâng version và bổ sung công thức; không sửa lịch sử đã công bố.

---

## 5. Quyền nghiệp vụ (YC-02)

| Quyền | Ý nghĩa | Cấp cho |
|---|---|---|
| `metrics.config` | Cấu hình chỉ tiêu, chỉ tiêu giao, mốc lũy kế, phân công, mục nhận xét | `UNIT_LEADER`; người được cấp tường minh |
| `metrics.entry_all` | Nhập/sửa mọi chỉ tiêu (không cần từng assignment) | `UNIT_LEADER`; người được cấp tường minh |
| Assignment `canEnter` | Nhập chỉ tiêu/nhóm được phân công | Cán bộ theo `MetricEntryAssignment` |
| Assignment `canConfirm` | Xác nhận chỉ tiêu/nhóm được phân công | Cán bộ/lãnh đạo theo phân công |

- **Không** dùng `system.config` để thay thế `metrics.config`/`metrics.entry_all`.
- `SYSTEM_ADMIN` **không** mặc nhiên có quyền nghiệp vụ số liệu; chỉ có khi được cấp tường minh.
- `UNIT_LEADER` giữ quyền điều hành nghiệp vụ theo vai trò, nhưng vẫn phải chịu audit.

---

## 6. Audit và lịch sử

Mọi thao tác ghi các trường sau (tối thiểu):

| Hành động | Revision | AuditEvent action |
|---|---|---|
| Tạo chỉ tiêu giao | `MetricPlanTargetRevision(CREATE)` | `TARGET_CREATED` |
| Sửa chỉ tiêu giao | `…(UPDATE)` lưu old/new value/status/source | `TARGET_UPDATED` |
| Xác nhận chỉ tiêu | `…(CONFIRM)` | `TARGET_CONFIRMED` |
| Chốt chỉ tiêu | `…(LOCK)` | `TARGET_LOCKED` |
| Tạo mốc lũy kế | `MetricBaselineRevision(CREATE)` | `BASELINE_PROPOSED` |
| Sửa mốc | `…(UPDATE)` | `BASELINE_UPDATED` |
| Xác nhận/chốt mốc | `…(CONFIRM/LOCK)` | `BASELINE_CONFIRMED` / `BASELINE_LOCKED` |
| Nhập/sửa/xóa bản ghi ngày | `MetricEntryRevision` (đã có) | `METRIC_ENTRIES_SAVED` / `METRIC_ENTRY_*` |

Trường lưu vết: `metricId`, `classificationId` (phạm vi), `periodType/year/periodNo/asOfDate`, `valueNumeric` (đơn vị gốc), `unitLabel`, `sourceNote`, `status`, `proposedById/At`, `confirmedById/At`, `lockedById/At`, `reason`.

---

## 7. Migration và tương thích

- Migration **additive**; không xóa/đổi cột cũ.
- Thêm vào `metric_plan_targets`: `comparison_kind` (mặc định `NONE`), `source_note`, `status` (mặc định `PROPOSED`), `proposed_by_id`, `confirmed_by_id`, `confirmed_at`, `locked_by_id`, `locked_at`.
- Bảng mới: `metric_plan_target_revisions`, `metric_baseline_revisions`.
- Thêm `source_note` (nếu chưa có) / `status` / `locked_at` cho baseline theo nhu cầu; **không** suy đoán `comparison_kind` từ nhãn cũ. Dữ liệu cũ để `NONE` và phải được cấu hình lại tường minh.
- Không chạy migration trên Production trong Phase B; chỉ rehearsal trên `talung_v3_phase_b`/fixture.

---

## 8. Quyết định còn mở (không được tự chốt)

| Mã | Nội dung | Hành vi tạm thời |
|---|---|---|
| **B1** | “Tháng trước/cùng kỳ” là cùng số ngày hay cả tháng? | API trả `percent=null`, `ruleState=PENDING_B1`; UI ghi “Chờ chốt quy tắc” |
| **B2** | Quyền nhập/xác nhận/chốt chi tiết; nhập bù lũy kế; dữ liệu lịch sử | Dùng `metrics.config` + assignment; mọi sửa có revision/audit; không sửa dữ liệu Production |
| **C1** | Chỉ tiêu nào được giao, chu kỳ, chiều đánh giá | B không tự gắn target cho mọi chỉ tiêu; C tự cấu hình theo quyết định riêng |

---

## 9. Acceptance tối thiểu của hợp đồng

1. Nhập fixture: `yearCum=1.317.372.334.554`, target BTC `1.685.000.000.000` ⇒ `78.2%`; UBND `1.700.000.000.000` ⇒ `77.5%`; `monthCum=219.341.201.856`, KH tháng `200.000.000.000` ⇒ `109.7%`.
2. `prevMonth.percent === null`, `samePeriodLastYear.percent === null`, `ruleState === "PENDING_B1"` dù có dữ liệu.
3. Mẫu số `0`/`null` ⇒ `percent=null`, không có `0%`.
4. Mốc lũy kế không bị cộng trùng; nhập số lũy kế vào ô ngày không tự thành FLOW.
5. STAFF không có assignment ⇒ 403 khi nhập; SYSTEM_ADMIN không có `metrics.*` ⇒ 403 cấu hình/nhập toàn bộ.
6. Mọi thay đổi target/baseline có revision + AuditEvent; UI hiển thị nguồn, trạng thái, người/thời điểm xác nhận.
7. Dashboard và `/giao-ban` dùng **cùng component/contract**; Desktop/Mobile hiển thị được 5 dòng.

---

## 10. Đề nghị S3/S0 xác nhận

- [ ] S3 đọc hợp đồng này trước khi sửa API/schema/metric definitions dùng chung.
- [ ] S3 dùng `MetricPlanTarget` cho % thực hiện nhưng **không** đổi `comparisonKind`, `status`, `sourceNote` của B.
- [ ] S3 bổ sung trạng thái C bằng lớp đọc/tính toán, không ghi đè trạng thái B.
- [ ] S0 ghi nhận `B-C-1` là baseline hợp đồng cho thứ tự tích hợp S2 → S3.
- [ ] Mọi thay đổi phá vỡ hợp đồng phải qua S2 + S0.

**Kết luận:** Hợp đồng `B-C-1` đủ để S2 triển khai phần đã chốt của YC-01/02 và để S3 dựng phần độc lập. B1/B2/C1 vẫn PENDING, không được biến thành số liệu chính thức.

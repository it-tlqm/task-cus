# S3 — KẾ HOẠCH TARGET-ONLY SAU B-C-2 (YC-06 / YC-07)

- **Session:** S3 — Phase C
- **Branch:** `codex/v3-phase-c-metrics`
- **Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`
- **Database test:** `talung_v3_phase_c` (localhost)
- **Trạng thái:** `WAIT_B_C_2` — **chưa sửa** schema/API/metrics.ts/`/giao-ban`
- **Ngày:** 23/10/2026

> Căn cứ: `S0_DECISION_LOG_2026-10-23.md`, `S2_CONTRACT_ALIGNMENT_BLOCKER_2026-10-23.md`, `S3_HANDOFF_APPROVED_2026-10-23.md`, `DATA_CONTRACT_B_C_2026-10-23.md` (B-C-1).
>
> Tài liệu này là **kế hoạch thi công**, không phải lệnh merge/deploy. Không dùng Production.

---

## 0. Kết luận điều hành

1. S3 **không thể** làm target-only hoàn chỉnh trên B-C-1 hiện tại vì S2 chưa công bố B-C-2 và còn 2 blocker Q9/Q11.
2. S0 đã chốt **D3–D7** tại decision log §1.3. S3 đã chuẩn bị **mapping layer** (`src/lib/metrics-bc2-mapping.ts`) + test **77/77 PASS**:
   - `PROPOSED` → `DRAFT` (D3);
   - `comparisonKind` → `labelCode` (D4);
   - `dataSource`/`isOfficial` (Q9);
   - `direction`/`measureMode`/`baselineScope` thiếu thì `NOT_SET`/`PENDING_BUSINESS_INPUT` (D5).
3. Trong lúc chờ, S3 giữ nguyên helper/test/UI mock; bổ sung test mapping, không sửa code shared.
4. Quyền target dùng **`metrics.config`**; nhập liệu dùng **`metrics.entry_all`** hoặc assignment `canEnter`/`canConfirm`. **Không thêm `giao_ban.target.*`**.

---

## 1. Điều kiện phụ thuộc B-C-2

### 1.1. Hard dependencies (phải có trước khi S3 code target-only)

| Mã | Điều kiện | Nguồn | Trạng thái | Ảnh hưởng nếu thiếu |
|---|---|---|---|---|
| **D1** | `MetricPlanTarget` có `dataSource` (`REAL`/`DEMO`) hoặc `isOfficial`; migration additive + backfill nhãn `[DEMO]`; API trả cờ | Q9 + S2 blocker §1 | **PENDING S2** | Không phân biệt được target chính thức; S3 không thể tính `%` đúng |
| **D2** | API/UI/tính toán dùng **2 chữ số thập phân, half-up, dấu `,`**; acceptance 78,18 / 77,49 / 109,67 | Q11 + S2 blocker §2 | **PENDING S2** | Sai định dạng; test S3 không khớp S2 |
| **D3** | B-C-2/DB/API giữ `PROPOSED`; S3 map nội bộ/UI sang `DRAFT` | S0 §1.3 | **APPROVED — mapping done** | UI/API lệch trạng thái; confirm/lock sai |
| **D4** | B-C-2 giữ `comparisonKind`; S3 map `BTC_YEAR`/`UBND_YEAR`/`MONTH_PLAN` sang `labelCode`; không regex nhãn | S0 §1.3 | **APPROVED — mapping done** | Chọn sai target BTC/UBND/KH tháng |
| **D5** | B-C-2 cung cấp `direction` + `measureMode`/`baselineScope`; thiếu thì `NOT_SET`/`PENDING_BUSINESS_INPUT` | S0 §1.3 | **APPROVED — mapping done; field vật lý chờ S2** | Không thể chặn % khi chiều chưa chốt hoặc Q6 pending |
| **D6** | `metrics.config`/`metrics.entry_all` được seed/kiểm tra; assignment; SYSTEM_ADMIN không mặc nhiên | S0 §1.3 | **APPROVED — seed chờ S2** | 403/leo quyền; không dùng `system.config` |
| **D7** | **D7=A**: S3 sở hữu `src/server/metric-targets.ts` + `/api/metrics/targets/*`; S2 sở hữu schema + `metrics.ts` | S0 §1.3 | **APPROVED** | Conflict file/API; không rõ owner |
| **D8** | Revision + audit old/new/status/source; lưu proposed/confirmed/locked by/at | Q2 + B-C-1 §6 | **PENDING S2** | Không đủ lịch sử điều chỉnh |
| **D9** | B-C-2 published + migration rehearsal trên test DB + S0 merge vào integration | S2 blocker §4 | **PENDING S2/S0** | S3 không có schema để rebase |

### 1.2. Mapping đề xuất B-C-1 → S3

| B-C-1 / B-C-2 | S3 internal | Ghi chú |
|---|---|---|
| `status = PROPOSED` | `DRAFT` | Chỉ tạm tính; không dùng `%` chính thức. Nếu B-C-2 đổi tên `DRAFT` thì bỏ map |
| `status = CONFIRMED` | `CONFIRMED` | Được tính `%` chính thức nếu official + đủ điều kiện |
| `status = LOCKED` | `LOCKED` | Được tính theo snapshot; không sửa nếu không có quyền mở khóa |
| `dataSource = DEMO` | `isOfficial = false` | DEMO luôn thắng nếu mâu thuẫn; không dùng regex |
| `dataSource = REAL` | `isOfficial = true` | Chỉ official mới tính `%` chính thức |
| `comparisonKind = BTC_YEAR` | `labelCode = BTC` | Không dùng chuỗi nhãn |
| `comparisonKind = UBND_YEAR` | `labelCode = UBND` | |
| `comparisonKind = MONTH_PLAN` | `labelCode = KH_THANG` | |
| `comparisonKind = NONE/khác` | `labelCode = KHAC`/`PENDING_C1` | Không tự gán |

> Mapping đã được S0 chốt D3–D5 và triển khai tại `src/lib/metrics-bc2-mapping.ts` (77 test). S3 không tự đổi `comparisonKind`, `status`, `sourceNote` của B.

---

## 2. File ownership và phạm vi sau khi S2 merge

### 2.1. File S3 dự kiến thêm/sửa

| File | Thay đổi | Owner | Ghi chú |
|---|---|---|---|
| `src/lib/metrics-contract.ts` | State model/percent/validation hiện có; giữ pure | S3 | Đã có; không đổi API |
| `src/lib/metrics-bc2-mapping.ts` | **Mới (đã có)**: map B-C-2 → S3: status, comparisonKind, dataSource, direction/measureMode/baselineScope | S3 | Pure, không DB/API |
| `src/server/metric-targets.ts` | **Mới**: service target-only (list/create/update/confirm/lock/void/revision) dùng Prisma + audit | S3 | Không sửa `src/server/metrics.ts` |
| `src/app/api/metrics/targets/route.ts` | **Mới**: GET list + POST create DRAFT | S3 (nếu D7=A) | Không sửa `/api/metrics/admin` |
| `src/app/api/metrics/targets/[id]/route.ts` | **Mới**: PATCH update DRAFT; POST confirm/lock/void; GET revisions | S3 (nếu D7=A) | Path cụ thể chốt sau D7 |
| `src/components/metrics/MetricTargetDraftEditor.tsx` | Bỏ mock, nối API target; giữ validation/helper | S3 | UI draft đã có |
| `src/app/giao-ban/cau-hinh/page.tsx` | **Chỉ tab target**: list/filter/create/edit/confirm/void; dùng `metrics.config` | S3 sau merge | Không sửa các tab khác |
| `src/app/giao-ban/page.tsx` | **Chỉ hiển thị target/%/trạng thái** từ summary/API; không tự tính | S3 sau merge | Không sửa logic summary |
| `scripts/test-phase-c-contract.ts` | Bổ sung test mapping/dataSource/2 decimals | S3 | Đang 108/108 |
| `scripts/test-phase-c-bc2-mapping.ts` | **Mới**: 77 test mapping B-C-2 (status/comparisonKind/dataSource/D5) | S3 | Đang 77/77 |
| `scripts/test-phase-c-target-api.ts` | **Mới**: DB test target API, quyền, audit, cleanup | S3 | Chạy trên `talung_v3_phase_c`/fixture |
| `scripts/test-phase-c-target-ui.ts` | **Mới**: UI test target tab/status/2 decimals | S3 | Desktop + Mobile |

### 2.2. File S3 **không** sửa

- `prisma/schema.prisma` + migration B-C-2 (S2).
- `src/server/metrics.ts` (S2).
- `src/app/api/metrics/admin/route.ts` (S2 shared; target CRUD hiện nằm ở đây).
- `src/app/api/metrics/summary/route.ts`, `entries/route.ts`, `report/route.ts` (S2).
- `src/components/dashboard/TaxSummarySection.tsx` (Dashboard — Q12 chưa mở).
- `src/app/giao-ban/cau-hinh/page.tsx` các tab ngoài target.
- Bất kỳ file nào liên quan `system.config`, auth, Storage.

> Nếu D7 chọn target CRUD trong `/api/metrics/admin` của S2: S3 **không sửa route đó**, chỉ gọi API/S2 service và làm UI. Khi đó `src/server/metric-targets.ts` có thể không cần.

---

## 3. API target-only (đề xuất, chờ D7)

### 3.1. Endpoints

```http
GET  /api/metrics/targets?metricId=&year=2026&periodType=MONTH&periodNo=10
POST /api/metrics/targets                 # tạo DRAFT/PROPOSED
PATCH /api/metrics/targets/{id}           # sửa DRAFT/PROPOSED
POST /api/metrics/targets/{id}/confirm    # DRAFT -> CONFIRMED
POST /api/metrics/targets/{id}/lock       # CONFIRMED -> LOCKED
POST /api/metrics/targets/{id}/void       # VOID có lý do
GET  /api/metrics/targets/{id}/revisions  # lịch sử
```

### 3.2. Response tối thiểu

```jsonc
{
  "id": "…",
  "metricId": "…",
  "classificationId": "",
  "comparisonKind": "BTC_YEAR",
  "labelCode": "BTC",
  "periodType": "YEAR",
  "year": 2026,
  "periodNo": null,
  "valueBase": 1685000000000,
  "unitType": "VND",
  "dataSource": "REAL",
  "isOfficial": true,
  "status": "CONFIRMED",
  "direction": "NOT_SET",
  "measureMode": "PERIOD_FLOW",
  "sourceNote": "Quyết định giao chỉ tiêu…",
  "proposedByName": "…",
  "confirmedByName": "…",
  "confirmedAt": "2026-10-23T…",
  "revisionNo": 2
}
```

- Không trả `percent` trong target API; `%` do S2 summary/comparison tính.
- `status` dùng đúng B-C-2; nếu B-C-2 giữ `PROPOSED`, API trả `PROPOSED` (S3 map nội bộ `DRAFT`).
- `dataSource`/`isOfficial` phải có; không suy từ `label`.

### 3.3. Validation server

- `metricId` tồn tại/active; `classificationId` thuộc metric.
- `periodType/year/periodNo` hợp lệ; target chỉ dùng đúng kỳ.
- `valueBase >= 0`; target 0 warning/không dùng mẫu số.
- `unitType` khớp metric.
- `comparisonKind`/`labelCode` không trùng cùng metric/classification/kỳ.
- `CONFIRMED` bắt buộc `sourceNote`/căn cứ; `LOCKED` chỉ từ `CONFIRMED`.
- Mọi create/update/confirm/lock/void ghi revision + audit; lưu old/new.
- `dataSource=DEMO` không được confirm thành official; nếu cần, chỉ `REAL`.

### 3.4. Quyền

| Hành động | Quyền |
|---|---|
| Xem cấu hình target | `metrics.config` |
| Tạo/sửa DRAFT | `metrics.config` |
| Xác nhận/khóa/hủy target | `metrics.config` + audit |
| Nhập số liệu | `metrics.entry_all` hoặc assignment `canEnter` |
| Xác nhận số liệu | `metrics.entry_all` hoặc assignment `canConfirm` |

- Không dùng `system.config` thay thế.
- Không thêm `giao_ban.target.*`.
- `SYSTEM_ADMIN` chỉ có quyền nếu được cấp tường minh `metrics.config`.

---

## 4. UI target-only

### 4.1. `/giao-ban/cau-hinh` — tab Chỉ tiêu giao

- Danh sách target theo metric/kỳ; cột: loại, kỳ, giá trị, đơn vị, nguồn, trạng thái, `dataSource`, người xác nhận.
- Tạo/sửa DRAFT/PROPOSED; nút “Xác nhận” chỉ bật khi đủ điều kiện + có `metrics.config`.
- Hiển thị `DEMO` bằng badge riêng; không dùng nhãn `[DEMO]` làm logic.
- Hiển thị `%` 2 chữ số nếu có preview; target DRAFT gắn “tạm tính”.
- Không tô đạt/vượt khi `direction=NOT_SET`/`LOWER_IS_BETTER`.
- Mobile: bảng cuộn trong khung, không tràn trang.

### 4.2. `/giao-ban` — hiển thị target

- Chỉ đọc target/% từ API summary/comparison của S2; không tự tính lại.
- Hiển thị “Chưa giao chỉ tiêu”, “Chỉ tiêu nháp”, “DEMO”, “Chưa có quy tắc đánh giá” đúng trạng thái.
- `%` 2 chữ số, dấu `,`; không có `0%` khi thiếu mẫu số.
- `isOfficial=false`/DEMO: nhãn riêng, không vào báo cáo chính thức.

---

## 5. Test plan

### 5.1. Unit/contract (đã có, bổ sung)

`scripts/test-phase-c-contract.ts`:

- Hiện **108/108 PASS**.
- Đã bổ sung:
  - `dataSource=DEMO` thắng `isOfficial=true` → không chính thức.
  - `dataSource=REAL` thắng `isOfficial=false` → chính thức.
  - `resolveOfficialFlag` cho cả hai nguồn.
  - `%` 2 chữ số half-up: 78,18 / 109,67 / 77,50; 0 thực = 0,00%.
- Giữ nguyên các test cũ; không sửa schema/API.

`scripts/test-phase-c-bc2-mapping.ts`:

- Hiện **77/77 PASS**.
- D3: `PROPOSED` ↔ `DRAFT`, các status còn lại.
- D4: `BTC_YEAR`/`UBND_YEAR`/`MONTH_PLAN` → `BTC`/`UBND`/`KH_THANG`; kind lạ → null/warning.
- Q9: `dataSource=DEMO/REAL` thắng `isOfficial`; thiếu cờ → không official + warning.
- D5: thiếu `direction`/`measureMode`/`baselineScope` → `NOT_SET`/`PENDING_BUSINESS_INPUT`, không suy.
- Tích hợp mapping → `deriveTargetState`/`computePercent`: PROPOSED/DEMO không tính chính thức; BTC/UBND/KH tháng ra 78,18 / 77,49 / 109,67%.

### 5.2. DB test target API (mới, sau B-C-2)

`scripts/test-phase-c-target-api.ts` — dùng `talung_v3_phase_c` hoặc fixture riêng; **tạo rồi dọn sạch**:

1. Tạo target DRAFT/PROPOSED → không có `%` chính thức.
2. Confirm thiếu `sourceNote` → 400.
3. Confirm đủ nguồn + `metrics.config` → CONFIRMED.
4. `dataSource=DEMO` → không official, không tính `%`.
5. `dataSource=REAL` + CONFIRMED → tính `%` từ summary S2.
6. `%` 2 chữ số: fixture 78,18 / 77,49 / 109,67; không hard-code ngoài fixture.
7. Target 0/âm → không tính/400.
8. Target khác năm/tháng/quý → không dùng.
9. Duplicate `comparisonKind`/label/kỳ → 400.
10. Quyền: `metrics.config` được; chỉ `metrics.entry_all` không được cấu hình target; SYSTEM_ADMIN không có metrics.config → 403.
11. Revision/audit old/new/status/source.
12. Không còn regex `[DEMO]` trong logic target (grep test).
13. Cleanup: xóa target/revision test; xác nhận DB trở về baseline.

> Nếu `metrics.config` chưa được S2 seed, test ghi `BLOCKED_BY_PERMISSION` — **không** tự tạo permission hoặc dùng `system.config` để PASS.

### 5.3. UI test (mới, sau B-C-2)

`scripts/test-phase-c-target-ui.ts`:

- Mở `/giao-ban/cau-hinh` tab target; tạo DRAFT; confirm thiếu nguồn bị chặn; confirm đủ nguồn.
- Badge DEMO/official; 2 chữ số; “Chưa giao chỉ tiêu”; “Chưa có quy tắc đánh giá”.
- Không tô xanh/đỏ khi `NOT_SET`/`LOWER_IS_BETTER`.
- Desktop 1440×900 + Mobile 390×844; không tràn ngang.
- Không gọi Production/API thật ngoài local.

### 5.4. Gate

- `npx tsc --noEmit` PASS.
- `npx prisma validate` PASS.
- `pnpm build` PASS.
- `scripts/test-phase-c-contract.ts` PASS (hiện 108/108).
- `scripts/test-phase-c-bc2-mapping.ts` PASS (hiện 77/77).
- Target API/UI test PASS hoặc ghi rõ `BLOCKED_BY_*`, không giả PASS.
- `PRODUCTION_TOUCHED: NO`.

---

## 6. Thứ tự thi công sau khi S2 merge

1. S0 xác nhận B-C-2 + D1/D2/D8/D9 (D3–D7 đã APPROVED); S3 rebase `codex/v3-phase-c-metrics`.
2. Mapping layer B-C-2 → S3 đã có (`src/lib/metrics-bc2-mapping.ts`, 77 test); cập nhật nếu field vật lý B-C-2 khác.
3. D7=A: làm `src/server/metric-targets.ts` + `/api/metrics/targets/*` (S3 sở hữu).
4. Nối `MetricTargetDraftEditor` → API; cập nhật `/giao-ban/cau-hinh` **chỉ tab target**.
5. Cập nhật `/giao-ban` hiển thị target/%/trạng thái (chỉ đọc summary).
6. Chạy DB test + UI test; dọn dữ liệu test; chạy typecheck/prisma/build.
7. Commit theo từng lớp (mapping → API → UI → test/docs), gửi S0 handoff.

---

## 7. Rủi ro / conflict

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| B-C-2 đổi `PROPOSED`→`DRAFT` hoặc ngược | Cao | Mapping layer; test cả hai; không sửa schema |
| `comparisonKind` vs `labelCode` lệch | Cao | D4 mapping; không dùng nhãn |
| `dataSource` chưa backfill | Cao | D1; test DEMO/REAL; không regex |
| `metrics.config` chưa seed | Cao | D6; test ghi BLOCKED_BY_PERMISSION, không dùng system.config |
| S3 sửa nhầm `metrics.ts`/admin route | Cao | Chỉ file target-only; review diff trước commit |
| `/giao-ban` conflict S2 | Trung bình | Chỉ sửa phần hiển thị target; S0 review |
| Target 0/âm/chiều thấp hơn tốt | Trung bình | Helper đã chặn; test C4/C5/C12 |
| Q6 pending 5 mã | Trung bình | `BUSINESS_RULE_PENDING`; không tự tính |

---

## 8. Acceptance checklist

- [ ] B-C-2 published, có D1–D9.
- [ ] S3 rebase không conflict shared.
- [ ] Target API target-only hoạt động; không sửa `metrics.ts`.
- [ ] `metrics.config`/`metrics.entry_all` đúng; không `giao_ban.target.*`.
- [ ] DEMO/official đúng; không regex.
- [ ] `%` 2 chữ số half-up; 0 thực = 0,00%; thiếu = `—` + lý do.
- [ ] DRAFT chỉ tạm tính; CONFIRMED mới chính thức; source bắt buộc.
- [ ] Revision/audit old/new.
- [ ] DB test/UI test PASS; cleanup.
- [ ] `tsc`/`prisma validate`/`build` PASS.
- [ ] `PRODUCTION_TOUCHED: NO`.

---

## 9. Trạng thái hiện tại

```text
SESSION: S3
YC: YC-06 / YC-07
BRANCH: codex/v3-phase-c-metrics
STATUS: WAIT_B_C_2 — blocker Q9/Q11; D3–D7 APPROVED, mapping layer ready
IMPLEMENTED: helper/state model + test 108/108 + mapping 77/77 + target UI mock
NOT_IMPLEMENTED: target API/UI thật, schema/API/metrics.ts/giao-ban
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: NO — chờ B-C-2
```

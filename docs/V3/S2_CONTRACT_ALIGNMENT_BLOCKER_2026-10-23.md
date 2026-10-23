# S0 — S2 BLOCKED: ĐỒNG BỘ HỢP ĐỒNG B-C-1 VỚI QUYẾT ĐỊNH ĐÃ DUYỆT

**Ngày:** 23/10/2026  
**Session:** S2 — Phase B  
**Branch:** `codex/v3-phase-b-revenue`  
**HEAD review:** `207dcfc`  
**Trạng thái:** **RESOLVED Q9/Q11 — ĐÃ MERGE `352f078`.** D5 (`direction`/`measureMode`/`baselineScope`) được chuyển sang **DEFERRED_B_C_3**; S3 target-only được phép nhưng không tính % chính thức cho tới khi B-C-3.

S0 đã đọc handoff, contract `B-C-1`, schema/migration và code S2. Phần lớn YC-01/02 đúng hướng, nhưng còn **2 điểm lệch quyết định đã được chủ dự án phê duyệt**; phải sửa trước khi merge.

---

## 1. Blocker Q9 — DEMO phải dùng cờ dữ liệu, không dùng nhãn

**Quyết định đã duyệt (Q9):** API trả `isOfficial`/`dataSource`; chỉ target `isOfficial=true` mới tính % chính thức; DEMO có nhãn riêng, không dùng regex `[DEMO]`.

**Hiện trạng S2:**
- `src/server/metrics.ts:424`: `demoTargets = targets.filter(... /^\s*\[DEMO/i.test(t.label))`
- `src/server/metrics.ts:927`: `officialTargets = targets.filter((t) => !/^\s*\[DEMO/i.test(t.label) ...)`
- `docs/V3/DATA_CONTRACT_B_C_2026-10-23.md:190`: điều kiện chính thức vẫn dựa trên “target không mang nhãn `[DEMO...]`”.

**Rủi ro:** đổi nhãn hoặc dữ liệu cũ không có nhãn sẽ làm sai nguồn chính thức; trái quyết định Q9.

**Yêu cầu sửa:**
1. Thêm trường additive vào `MetricPlanTarget` (và baseline/entry nếu S0/S3 cần): `dataSource` (`REAL | DEMO`) hoặc `isOfficial` boolean, có migration.
2. Backfill một lần: target có nhãn `[DEMO]` → `dataSource=DEMO`; còn lại `REAL`; ghi audit/backup.
3. API trả cờ; chỉ target `dataSource=REAL` (hoặc `isOfficial=true`) + `CONFIRMED/LOCKED` mới tính % chính thức.
4. UI hiển thị nhãn DEMO riêng; không dùng regex nhãn trong logic.
5. Cập nhật contract lên phiên bản mới (B-C-2 hoặc addendum B-C-1a) và test.

---

## 2. Blocker Q11/YC-02 — tỷ lệ phải 2 chữ số thập phân

**Quyết định đã duyệt:** hiển thị/tính tỷ lệ **2 chữ số thập phân** (ví dụ 78,18%; 77,49%; 109,67%).

**Hiện trạng S2:**
- Contract B-C-1 §4.3: “Làm tròn 1 chữ số thập phân ở API”.
- Acceptance §9: 78.2 / 77.5 / 109.7.
- Code/API đang trả 1 chữ số.

**Yêu cầu sửa:**
1. API trả 2 chữ số thập phân (half-up hoặc quy tắc S0/S3 chốt; mặc định half-up).
2. UI hiển thị 2 chữ số, dấu `,` vi-VN.
3. Cập nhật test/acceptance: `78,18%`, `77,49%`, `109,67%`; không hard-code số ngoài fixture.
4. Không đổi công thức B1; prev/same-period vẫn `null` + `PENDING_B1`.

---

## 3. Điểm đã thống nhất (không cần sửa)

- **Q1:** toàn cục MVP, chưa per-unit.
- **Q3:** S2 sở hữu schema shared + `metrics.ts`.
- **Q8:** dùng `metrics.config` / `metrics.entry_all` + assignment; không `system.config`, không cấp SYSTEM_ADMIN mặc nhiên.
- **B1/B2/C1:** tiếp tục PENDING; không hard-code.
- Contract B-C-1 là baseline kỹ thuật sau khi sửa Q9/Q11; S3 chờ schema S2.

---

## 4. B-C-2 alignment bổ sung (S0 đã chốt)

| Mã | Yêu cầu B-C-2 |
|---|---|
| **D3** | Giữ `PROPOSED` trong DB/API; S3 map nội bộ/UI sang `DRAFT`. Không đổi tên status schema. |
| **D4** | Giữ `comparisonKind` tường minh; S3 map sang `labelCode`; không regex nhãn. |
| **D5** | Cung cấp tường minh `direction` trên target và `measureMode`/`baselineScope` cho metric/baseline. S2 đề xuất field/read-model trong B-C-2; S3 không suy từ `valueKind`/tên. C1 vẫn PENDING. |
| **D6** | Seed/kiểm tra `metrics.config` + `metrics.entry_all`; assignment `canEnter`/`canConfirm`; SYSTEM_ADMIN không mặc nhiên. |
| **D7** | **D7=A:** S3 sở hữu service/route target-only mới (`src/server/metric-targets.ts`, `/api/metrics/targets/*`). S2 giữ schema + `metrics.ts`; S3 không sửa `/api/metrics/admin`, `/api/metrics/summary`, `/api/metrics/entries`, Dashboard. |
| **D8** | Revision + audit old/new/status/source; proposed/confirmed/locked by/at. |

## 5. Điều kiện merge lại

1. Commit sửa Q9 + Q11 trên `codex/v3-phase-b-revenue`.
2. Cập nhật contract/acceptance sang phiên bản mới.
3. `tsc`, `prisma validate`, build PASS; test S2 34/34 + UI 14/14 (hoặc bộ thay thế tương đương).
4. Migration additive có rehearsal trên bản sao test; không chạy Production.
5. Handoff mới ghi `READY_FOR_INTEGRATION: YES`, `PRODUCTION_TOUCHED: NO`.
6. S0 chạy lại regression trên integration trước khi merge.

**Không merge S2 ở trạng thái `207dcfc`.** S3 tiếp tục chờ schema/contract đã sửa.

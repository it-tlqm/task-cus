# S3 — HANDOFF `WAIT_CONTRACT` (YC-06 / YC-07)

**Session:** S3 — Phase C  
**Worktree:** `D:\thanhnx\OpenCode\talung-phase-c`  
**Branch:** `codex/v3-phase-c-metrics`  
**Base:** `50daed3` (docs) / `a68d31e` (code baseline)  
**Database:** `talung_v3_phase_c` (localhost, test)  
**Port:** 3113  
**Trạng thái:** `WAIT_CONTRACT` — chưa sửa schema/API dùng chung  
**Ngày:** 23/10/2026

---

## 1. Báo cáo theo mẫu master plan mục 7

```text
SESSION: S3
YC: YC-06 / YC-07
BRANCH: codex/v3-phase-c-metrics
BASE_SHA: 50daed3 (docs) / a68d31e (code)
COMMIT_SHA: b0a19f0 (docs/test; sẽ có commit cập nhật SHA nếu cần)
FILES_CHANGED:
  - docs/evidence/multi-session/S3/S3_CATALOG_REVIEW_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md
  - docs/evidence/multi-session/S3/S3_HANDOFF_WAIT_CONTRACT_2026-10-23.md
  - docs/evidence/multi-session/S3/catalog-snapshot.json
  - docs/evidence/multi-session/S3/catalog-appendix.md
  - scripts/review-phase-c-catalog.ts
  - scripts/test-phase-c-contract-proposal.ts
SCHEMA_OR_MIGRATION: NONE
TESTS_PASS:
  - scripts/test-phase-c-contract-proposal.ts: 43/43 PASS (pure/mock, không DB/API)
TESTS_NOT_RUN:
  - test-yc26-29-api.ts: chưa chạy lại trong đợt này; cần DB fixture/leader account, sẽ chạy sau contract.
  - test-yc26-29-ui.ts: chưa chạy; chưa có thay đổi UI.
  - typecheck/prisma validate/build: sẽ chạy sau khi có code; hiện chỉ thêm docs/scripts.
UI_EVIDENCE: NONE — chưa thay đổi UI.
SECURITY_CHECKS:
  - Truy vấn DB test read-only; không ghi dữ liệu.
  - Không đọc/ghi Production; không dùng credential Production.
  - Không sửa auth/permission/audit/Storage.
DECISIONS_PENDING: Q1–Q12 trong S3_CONTRACT_QUESTIONS_TO_S0_2026-10-23.md
CONFLICT_EXPECTED:
  - src/server/metrics.ts
  - src/app/api/metrics/summary/route.ts
  - src/app/api/metrics/admin/route.ts
  - src/app/giao-ban/page.tsx
  - src/app/giao-ban/cau-hinh/page.tsx
  - prisma/schema.prisma + migration (nếu cần)
PRODUCTION_TOUCHED: NO
READY_FOR_INTEGRATION: NO — WAIT_CONTRACT
```

---

## 2. Tóm tắt kết quả rà soát

- **49 chỉ tiêu active**, 6 nhóm, 5 phân loại.
- **0 chỉ tiêu giao chính thức**; 49/49 target hiện là `[DEMO]`; 47 mốc lũy kế DEMO.
- **636 bản ghi** tháng 10/2026, tất cả `RECORDED`, **0 `CONFIRMED`**, 152 bản ghi giá trị 0.
- Báo cáo tháng 10 đã có phiên bản → logic hiện tại gắn `LOCKED` cho mọi chỉ tiêu có bản ghi.
- 4 chỉ tiêu không có bản ghi tháng 10: `PHI_LK_THU`, `PHI_CON`, `RR_TONG`, `KS_HS`.
- 6 chỉ tiêu không có target (kể cả DEMO): `TV_CHO`, `RR_TONG`, `PHI_LK_THU`, `PHI_CON`, `NO_THUE`, `XOA_NO`.
- 46/49 chỉ tiêu `expectDaily=true`; cảnh báo “Thiếu 5 ngày” trong fixture là 19–23/10, nhưng chưa có lịch nghiệp vụ.
- 0/49 chỉ tiêu `requireConfirm=true` → chưa thể có trạng thái `ĐÃ_XÁC_NHẬN` thực chất.
- **Lỗi trạng thái DERIVED:** `PHI_LK_THU`, `PHI_CON`, `RR_TONG` có số nhưng đang bị gắn `NONE` (Chưa nhập) vì trạng thái chỉ xét bản ghi trực tiếp; `KS_HS` có mốc năm nhưng tháng `NONE`.

---

## 3. Đề xuất chính

1. **Tách trạng thái** `recordState` + `coverage`; map ra 6 nhãn YC-06; không coi thiếu = 0.
2. **Chỉ tiêu giao** cần `status`, `source`, `direction`, `scope`, revision; chỉ tính `%` chính thức khi target/actual hợp lệ.
3. **Không tính `%`** khi: thiếu target, target 0/âm, thiếu thực hiện, thiếu kỳ, chưa xác nhận (nếu metric yêu cầu), lệch đơn vị, chiều chưa chốt.
4. **DEMO** phải là cờ dữ liệu ở API, không dùng regex nhãn.
5. **Quyền** riêng cho target; không dùng `system.config` làm quyền nghiệp vụ.

Chi tiết: `S3_CATALOG_REVIEW_2026-10-23.md`.

---

## 4. Việc S3 sẽ làm ngay sau khi S0 chốt

1. Rebase/merge contract từ S2 (nếu schema shared).
2. Thêm helper thuần cho trạng thái/tỷ lệ + unit test.
3. Sửa API target/summary theo contract (file ownership do S0 chốt).
4. Sửa `/giao-ban` và `/giao-ban/cau-hinh` hiển thị trạng thái/lý do.
5. Chạy test DB fixture + UI Desktop/Mobile; báo cáo `PRODUCTION_TOUCHED: NO`.

---

## 5. Việc S3 không làm

- Không sửa schema/migration/API shared trước contract.
- Không tạo target/mốc/bản ghi chính thức.
- Không đổi `requireConfirm`, `expectDaily`, `showOnDashboard`.
- Không dùng dữ liệu DEMO làm số chính thức.
- Không chạm Production.

---

## 6. Đề nghị S0

- Trả lời Q1–Q12 (tối thiểu Q1–Q6, Q8–Q10).
- Xác nhận owner `src/server/metrics.ts` và schema target.
- Chốt thứ tự merge S2 → S3.
- Nếu muốn S3 tiếp tục phần độc lập trước contract, chỉ cho phép **target UI + pure helper + test** (không API/schema).

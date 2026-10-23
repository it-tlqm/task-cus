# S2 — PHASE B (YC-01/02) — HANDOFF

**Ngày:** 23/10/2026
**Session:** S2 — Phase B (Thu NSNN, giá trị gốc, khối so sánh)
**Worktree:** `D:\thanhnx\OpenCode\talung-phase-b`
**Branch:** `codex/v3-phase-b-revenue`
**Port:** 3112 — **DB kiểm thử:** `talung_v3_phase_b`
**Production touched:** **NO**

---

## 1. Commit / base

| Mục | SHA |
|---|---|
| Base code (Phase A đã merge) | `a68d31e` |
| Base docs/bootstrap | `50daed3` |
| Hợp đồng dữ liệu B/C `B-C-1` | `8d4f076` |
| Thông báo S0 + S3 | `1827fe7` |
| Backend/schema/permission | `08e6521` |
| UI Dashboard + `/giao-ban` + cấu hình | `df99460` |
| Handoff/docs/tests (commit này) | xem branch head |

Không merge `main`, không deploy, không chạy migration trên Production.

---

## 2. Phạm vi đã triển khai

### YC-01 — So sánh kết quả thu NSNN

- Khối **“So sánh kết quả thu NSNN”** dùng **cùng một component** `RevenueComparisonSection` trên Dashboard và `/giao-ban`:
  - Chỉ tiêu Bộ Tài chính (năm)
  - Chỉ tiêu UBND tỉnh (năm)
  - Kế hoạch tháng HQTL
  - So với tháng trước
  - So với cùng kỳ năm trước
- BTC/UBND/KH tháng dùng **`comparisonKind` tường minh** (`BTC_YEAR`, `UBND_YEAR`, `MONTH_PLAN`), không dò nhãn/chữ.
- Chỉ tính % khi target đúng kỳ/năm, phạm vi tổng, trạng thái `CONFIRMED`/`LOCKED`, không phải `[DEMO]`, mẫu số > 0.
- Hiển thị nguồn/căn cứ, trạng thái, người/ngày xác nhận, “Số liệu đến ngày…”.
- Hai dòng kỳ trước/cùng kỳ: **B1 PENDING** — API trả `percent = null`, `ruleState = "PENDING_B1"`; UI ghi “Chờ chốt quy tắc”, không công bố %.
- Thiếu dữ liệu/mẫu số 0: `null`, UI “Chưa xác định”, không tự hiện 0%.

### YC-02 — Nhập giá trị gốc, tự tính %, trạng thái/audit

- `MetricPlanTarget` bổ sung: `comparisonKind`, `sourceNote`, `status` (`PROPOSED → CONFIRMED → LOCKED`), `proposedById`, `confirmedById/At`, `lockedById/At`.
- `MetricBaseline` bổ sung trạng thái `LOCKED` + người/thời điểm chốt; mốc `CONFIRMED`/`LOCKED` mới được tính.
- Bảng mới:
  - `metric_plan_target_revisions`
  - `metric_baseline_revisions`
  - Lưu old/new value, status, sourceNote, reason, người/thời điểm; không dùng FK cascade để giữ lịch sử sau khi xóa bản ghi `PROPOSED`.
- API `/api/metrics/admin`:
  - target: create/update/confirm/lock/delete (chỉ xóa `PROPOSED`; sửa target đã xác nhận quay về `PROPOSED` để xác nhận lại).
  - baseline: create/update/confirm/lock/delete (tương tự; chặn ngày mốc tương lai).
  - history: `?historyType=target|baseline&historyId=...`.
- Phân biệt FLOW (bản ghi ngày) và lũy kế (mốc) giữ nguyên; bổ sung kiểm thử chống cộng trùng mốc + phát sinh.
- Quyền nghiệp vụ mới: `metrics.config`, `metrics.entry_all`. **Không dùng `system.config`**; `SYSTEM_ADMIN` không mặc nhiên có quyền số liệu.
- Audit action thực tế: `METRIC_ADMIN_TARGET_*`, `METRIC_ADMIN_BASELINE_*`; ghi kèm revision.

### UI

- `src/components/dashboard/RevenueComparisonSection.tsx` (mới) — dùng chung.
- `src/components/dashboard/TaxSummarySection.tsx` — Dashboard gọi `comparison=1` và render khối.
- `src/app/giao-ban/page.tsx` — bỏ component cục bộ, dùng component chung.
- `src/app/giao-ban/cau-hinh/page.tsx` — chọn loại đối chiếu, nhập nguồn/căn cứ, xác nhận/chốt, sửa target/mốc, xem lịch sử.
- `src/config/navigation.ts` — menu Cấu hình số liệu theo `metrics.config`.

---

## 3. Schema / migration

- Migration: `prisma/migrations/20261023150000_v3_phase_b_revenue/migration.sql`
- **Additive**, không xóa/đổi cột cũ; không suy đoán `comparison_kind` cho dữ liệu cũ (mặc định `NONE`).
- Đã rehearsal **chỉ trên** `talung_v3_phase_b` bằng `prisma db execute` (do DB test hiện không có lịch sử `_prisma_migrations` đầy đủ).
- **S0 cần:** diễn tập migration trên bản sao schema gần Production; không coi việc đã chạy trên DB test của S2 là bằng chứng Production.

---

## 4. Test / bằng chứng

| Bộ | Kết quả | Ghi chú |
|---|---|---|
| `npx tsc --noEmit` | **PASS** | |
| `npx prisma validate` | **PASS** | |
| `pnpm build` | **PASS** | Next.js 15.5.27, 98 trang |
| `scripts/test-v3-phase-b-revenue.ts` | **34/34 PASS** | API: quyền, target lifecycle, mốc, FLOW/lũy kế, %, zero denominator, B1, audit/revision |
| `scripts/test-v3-phase-b-ui.ts` | **14/14 PASS** | Dashboard + `/giao-ban` + cấu hình + mobile 390×844 + STAFF 403 |
| `scripts/test-yc30-navigation.ts` | **207 pass / 1 fail** | Fail `/change-password` coverage — **không liên quan thay đổi S2**, cần S0 xác nhận baseline |
| `scripts/test-yc26-29-api.ts` | **Chưa chạy** | Đã cập nhật theo `B-C-1` (comparisonKind + confirm target) nhưng bộ cũ khóa DB `localhost:54329`; cần chạy trên fixture của S0/S1 |
| `scripts/test-yc26-29-ui.ts` | **Chưa chạy** | Bộ cũ khóa DB `localhost:54329` |
| Phase A tests | **Chưa chạy lại** | Ngoài phạm vi S2; S0 regression sau merge |

**Bằng chứng:**
- `docs/evidence/multi-session/S2_PHASE_B_TEST_RESULTS_2026-10-23.json`
- `docs/evidence/phase-b/dashboard-comparison-desktop.png`
- `docs/evidence/phase-b/giao-ban-comparison-desktop.png`
- `docs/evidence/phase-b/giao-ban-cau-hinh-target.png`
- `docs/evidence/phase-b/giao-ban-target-history.png`
- `docs/evidence/phase-b/dashboard-comparison-mobile.png`
- `docs/evidence/phase-b/giao-ban-comparison-mobile.png`

Lệnh chạy lại:
```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_phase_b"
$env:DIRECT_URL=$env:DATABASE_URL
$env:TEST_BASE_URL="http://localhost:3112"
npx tsx scripts/test-v3-phase-b-revenue.ts
npx tsx scripts/test-v3-phase-b-ui.ts
```

---

## 5. Security checks

- [x] STAFF không xem/cấu hình chỉ tiêu giao: **403**.
- [x] SYSTEM_ADMIN không có `metrics.*`: **403** dù có `system.config`.
- [x] Không cấp `system.config` cho nghiệp vụ số liệu.
- [x] Target/baseline đã xác nhận/chốt không xóa trực tiếp; sửa phải qua revision + xác nhận lại.
- [x] Mọi thao tác target/baseline ghi revision + audit.
- [x] Không dùng Storage, không đổi fail-closed, không đụng Production.
- [x] Không commit secret/`.env`/dữ liệu cá nhân thật.

---

## 6. Quyết định còn PENDING

| Mã | Nội dung | Hành vi hiện tại |
|---|---|---|
| **B1** | “Tháng trước/cùng kỳ” so cùng số ngày hay cả tháng? | `percent=null`, `ruleState=PENDING_B1`; UI “Chờ chốt quy tắc” |
| **B2** | Quyền nhập/xác nhận/chốt chi tiết; nhập bù lũy kế; dữ liệu lịch sử | Dùng `metrics.config` + assignment; mọi sửa có revision/audit; chưa nhập bù hàng loạt |
| **C1** | Chỉ tiêu nào được giao, chu kỳ, chiều đánh giá | B không tự gắn target cho mọi chỉ tiêu; S3 tự cấu hình theo quyết định |

---

## 7. Contract B/C và phối hợp S3

- Hợp đồng: `docs/V3/DATA_CONTRACT_B_C_2026-10-23.md` — phiên bản **`B-C-1`**.
- Thông báo: `docs/evidence/multi-session/S2_CONTRACT_B_C_NOTICE_2026-10-23.md`.
- Đề nghị S3:
  - đọc/xác nhận `B-C-1` trước khi sửa API/schema/metric definitions dùng chung;
  - chỉ đọc các trường B; trạng thái C (`CHUA_NHAP`, `CHUA_DU_KY`, `KHONG_PHAT_SINH`, …) tính ở lớp read-model, không ghi đè trạng thái B;
  - không đổi `comparisonKind`/`status`/`sourceNote` của B.
- Đề nghị S0 ghi nhận `B-C-1` là baseline hợp đồng cho thứ tự tích hợp **S2 → S3**.

---

## 8. Conflict dự kiến

Các file S3/S0 cần lưu ý khi merge:
- `src/server/metrics.ts` (comparison + target fields)
- `src/app/api/metrics/admin/route.ts` (target/baseline API)
- `src/app/giao-ban/page.tsx`, `src/components/dashboard/TaxSummarySection.tsx` (S3 dùng chung `/giao-ban`/Dashboard)
- `prisma/schema.prisma` + migration Phase B
- `src/config/navigation.ts` (quyền menu cấu hình)

Không nhận “ours/theirs” mù quáng; đối chiếu `B-C-1` trước khi resolve.

---

## 9. Ready for integration?

**YES — có điều kiện:**
1. S3/S0 xác nhận hợp đồng `B-C-1`.
2. S0 diễn tập migration `20261023150000_v3_phase_b_revenue` trên bản sao schema gần Production; không chạy trực tiếp Production.
3. S0 chạy regression sau merge (gồm `test-yc26-29-api.ts` đã cập nhật) và xác nhận 1 fail `/change-password` của test navigation là baseline cũ, không do S2.
4. Không merge phần B1/B2/C1 như quyết định đã chốt khi chưa có văn bản.

**PRODUCTION_TOUCHED: NO**

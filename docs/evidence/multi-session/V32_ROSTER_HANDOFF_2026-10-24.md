# S5 V3.2 — YC-13 ROSTER — HANDOFF (2026-10-24)

## 1. Thông tin bàn giao

| Mục | Giá trị |
|---|---|
| SESSION | **S5 V3.2 — Duty Roster (E13)** |
| YC | **YC-13** — chỉ phần roster/ghi chú |
| BRANCH | `codex/v3.2-roster` |
| BASE_SHA | `a721fe7` (tag `v3.1-production-2026-10-24`) |
| COMMIT_SHA | `8dfe262` (A0) → `df51d23` (B2) → `1b178b9` (test) → commit tài liệu này |
| WORKTREE | `D:\thanhnx\OpenCode\talung-roster` |
| DB / PORT | `talung_v3_roster` / `3115` |
| SCHEMA_OR_MIGRATION | **Không có** — dùng cột `DutyRoster.notes` đã tồn tại; không migration mới |
| PRODUCTION_TOUCHED | **NO** — không Vercel/Supabase/Production, không reset/seed |
| READY_FOR_INTEGRATION | **YES** — điều kiện ghi tại mục 7 |

## 2. Quyết định E13 đã triển khai

| Mã | Quyết định được duyệt | Cách triển khai |
|---|---|---|
| **A0** | **Không** cho ghi chú trên ô trống (không có người) | API `POST /api/rosters` từ chối 400 với thông điệp rõ ràng khi có `notes` mà thiếu `personId` (kể cả chuỗi rỗng/khoảng trắng/null); `PATCH` phòng vệ không lưu notes cho dòng không có người. UI chỉ render nút/ô ghi chú ở dòng đã có người, chặn submit ở cả `SlotRow` và handler trang. Ghi chú của dòng đã có người giữ nguyên. |
| **B2** | Thêm **sheet phụ lục Excel** cho ghi chú; không sửa biểu in chính thức | Sheet riêng **“Ghi chú lịch trực”** ở cuối workbook, cột: STT / Ngày / Bộ phận / Người thực hiện / Vị trí – nhiệm vụ / Ô – điểm trực / Ghi chú. Chỉ tạo khi kỳ xuất có ít nhất 1 ghi chú. Các sheet `Bìa`, `Phân công N` giữ nguyên nội dung, merge, chiều cao dòng, thiết lập in. |
| **C0** | Giữ thao tác **“Đổi người” tách riêng** + bắt buộc lý do + audit | Không đổi hành vi hiện có (đã đúng từ V3.1); bổ sung test khẳng định: không có dropdown thay thế làm thao tác chính, bấm “Đổi người” mới mở, thiếu lý do bị chặn ở client + server, audit old/new person + reason + notes, đổi người tại chỗ (không tạo dòng mới), giữ ghi chú. |

Không thay đổi: quy tắc trực trưa (`isNoonDutyTitle`, tách nhóm trực), template/biểu in chính thức, module metrics/task/approval.

## 3. File thay đổi

| File | Nội dung |
|---|---|
| `src/lib/duty-roster.ts` | Hằng số `NOTES_REQUIRE_PERSON_MESSAGE` + helper `hasAssignedPerson` dùng chung server/client cho A0 |
| `src/app/api/rosters/route.ts` | A0: chặn notes khi thiếu người (POST + phòng vệ PATCH), chuẩn hóa `personId`; giữ nguyên phân quyền/audit/trực trưa |
| `src/app/roster/page.tsx` | A0: chỉ dòng đã có người mới có ghi chú; chặn submit ghi chú mồ côi; cập nhật dòng hướng dẫn trong phiếu phân công |
| `src/server/duty-export.ts` | B2: `DutyExportAssignment.notes`, gom dòng ghi chú, ghi sheet phụ lục với định dạng + thiết lập in riêng; không đụng `writeDayBlock`/`writeCover` |
| `src/app/api/rosters/export/route.ts` | Truyền `notes` vào workbook; audit `ROSTER_EXPORT` thêm `notesRows` |
| `scripts/test-yc13-e13-decisions.ts` | **Mới** — 34 check A0 (API) + B2 (workbook thật) + C0 (API/audit) |
| `scripts/test-yc13-e13-ui.ts` | **Mới** — 20 check A0/C0 qua UI thật (puppeteer) |
| `docs/evidence/multi-session/s5-yc13-e13/*.png` | 3 ảnh nghiệm thu E13 |

## 4. Kiểm thử đã chạy (local, `talung_v3_roster` / `3115`)

### 4.1 Hồi quy bắt buộc

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_roster"
$env:TEST_BASE_URL="http://localhost:3115"
npx tsx scripts/test-yc13-roster-notes.ts
npx tsx scripts/test-yc13-roster-ui.ts
```

| Bộ test | Kết quả |
|---|---|
| `test-yc13-roster-notes` (API/audit/export) | **22 PASS / 0 FAIL** |
| `test-yc13-roster-ui` (desktop/mobile/phiếu ngày) | **24 PASS / 0 FAIL** |

### 4.2 Test E13 mới

```powershell
npx tsx scripts/test-yc13-e13-decisions.ts
npx tsx scripts/test-yc13-e13-ui.ts
```

| Bộ test | Kết quả | Phủ chính |
|---|---|---|
| `test-yc13-e13-decisions` | **34 PASS / 0 FAIL** | A0-1..9: 400 + thông điệp rõ ràng, không tạo bản ghi/audit, ghi chú dòng có người không đổi. B2-1..13: sheet phụ lục đúng cột/giá trị, không chèn ghi chú vào sheet chính thức, sheet chính thức **giống hệt** khi có/không có ghi chú (ô, merge, chiều cao, thiết lập in), không tạo phụ lục khi không có ghi chú, audit `notesRows`. C0-1..9: thiếu lý do 400, lý do < 3 ký tự 400, đổi người 200 + audit old/new + giữ notes + tại chỗ, STAFF 403. |
| `test-yc13-e13-ui` | **20 PASS / 0 FAIL** | A0-1..9: ô trống không có nút/ô nhập/icon ghi chú, không POST notes thiếu `personId`, không bản ghi mồ côi, dòng có người vẫn hiện ghi chú. C0-1..9: nút “Đổi người” tách riêng, dropdown không hiện trước khi bấm, thiếu lý do bị chặn (DB không đổi), đủ lý do lưu đúng + audit + giữ notes + đúng ô. |

### 4.3 Baseline kỹ thuật

| Lệnh | Kết quả |
|---|---|
| `npx prisma validate` | PASS |
| `npx prisma generate` | PASS (client đồng bộ schema hiện tại) |
| `npx tsc --noEmit` | PASS (exit 0) |
| `pnpm build` | PASS (đủ route, `/roster` 16.8 kB) |
| `git diff --check` | PASS |

## 5. UI evidence

Thư mục: `docs/evidence/multi-session/s5-yc13-e13/`

| Ảnh | Nội dung |
|---|---|
| `01-editor-empty-slot-no-note-controls.png` | Ô trống “Người 2” chỉ có chọn cán bộ + Phân công, **không** có Ghi chú; dòng đã có người vẫn có Sửa ghi chú/Đổi người/Gỡ |
| `02-editor-change-person-reason-required.png` | “Đổi người” tách riêng: chọn người thay thế → ô lý do bắt buộc + nút Lưu đổi người/Hủy |
| `03-day-sheet-notes-after-change.png` | Phiếu ngày sau khi đổi người: người mới + ghi chú cũ vẫn hiển thị |

## 6. Bảo mật / toàn vẹn dữ liệu

- A0 chặn ở server (nguồn chốt), không tin client; không tạo bản ghi/audit cho yêu cầu bị từ chối.
- B2 chỉ đọc dữ liệu trong phạm vi `unitId` + quyền xuất như cũ; không đổi công thức/template in.
- C0 vẫn bắt buộc `UNIT_LEADER`/`DEPARTMENT_LEADER`, lý do ≥ 3 ký tự, audit `ROSTER_UPDATE` đầy đủ old/new; STAFF bị 403.
- Không dùng DB/credentials Production; test có guard cứng `talung_v3_roster` + localhost.
- Không commit secret; không thay đổi auth, Storage, YC10/YC11 flags.

## 7. Điều kiện tích hợp / lưu ý cho S0

1. **Không cần migration** — không có thay đổi schema; không cần chạy DDL trên integration/Production.
2. **Hành vi xuất Excel thay đổi có chủ đích theo B2**: kỳ xuất nào có ghi chú sẽ có thêm sheet cuối `Ghi chú lịch trực`. Các kỳ không có ghi chú giữ nguyên số sheet như trước.
3. `scripts/test-yc24-api.ts` (ngoài phạm vi lần này) có kỳ vọng cứng `worksheets.length === 4` cho kỳ 17–25/10. Nếu chạy trên DB có ghi chú trong kỳ, cần cập nhật kỳ vọng này (thêm 1 sheet phụ lục) — **không phải lỗi sản phẩm**. Test này hiện có guard DB riêng `localhost:54329`, không chạy trên DB S5.
4. Không chạy `test-yc24-ui.ts` trên DB demo: script này dọn toàn bộ roster 12–26/10 (đã ghi trong handoff V3.1).
5. Screenshot cũ `s5-yc13/*.png` được giữ nguyên bản (test hồi quy ghi đè khi chạy; đã revert để branch sạch). Ảnh E13 mới nằm ở thư mục riêng.

## 8. Trạng thái branch

- Branch `codex/v3.2-roster` sạch sau commit tài liệu này.
- Không merge `integration`/`main`; không deploy; không ghi Production.
- S0 là bên duy nhất merge và chạy lại regression trên integration.

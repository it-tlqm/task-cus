# KẾT QUẢ REGRESSION REMEDIATION — 24/10/2026

- **Trạng thái:** `PASS WITH LIMITATIONS`
- **Commit test:** `5c4c0cfa9e0a4a0055e6c95b36205cc09bf1edaf` (`codex/v3-remediation-p0`)
- **Commit bằng chứng:** `9a5278f` (chỉ thêm tài liệu, không đổi source/test)
- **Thời điểm chạy:** 24/10/2026, khoảng 15:19–15:26 (+07); bổ sung YC-10 quality lúc 15:36–15:37 (+07)
- **Môi trường:** Windows 10.0.26200, Node `v24.20.0`, pnpm `12.11.2`, Next.js `15.5.27`
- **Database:** PostgreSQL local, fixture `talung_v3_fixture_integration` (không ghi connection string/token)
- **Server:** dùng dev server local sẵn có ở cổng `3100`; sau đó dừng và tự khởi động server `3117` với `V3_YC10_QUALITY=true`; đã dừng toàn bộ trước khi build
- **Phạm vi:** chỉ đọc/ghi fixture local. Không chạy migration, không reset database, không deploy.

---

## 1. Lệnh và kết quả

| # | Lệnh | Điều kiện | Kết quả | Exit |
|---|---|---|---|---|
| 1 | `npx tsc --noEmit` | — | **PASS** — không lỗi type | 0 |
| 2 | `npx prisma validate` | schema local | **PASS** — schema hợp lệ | 0 |
| 3 | `$env:TZ="UTC"; npx tsx scripts/test-v3-timezone.ts` (PowerShell) | server 3117 + fixture account | **PASS** — 65 pass / 0 fail | 0 |
| 4 | `npx tsx scripts/test-v3-purge-safety.ts` | static | **PASS** — 69 pass / 0 fail | 0 |
| 5 | `npx tsx scripts/test-v3-auth-storage.ts` | server 3100 + Brave | **PASS** — 61 pass / 0 fail / 0 skip (gồm browser E2E) | 0 |
| 6 | `npx tsx scripts/test-v3-auth-revocation.ts` | server 3100, đúng fixture DB | **PASS** — 62 pass / 0 fail / 0 skip | 0 |
| 7 | `npx tsx scripts/test-v3-ai-summary-scope.ts` | fixture DB | **PASS** — 23 pass / 0 fail / 0 skip | 0 |
| 8 | `npx tsx scripts/test-v3-middleware-paths.ts` | static unit | **PASS** — 12 pass / 0 fail | 0 |
| 9 | `npx tsx scripts/test-v3-quality-history-visibility.ts` | server 3117, `V3_YC10_QUALITY=true` | **PASS** — 25 pass / 0 fail | 0 |
| 10 | `npx tsx scripts/test-v3-e12-unified-history.ts` | server 3100 | **PASS** — 24 pass / 0 fail | 0 |
| 11 | `npx tsx scripts/test-v3-task-approval-hardening.ts` | server 3100 | **PASS** — 40 pass / 0 fail | 0 |
| 12 | `npx tsx scripts/test-v3-yc10-quality.ts` (bổ sung) | server 3117, `V3_YC10_QUALITY=true`, fixture DB | **PASS** — 120 pass / 0 fail | 0 |
| 13 | `pnpm build` | dev server đã dừng | **PASS** — `prisma generate` + compile + type check thành công | 0 |

Tổng test chạy lại trong điều kiện đúng: **501 lượt kiểm tra pass, 0 fail, 0 skip** (65 + 69 + 61 + 62 + 23 + 12 + 25 + 24 + 40 + 120 = 501).

### Tóm tắt output (đã lược thông tin nhạy cảm)

- `test-v3-quality-history-visibility.ts`: `25 PASS / 0 FAIL`; collaborator thấy quality `null`, owner/UNIT_LEADER thấy `80`, flag OFF trả `null`.
- `test-v3-yc10-quality.ts`: `120 PASS / 0 FAIL`; gồm validation 65..100 bước 5, điều chỉnh quality, flag ON/OFF, export 01A có/không sheet "Đánh giá chất lượng", DB CHECK constraint, và xác nhận không sinh điểm/monthly ngoài fixture.
- `pnpm build`: `✓ Compiled successfully in 21.6s`; type check và toàn bộ route table hoàn tất, exit 0.

---

## 2. Lần chạy đầu và lỗi môi trường (đã chạy lại)

| Test | Lần đầu | Nguyên nhân | Sau khi sửa môi trường |
|---|---|---|---|
| `test-v3-quality-history-visibility.ts` | 22 pass / **3 fail** | Server `3100` chạy với `V3_YC10_QUALITY` OFF; owner/leader nhận `qualityPercent=null`, thiếu câu "Mức chất lượng" trong thông báo | 25 / 0 khi chạy server `3117` với flag ON |
| `test-v3-auth-revocation.ts` | 33 pass / **1 fail** (`fixture login returns 200` → HTTP 401) | Test ghi fixture vào `talung_v3_integration` nhưng server `3100` dùng `talung_v3_fixture_integration` | 62 / 0 khi truyền đúng `DATABASE_URL` của server |
| `test-v3-timezone.ts` | 53 / 0, **1 skip** (Dashboard API) | Chưa đặt `TEST_BASE_URL`/tài khoản fixture | 65 / 0, không skip |
| `test-v3-auth-storage.ts` | 28 / 0, **2 skip** (header runtime, browser E2E) | Chạy source-only, chưa có server | 61 / 0 / 0 với `TEST_BASE_URL` + Brave |

Các fail trên là **cấu hình môi trường**, không phải lỗi sản phẩm; không sửa source hay test để làm xanh. Không có fail nào còn lại sau khi chạy đúng điều kiện.

---

## 3. Giới hạn / lưu ý

1. **Quality flag:** các assertion dương tính của quality chỉ đúng khi `V3_YC10_QUALITY=true`. File `.env.production.example` không đặt biến này, mặc định OFF — gate này chứng minh code path, không chứng minh Production đang bật quality.
2. **Phạm vi dữ liệu:** test ghi/xoá fixture có tag trên database local; đã dùng `talung_v3_fixture_integration`, không dùng dữ liệu thật. `test-v3-yc10-quality.ts` được chạy trên cùng DB/server với test quality history (header test gợi ý `talung_v3_approval_impl_quality`, nhưng cùng schema và tài khoản demo); 120/120 kiểm tra pass, gồm cả kiểm tra DB constraint.
3. **Không chạy:** các suite legacy ngoài phạm vi remediation (`test-v3-e2e-flow.ts`, `test-v3-f01-f05.ts`, `test-v3-f18-routine.ts`, `test-v3-e8-return-progress.ts`, `test-v3-evidence-adjustment.ts`, `test-v3-multi-product.ts`, `test-v3-permissions.ts`, `test-v3-private-attachments.ts`, `test-v3-review-flow.ts`, `test-v3-yc09-per-person.ts`, `test-v3-yc11-precheck.ts`, `test-v3-phase-a/*`, `test-v3-phase-b/*`, các test YC-37/YC-38 và approvals cũ) — không có trong brief Task 2.5 hoặc cần fixture chuyên biệt; không tuyên bố pass cho các suite này.
4. **Browser E2E:** dùng Brave có sẵn trên máy; không lưu screenshot trong bằng chứng này.
5. **Build:** chỉ chạy sau khi dừng dev server để tránh khoá `.next`/Prisma DLL trên Windows; build thật đã hoàn tất, không có EPERM.
6. **Không kiểm tra:** Production/Supabase, migration, backup/PITR, Vercel deploy — ngoài phạm vi Task 2.5.

---

## 4. Xác nhận không chạm Production

**Không có ghi Production.** Không kết nối Supabase/Production, không chạy migration, không reset dữ liệu, không deploy, không thay đổi cấu hình Production. Mọi thao tác ghi chỉ diễn ra trên database fixture local; dev server tự khởi động đã được dừng, cổng `3100`/`3117` đã giải phóng.

---

## 5. Kết luận

`PASS WITH LIMITATIONS` — toàn bộ typecheck, Prisma validate, 7 test mới, 3 regression liên quan (E12 unified history, approval hardening, YC-10 existing quality) và production build đều pass trong điều kiện fixture đã nêu. Giới hạn chính là quality phụ thuộc flag `V3_YC10_QUALITY` (mặc định OFF ở Production), phạm vi chỉ local/fixture, và các suite legacy ngoài phạm vi không được chạy (liệt kê ở mục 3).

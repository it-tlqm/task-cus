# MỤC LỤC SCRIPT — TALUNG-CUS-WORK

> **Cách chạy:** `pnpm exec tsx scripts/<tên-file>.ts` (tsx có sẵn trong devDependencies).
> Hầu hết script kiểm thử cần **dev server cục bộ** (mặc định `http://localhost:3000`)
> và **DB demo đã seed**. Chi tiết điều kiện/biến môi trường: xem chú thích đầu mỗi file.
>
> Quy ước: file `_tmp-*` là script tạm theo ngày — **chỉ lưu cục bộ**, đã bị `.gitignore`.
> File `demo-*` là bộ công cụ dữ liệu demo — hiện **chưa commit** (lưu cục bộ).

## 1. Vận hành CSDL (production / on-prem)

| Script | Việc |
| --- | --- |
| `backup-db.sh` / `backup-db.ps1` | `pg_dump` + nén gzip, tự xoá bản sao lưu cũ hơn 30 ngày (Linux / Windows) |
| `restore-db.sh` | Phục hồi từ file `.sql.gz`, yêu cầu gõ `DONG_Y` xác nhận ghi đè |
| `backup-json.ts` | Xuất snapshot dữ liệu dạng JSON |
| `check-migrations.ts` | Kiểm tra trạng thái migration so với schema |
| `verify-fresh-db-migration.ts` / `test-clean-migration.ts` | Dựng DB trắng và chạy toàn bộ migration để xác minh |

## 2. Áp DDL thủ công (khi KHÔNG chạy `prisma migrate deploy` — ví dụ trên Vercel)

`apply-yc11-ddl.ts`, `apply-dotb-ddl.ts`, `apply-roster-ddl.ts`, `apply-meetings-ddl.ts`,
`apply-push-ddl.ts`, `apply-docs-ddl.ts`, `apply-report-ddl.ts`, `apply-e1-ddl.ts`,
`apply-yc23-25-ddl.ts`, `apply-yc24-ddl.ts`, `apply-yc24b-ddl.ts`
— idempotent; chạy tay khi triển khai gói tương ứng.

## 3. Tài khoản & tổ chức

| Script | Việc |
| --- | --- |
| `create-superadmin.ts` | Tạo tài khoản quản trị hệ thống |
| `promote-to-leader.ts` / `promote-team-leads.ts` | Gán vai trò lãnh đạo (đơn vị / bộ phận) |
| `set-position.ts` | Gán chức danh |
| `rename-units-official.ts` | Chuẩn hoá tên đơn vị theo phản hồi Hải quan |
| `remove-temp-accounts.ts` | Xoá tài khoản tạm seed `HQTL-*`; **mặc định dry-run**, chạy thật thêm `--apply` |
| `reset-business-data.ts` | ⚠️ **LÀM TRỐNG dữ liệu nghiệp vụ** (giữ cơ cấu/danh mục/tài khoản thật) — thao tác nguy hiểm, cần xác nhận đặc biệt |
| `publish-official-catalog.ts` | Phát duyệt 48 hoạt động mẫu chính thức + đặt chu kỳ báo cáo theo nhóm (TTHQ / GSHQ / tồn đọng / đánh giá) |
| `import-product-catalog.ts` | Nạp danh mục mặt hàng/sản phẩm |
| `seed-production-officers.ts` | Nạp danh sách cán bộ & chức danh cho môi trường thật |

## 4. Dữ liệu demo / seed (chỉ dùng trên DB demo)

- `seed-giao-ban-metrics.ts`, `seed-rich-uat-data.ts`, `seed-yc24-catalog.ts`, `demo-local-yc24-accounts.ts`
- Bộ `demo-*.ts` (cục bộ, chưa commit) — tạo/kiểm tra/sao lưu dữ liệu demo
- ⚠️ `pnpm seed` (chạy `prisma/seed.ts`) **xoá 27 bảng** rồi nạp dữ liệu demo — chỉ dùng trên DB demo

## 5. Bộ kiểm thử (cần dev server cục bộ + DB demo)

- **Chạy tổng:** `run-full-acceptance-suite.ts` (AT-01..24), `run-full-system-uat.ts`,
  `run-ui-plan-test.ts`, `run-visual-qa-suite.ts`
- **Theo gói yêu cầu:** `test-yc23-25-api/ui`, `test-yc24-api/ui`, `test-yc26-29-api/ui`,
  `test-02c-export`, `test-monthly-export`, `test-monthly-score`, `test-period-helper`,
  `test-task-transitions`, `test-snapshots-reality`, `test-notifications-reality`,
  `test-routine-reality`, `test-approvals-reality`, `test-dashboard-reality`,
  `test-personnel-reality`, `test-catalog(-advanced)-reality`, `test-system-reality`,
  `test-real-life-operations`, `test-policy-guards`, `test-security-suite`,
  `test-password-isolation`, `test-login-flow`, `test-http`, `test-backend`,
  `test-milestone-2/3`, `test-p0-fix-08`, `test-fix-09-personal-reports`,
  `test-yc04-idempotency-logic`, `uat-canbo-a-interactive`
- **Kiểm chứng (`verify-*`):** nội dung xuất Excel, xuất tháng, responsive viewport,
  các trang UI, tương tác/hiệu ứng, padding, dữ liệu seed, GSHQ/GPS, các hotfix…

## 6. Chụp ảnh bằng chứng (Puppeteer + dev server)

`capture-*.ts` (5 file), `generate-visual-diff.ts`, `run-visual-qa-suite.ts`,
`sync-all-stitch-screens.ts`, `compare-templates.ts`

## 7. Công cụ mẫu biểu & script một lần (giữ để tra cứu)

`make-02c-template.ts`, `make-export-template.ts`, `expand-template-band.ts`,
`export-docs-docx.py`, `add-custom-item.ts`, `add-exact-seal-gps.ts`,
`fix-yc06-form-required.ts`, `inspect-*.ts` (5), `check-canbo-plans.ts`,
`check-db-items.ts`, `find-draft-plans.ts`

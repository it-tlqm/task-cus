# YC-10 Phase 2 — Migration rehearsal (LOCAL ONLY)

**Ngày:** 23/10/2026  
**Session:** S6-Impl Phase 2  
**Database:** `talung_v3_approval_impl_quality` (localhost)  
**Migration:** `20261023180000_v3_approval_quality`  
**Production touched:** **NO**

## 1. Phạm vi migration

- `ALTER TABLE approval_decisions ADD COLUMN quality_percent INTEGER` (nullable, không default/backfill).
- `CHECK` quality NULL hoặc 65–100 bước 5.
- Bảng `approval_quality_adjustments`: case/decision, revision, old/new quality, reason, requester,
  status, decider, timestamps.
- `CHECK` old/new quality, status, revision; unique `(decision_id, revision)`; FK case/decision/người.
- Không đổi cột/bảng khác; không chạm QĐ1277/monthly/scoring/ProductItem/WorkItemProduct.

## 2. Lệnh rehearsal

```powershell
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/talung_v3_approval_impl_quality"
$env:DIRECT_URL=$env:DATABASE_URL

# 1) Trạng thái đã apply
npx tsx scripts/verify-v3-yc10-schema.ts applied

# 2) Rollback
npx prisma db execute --file scripts/sql/v3_approval_quality_rollback.sql --schema prisma/schema.prisma

# 3) Xác nhận rollback
npx tsx scripts/verify-v3-yc10-schema.ts rolledback

# 4) Re-apply
npx prisma db execute --file prisma/migrations/20261023180000_v3_approval_quality/migration.sql --schema prisma/schema.prisma

# 5) Xác nhận re-apply
npx tsx scripts/verify-v3-yc10-schema.ts applied
```

## 3. Kết quả

| Bước | Kết quả | Bằng chứng |
|---|---|---|
| Apply (trước rehearsal) | PASS — cột `quality_percent` integer nullable; bảng + 4 FK + 4 CHECK + unique | `migration-schema-before.json` |
| Rollback | PASS — bảng/cột biến mất; **10 ApprovalDecision cũ vẫn còn** | `migration-schema-rolledback.json` |
| Re-apply | PASS — cột/bảng/constraint/index trở lại; 10 decision cũ vẫn NULL quality | `migration-schema-reapplied.json` |

- `_prisma_migrations` không tồn tại trên DB clone này (DB được tạo bằng `db push` trước đó);
  migration được áp bằng `prisma db execute` đúng như Phase 1. Không chạy `migrate deploy`.
- Dữ liệu cũ: `approval_decisions` giữ nguyên; `quality_percent` NULL = “chưa đánh giá”.
- Rollback SQL: `scripts/sql/v3_approval_quality_rollback.sql`.

## 4. Ghi chú release

- Khi S0 hợp nhất vào integration/production, migration phải chạy theo quy trình release chuẩn
  (backup + rehearsal + `migrate deploy` ở môi trường đích). Tài liệu này chỉ chứng minh
  migration chạy được trên DB test cục bộ.
- Không có backfill, không có default, không có thay đổi dữ liệu nghiệp vụ.

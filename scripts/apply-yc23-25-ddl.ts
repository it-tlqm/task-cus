/**
 * YC-23 + YC-25 — Áp DDL additive lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261018120000_yc23_yc25_selection_catalogs/migration.sql
 *
 * Chạy trên DB test cục bộ:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL; npx tsx scripts/apply-yc23-25-ddl.ts
 * Chạy trên Production (SAU KHI ĐƯỢC PHÊ DUYỆT — đọc kỹ docs bàn giao trước):
 *   npx tsx scripts/apply-yc23-25-ddl.ts
 *
 * Idempotency: CREATE TABLE/INDEX -> IF NOT EXISTS; ADD COLUMN -> IF NOT EXISTS; ADD CONSTRAINT -> kiểm tra pg_constraint.
 * Rollback: prisma/migrations/20261018120000_yc23_yc25_selection_catalogs/rollback.sql
 */
import { prisma } from "../src/server/db";
import fs from "fs";

async function main() {
  const file = "prisma/migrations/20261018120000_yc23_yc25_selection_catalogs/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  // Idempotent: chỉ tạo khi chưa có
  sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
  sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
  sql = sql.replace(/ADD COLUMN     "/g, 'ADD COLUMN IF NOT EXISTS "');
  sql = sql.replace(/\bADD COLUMN "/g, 'ADD COLUMN IF NOT EXISTS "');
  // Bỏ toàn bộ dòng chỉ có comment (tránh tách nhầm câu lệnh khi comment chứa dấu ';')
  const codeOnly = sql
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const statements = codeOnly
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  let applied = 0;
  let skipped = 0;
  for (const st of statements) {
    // Bỏ qua ADD CONSTRAINT trùng (chạy lại sẽ lỗi) — kiểm tra pg_constraint trước
    if (/ADD CONSTRAINT/.test(st)) {
      const m = st.match(/ADD CONSTRAINT "([^"]+)"/);
      const name = m?.[1] || "";
      const exists: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS c FROM pg_constraint WHERE conname = '${name}'`
      );
      if (Number(exists[0]?.c || 0) > 0) {
        console.log(`SKIP constraint ${name} (da ton tai)`);
        skipped++;
        continue;
      }
    }
    await prisma.$executeRawUnsafe(st);
    applied++;
  }
  console.log(`DDL-OK (applied=${applied}, skipped=${skipped})`);
}

main()
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));

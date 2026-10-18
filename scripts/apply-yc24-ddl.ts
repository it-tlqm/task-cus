/**
 * YC-24 — Áp DDL additive lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261019100000_yc24_duty_assignment/migration.sql
 *
 * Chạy trên DB test cục bộ (PG nhúng, port 54329):
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL; npx tsx scripts/apply-yc24-ddl.ts
 * Chạy trên Production (CHỈ SAU KHI ĐƯỢC PHÊ DUYỆT — đọc docs bàn giao trước):
 *   npx tsx scripts/apply-yc24-ddl.ts
 *
 * Idempotency: CREATE TABLE/INDEX -> IF NOT EXISTS; ADD COLUMN -> IF NOT EXISTS; ADD CONSTRAINT -> kiểm tra pg_constraint;
 *              INSERT seed -> ON CONFLICT (code) DO NOTHING (không ghi đè bản ghi đã có).
 * Rollback khẩn cấp: prisma/migrations/20261019100000_yc24_duty_assignment/rollback.sql (chỉ khi có phê duyệt riêng).
 */
import { prisma } from "../src/server/db";
import fs from "fs";

function maskedTarget(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(khong doc duoc)";
  }
}

async function main() {
  console.log(`DB dich: ${maskedTarget()}`);
  const file = "prisma/migrations/20261019100000_yc24_duty_assignment/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  // Idempotent: chỉ tạo khi chưa có
  sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
  sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
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
  const posCount: Array<{ c: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS c FROM duty_positions`
  );
  console.log(`DDL-OK (applied=${applied}, skipped=${skipped}, duty_positions=${Number(posCount[0]?.c || 0)})`);
}

main()
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));

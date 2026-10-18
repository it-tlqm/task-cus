/**
 * YC-24 PHƯƠNG ÁN B — Áp DDL lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261020100000_yc24b_per_department/migration.sql
 *
 * KHÔNG chạy prisma migrate deploy / prisma db push. Chạy script này:
 *  • Local:  $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL; npx tsx scripts/apply-yc24b-ddl.ts
 *  • Production (CHỈ SAU KHI ĐỦ ĐIỀU KIỆN DEPLOY — xem docs bàn giao): npx tsx scripts/apply-yc24b-ddl.ts
 *
 * Idempotency: CREATE ... -> IF NOT EXISTS; DROP INDEX -> IF EXISTS; ADD COLUMN -> IF NOT EXISTS;
 *              ADD CONSTRAINT -> kiểm tra pg_constraint trước khi thêm.
 * Đặc điểm: chỉ THÊM cột/index và ĐỔI unique index (đã đánh giá trong migration.sql) — không xóa bảng/cột/dữ liệu.
 */
import { prisma } from "../src/server/db";
import fs from "fs";

function maskedTarget(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(khong doc duoc)";
  }
}

async function main() {
  console.log(`DB dich: ${maskedTarget()}`);
  const file = "prisma/migrations/20261020100000_yc24b_per_department/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  // Idempotent hóa
  sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
  sql = sql.replace(/DROP INDEX "/g, 'DROP INDEX IF EXISTS "');
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
  // Xác minh cấu trúc sau khi áp
  const cols: Array<{ table_name: string; column_name: string }> = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name IN ('duty_rosters','duty_positions','duty_day_infos')
       AND column_name = 'unit_id' ORDER BY table_name`
  );
  const idx: Array<{ indexname: string }> = await prisma.$queryRawUnsafe(
    `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
     ('duty_rosters_unit_id_date_slot_key_key','duty_day_infos_unit_id_date_key','duty_rosters_date_slot_key_key','duty_day_infos_date_key')
     ORDER BY indexname`
  );
  const oldLeft = idx.filter((i) => i.indexname === "duty_rosters_date_slot_key_key" || i.indexname === "duty_day_infos_date_key").length;
  console.log(`DDL-OK (applied=${applied}, skipped=${skipped})`);
  console.log(`  unit_id có mặt trên: ${cols.map((c) => c.table_name).join(", ") || "(THIẾU!)"}`);
  console.log(`  unique index mới: ${idx.filter((i) => i.indexname.includes("unit_id")).map((i) => i.indexname).join(", ") || "(THIẾU!)"}`);
  console.log(`  unique index cũ còn sót: ${oldLeft === 0 ? "không (đúng)" : "CÒN — kiểm tra lại!"}`);
  if (cols.length !== 3 || oldLeft !== 0) {
    console.error("VERIFY-ERR: cấu trúc chưa đúng như thiết kế.");
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));

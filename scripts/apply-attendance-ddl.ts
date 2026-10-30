/**
 * Áp DDL module Chấm công (additive, idempotent).
 *
 * Production của task-cus KHÔNG dùng `prisma migrate deploy` (không có _prisma_migrations).
 * Chạy script này với DATABASE_URL/DIRECT_URL của môi trường đích:
 *   npx tsx scripts/apply-attendance-ddl.ts
 */
import fs from "fs";
import { prisma } from "../src/server/db";

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
  const file = "prisma/migrations/20261030140000_attendance_module/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
  sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');

  const codeOnly = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  const statements = codeOnly
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  let applied = 0;
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
    applied++;
  }

  const tables: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('attendance_sheets','attendance_entries','attendance_grades','attendance_handovers')
     ORDER BY table_name`,
  );
  console.log(`DDL-OK (applied=${applied}, tables=${tables.map((t) => t.table_name).join(",")})`);
}

main()
  .catch((error) => {
    console.error("ERR:", error.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));

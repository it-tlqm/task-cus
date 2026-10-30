/**
 * Áp DDL additive cho số lượng nhiệm vụ + chi tiết đánh giá (idempotent).
 *
 * Production task-cus không dùng `prisma migrate deploy`.
 * Chạy với DATABASE_URL/DIRECT_URL của môi trường đích:
 *   npx tsx scripts/apply-task-quantity-eval-ddl.ts
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
  const file = "prisma/migrations/20261029120000_task_quantity_eval_detail/migration.sql";
  let sql = fs.readFileSync(file, "utf8");
  sql = sql.replace(/\bADD COLUMN "/g, 'ADD COLUMN IF NOT EXISTS "');

  const statements = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);

  let applied = 0;
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
    applied++;
  }

  const columns: Array<{ table_name: string; column_name: string }> = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (
         (table_name = 'tasks' AND column_name IN ('assigned_qty','completed_qty','quantity_unit','factor_snapshot','completed_date'))
         OR (table_name = 'personal_work_items' AND column_name IN ('assigned_qty','completed_qty','quantity_unit','factor_snapshot'))
         OR (table_name = 'evaluation_assessments' AND column_name IN ('common_criteria_detail','leader_d','leader_dd','leader_e'))
       )
     ORDER BY table_name, column_name`,
  );
  console.log(`DDL-OK (applied=${applied}, columns=${columns.length})`);
}

main()
  .catch((error) => {
    console.error("ERR:", error.message);
    process.exit(1);
  })
  .finally(() => process.exit(0));

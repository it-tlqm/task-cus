/**
 * YC-38C — Áp DDL additive lên CSDL (idempotent, an toàn chạy lại).
 * Nguồn: prisma/migrations/20261021120000_yc38c_work_item_linkage/migration.sql
 *
 * BẮT BUỘC: Production KHÔNG có bảng `_prisma_migrations` (đã kiểm tra 20/10/2026)
 *   => KHÔNG chạy `prisma migrate deploy`; dùng script này theo quy ước apply-script của dự án.
 *
 * Chạy thử trên DB local trước:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"; $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/apply-yc38c-ddl.ts
 *
 * Chạy trên Production (CHỈ SAU KHI có backup + restore-test PASS):
 *   npx tsx scripts/apply-yc38c-ddl.ts
 *
 * Cờ:
 *   --dry-run  : chỉ in kế hoạch (kiểm tra câu lệnh), KHÔNG ghi DB.
 *
 * Idempotency: CREATE TABLE/INDEX/COLUMN → IF NOT EXISTS; FK → kiểm tra pg_constraint.
 * An toàn dữ liệu: chỉ tạo bảng/cột/index MỚI; KHÔNG DROP, KHÔNG UPDATE/DELETE dữ liệu nghiệp vụ.
 * Rollback: DROP các bảng/cột MỚI (chỉ an toàn khi chưa có dữ liệu mới) hoặc deploy lại commit cũ.
 */
import { prisma } from "../src/server/db";
import fs from "fs";
import path from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const SQL_FILE = path.join(
  process.cwd(),
  "prisma/migrations/20261021120000_yc38c_work_item_linkage/migration.sql"
);

function maskedTarget(): string {
  const url = process.env.DATABASE_URL || "";
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ":" + u.port : ""}/${u.pathname.replace(/^\//, "")}`;
  } catch {
    return "(không đọc được)";
  }
}

/** Tách file SQL thành các câu lệnh (giữ nguyên khối DO $$ ... $$). */
function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let inDo = false;
  for (const rawLine of sql.split(/\r?\n/)) {
    const line = rawLine;
    if (!inDo && /^\s*DO\s+\$\$/i.test(line)) inDo = true;
    buf.push(line);
    if (inDo) {
      if (/\$\$;\s*$/.test(line)) {
        inDo = false;
        out.push(buf.join("\n"));
        buf = [];
      }
    } else if (/;\s*$/.test(line) && line.trim() !== "") {
      const stmt = buf.join("\n").trim();
      if (stmt) out.push(stmt);
      buf = [];
    }
  }
  const rest = buf.join("\n").trim();
  if (rest) out.push(rest);
  return out.filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

const NEW_TABLES = ["work_item_series", "work_item_assignments", "work_item_products"];

const NEW_COLUMNS: Record<string, string[]> = {
  personal_work_items: [
    "primary_owner_person_id",
    "primary_owner_unit_id",
    "source_kind",
    "source_ref_id",
    "source_code_snapshot",
    "series_id",
    "line_no",
  ],
  tasks: [
    "work_item_id",
    "created_by_id",
    "assigned_by_id",
    "source_kind",
    "source_ref_id",
    "source_code_snapshot",
  ],
  plan_items: ["work_item_id"],
  monthly_work_results: ["idempotency_key", "subject_kind", "subject_id", "line_no"],
};

/** Bảng nghiệp vụ phải giữ nguyên số bản ghi sau khi áp DDL. */
const COUNT_TABLES = [
  "personal_work_items",
  "tasks",
  "plan_items",
  "monthly_work_results",
  "routine_entries",
  "work_catalog_entries",
  "product_items",
  "activity_templates",
  "duty_rosters",
  "result_submissions",
  "task_assignees",
];

async function tableExists(t: string): Promise<boolean> {
  const r = await prisma.$queryRawUnsafe<{ n: number }[]>(
    `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    t
  );
  return r[0].n > 0;
}
async function columnsOf(t: string): Promise<string[]> {
  const r = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,
    t
  );
  return r.map((x) => x.column_name);
}
async function countOf(t: string): Promise<number> {
  const r = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM "${t}"`);
  return r[0].n;
}

async function main() {
  console.log("=== YC-38C — Áp DDL additive ===");
  console.log("Đích:", maskedTarget());
  if (DRY_RUN) console.log("CHẾ ĐỘ DRY-RUN: không ghi DB");

  // ---------- Preflight: bảng gốc phải tồn tại
  const required = [
    "personal_work_items",
    "tasks",
    "plan_items",
    "monthly_work_results",
    "people",
    "org_units",
    "reporting_periods",
    "product_items",
  ];
  const missing: string[] = [];
  for (const t of required) if (!(await tableExists(t))) missing.push(t);
  if (missing.length) {
    console.error("DỪNG — thiếu bảng gốc:", missing.join(", "));
    process.exit(1);
  }
  console.log("[preflight] Đủ các bảng gốc.");

  // ---------- Số liệu TRƯỚC
  const before: Record<string, number> = {};
  for (const t of COUNT_TABLES) before[t] = await countOf(t);
  console.log("[trước] " + COUNT_TABLES.map((t) => `${t}=${before[t]}`).join(" · "));

  // ---------- Thực thi
  const sql = fs.readFileSync(SQL_FILE, "utf8");
  const statements = splitStatements(sql);
  console.log(`[ddl] ${statements.length} câu lệnh`);

  if (!DRY_RUN) {
    let i = 0;
    for (const stmt of statements) {
      i++;
      const label = stmt.replace(/\s+/g, " ").slice(0, 72);
      try {
        await prisma.$executeRawUnsafe(stmt);
        console.log(`  [${String(i).padStart(2, "0")}] OK   ${label}`);
      } catch (e: any) {
        console.error(`  [${String(i).padStart(2, "0")}] LỖI ${label}`);
        console.error("     ", String(e.message).split("\n").slice(0, 3).join(" | "));
        process.exit(1);
      }
    }
  } else {
    statements.forEach((s, i) =>
      console.log(`  [${String(i + 1).padStart(2, "0")}] SKIP ${s.replace(/\s+/g, " ").slice(0, 72)}`)
    );
  }

  // ---------- Kiểm tra SAU
  console.log("\n=== Kiểm tra sau khi áp ===");
  let checksFailed = 0;

  for (const t of NEW_TABLES) {
    const ok = await tableExists(t);
    if (!ok) checksFailed++;
    console.log(`  ${ok ? "[OK]  " : "[LỖI]"} bảng mới ${t}`);
  }
  for (const [t, cols] of Object.entries(NEW_COLUMNS)) {
    const actual = await columnsOf(t);
    for (const c of cols) {
      const ok = actual.includes(c);
      if (!ok) checksFailed++;
      console.log(`  ${ok ? "[OK]  " : "[LỖI]"} cột mới ${t}.${c}`);
    }
  }

  const after: Record<string, number> = {};
  for (const t of COUNT_TABLES) after[t] = await countOf(t);
  console.log("\n[sau]  " + COUNT_TABLES.map((t) => `${t}=${after[t]}`).join(" · "));

  const drift = COUNT_TABLES.filter((t) => before[t] !== after[t]);
  if (drift.length) {
    checksFailed++;
    console.error("[LỖI] Số bản ghi thay đổi:", drift.join(", "));
  } else {
    console.log("[OK]   Số bản ghi mọi bảng nghiệp vụ KHÔNG đổi (0 mất dữ liệu).");
  }

  console.log(
    checksFailed === 0
      ? "\nYC38C-DDL: PASS — có thể chuyển chặng tiếp theo."
      : `\nYC38C-DDL: FAIL (${checksFailed} kiểm tra lỗi) — DỪNG, không tiếp tục.`
  );
  process.exit(checksFailed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

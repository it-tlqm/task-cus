/**
 * yc38c-backup.mjs — Backup JSON TOÀN BỘ bảng trước khi đổi schema (YC-38C).
 *
 *   node scripts/yc38c-backup.mjs [outDir]
 *
 * - Dùng DMMF của Prisma để liệt kê model → không bỏ sót bảng master
 *   (people, org_units, activity_groups, reporting_periods, product_groups…).
 * - Ghi ra demo-ops/ (đã .gitignore) → KHÔNG commit PII/dump DB.
 * - CHỈ ĐỌC trên DB: không create/update/delete.
 */
import { createRequire } from "node:module";
import fs from "fs";
import path from "path";
const REPO = "D:/thanhnx/OpenCode/talung-cus-work";
const require = createRequire(`${REPO}/package.json`);
const { PrismaClient, Prisma } = require("@prisma/client");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

/** Bảng bỏ qua (không phục hồi được/không cần) */
const SKIP = new Set([]);

function jsonSafe(v) {
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && v.constructor?.name === "Decimal") return v.toString();
  return v;
}

async function main() {
  const outDir = process.argv[2] || path.join(REPO, "demo-ops", "yc38c-backup");
  fs.mkdirSync(outDir, { recursive: true });

  const models = Prisma.dmmf.datamodel.models
    .filter((m) => !m.dbName || !SKIP.has(m.dbName))
    .map((m) => m.name);

  const payload = {
    backupAt: new Date().toISOString(),
    note: "YC-38C — backup toàn bộ bảng trước thay đổi schema (read-only)",
    counts: {},
    data: {},
  };

  let total = 0;
  for (const model of models) {
    const rows = await prisma[model].findMany();
    const safe = rows.map((r) => {
      const o = {};
      for (const [k, v] of Object.entries(r)) o[k] = jsonSafe(v);
      return o;
    });
    payload.data[model] = safe;
    payload.counts[model] = safe.length;
    total += safe.length;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `yc38c-before-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 1), "utf8");

  console.log("Backup:", file);
  console.log("so model:", models.length, "| tong so ban ghi:", total);
  console.log("dung luong:", (fs.statSync(file).size / 1024).toFixed(1), "KB");
  const nonEmpty = Object.entries(payload.counts).filter(([, n]) => n > 0);
  console.log("bang co du lieu:", nonEmpty.length, "->", nonEmpty.map(([k, n]) => `${k}=${n}`).join(", "));
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

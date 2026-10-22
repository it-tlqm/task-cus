/**
 * verify-reset-coverage.mjs — đối chiếu MA TRẬN XOÁ của script reset với dữ liệu
 * thực tế trong DB (chỉ đọc). Mục tiêu: không bảng nghiệp vụ nào bị sót.
 *
 * node scripts/verify-reset-coverage.mjs --db=<url>
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const creq = createRequire(path.join(REPO, "package.json"));
const { PrismaClient } = creq("@prisma/client");

const arg = (k, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const DB = arg("db");
if (!DB) {
  console.error("Thiếu --db=<url>");
  process.exit(2);
}

// Lấy ma trận trực tiếp từ script reset (nguồn sự thật duy nhất)
const src = fs.readFileSync(path.join(REPO, "scripts", "reset-and-init.mjs"), "utf8");
const grab = (name) => {
  const m = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  return [...m[1].matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1]);
};
const DELETE = grab("DELETE_TABLES");
const REBUILD_TX = grab("REBUILD_TX");
const REBUILD_ORG = grab("REBUILD_ORG");
const KEEP = grab("KEEP_TABLES");
const covered = new Set([...DELETE, ...REBUILD_TX, ...REBUILD_ORG, ...KEEP]);

(async () => {
  const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
  const tables = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`
  );
  const rows = [];
  for (const t of tables) {
    const r = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${t.table_name}"`);
    rows.push({ table: t.table_name, n: r[0].n });
  }
  const withData = rows.filter((r) => r.n > 0);
  const notCovered = withData.filter((r) => !covered.has(r.table));

  console.log("=== MA TRAN RESET vs DU LIEU THUC TE ===");
  console.log(`  tong bang: ${rows.length} | bang co du lieu: ${withData.length} | bang rong: ${rows.length - withData.length}`);
  console.log(`  ma tran: DELETE ${DELETE.length} · REBUILD_TX ${REBUILD_TX.length} · REBUILD_ORG ${REBUILD_ORG.length} · KEEP ${KEEP.length}`);

  console.log("\n--- BANG CO DU LIEU ---");
  for (const r of withData) {
    const kind = DELETE.includes(r.table) ? "XOA" : REBUILD_TX.includes(r.table) || REBUILD_ORG.includes(r.table) ? "TAO LAI" : KEEP.includes(r.table) ? "GIU" : "*** CHUA CO TRONG MA TRAN ***";
    console.log(`  ${String(r.n).padStart(6)}  ${r.table.padEnd(34)} ${kind}`);
  }

  console.log("\n--- KET LUAN ---");
  if (!notCovered.length) {
    console.log("  PASS: moi bang co du lieu deu duoc xoa / tao lai / giu theo ma tran.");
  } else {
    console.log(`  FAIL: ${notCovered.length} bang co du lieu CHUA duoc ma tran xu ly:`);
    notCovered.forEach((r) => console.log(`   - ${r.table} (${r.n} dong)`));
  }

  // Bảng trong ma trận nhưng không tồn tại trong DB (để cập nhật ma trận)
  const existing = new Set(rows.map((r) => r.table));
  const stale = [...DELETE, ...REBUILD_TX, ...REBUILD_ORG, ...KEEP].filter((t) => !existing.has(t));
  if (stale.length) {
    console.log(`\n  GHI CHU: ${stale.length} ten bang trong ma tran khong ton tai trong DB: ${stale.join(", ")}`);
  }
  await prisma.$disconnect();
  process.exit(notCovered.length ? 1 : 0);
})().catch((e) => {
  console.error("LOI:", String(e.message).slice(0, 300));
  process.exit(1);
});

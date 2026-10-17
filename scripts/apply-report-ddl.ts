import { prisma } from "../src/server/db";
import fs from "fs";

async function main() {
  let sql = fs.readFileSync("prisma/migrations/20261017170000_briefing_report/migration.sql", "utf8");
  sql = sql.replace(/CREATE TABLE "/g, 'CREATE TABLE IF NOT EXISTS "');
  sql = sql.replace(/CREATE UNIQUE INDEX "/g, 'CREATE UNIQUE INDEX IF NOT EXISTS "');
  sql = sql.replace(/CREATE INDEX "/g, 'CREATE INDEX IF NOT EXISTS "');
  const statements = sql.split(";").map((s) => s.trim()).filter(Boolean);
  for (const st of statements) {
    if (/ADD CONSTRAINT/.test(st)) {
      const m = st.match(/ADD CONSTRAINT "([^"]+)"/);
      const name = m?.[1] || "";
      const exists: Array<{ c: number }> = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS c FROM pg_constraint WHERE conname = '${name}'`
      );
      if (Number(exists[0]?.c || 0) > 0) {
        console.log(`SKIP constraint ${name} (da ton tai)`);
        continue;
      }
    }
    await prisma.$executeRawUnsafe(st);
  }
  console.log("BRIEFING-REPORT-DDL-OK");
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); }).finally(() => process.exit(0));

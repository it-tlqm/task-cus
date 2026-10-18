/**
 * LOCAL TEST ONLY — đặt mật khẩu test đã biết cho tài khoản DEMO trên DB test cục bộ (YC-24).
 * Bị chặn cứng: chỉ chạy khi DATABASE_URL/DIRECT_URL trỏ localhost:54329.
 * Không đụng tài khoản cán bộ thật (chỉ demold01, democb01, democb02).
 *
 * Chạy:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@localhost:54329/talung_dev"; $env:DIRECT_URL=$env:DATABASE_URL; npx tsx scripts/demo-local-yc24-accounts.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const DB_URL = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
if (!DB_URL.includes("localhost:54329")) {
  console.error("❌ CHẶN AN TOÀN: script chỉ chạy trên DB test cục bộ (localhost:54329).");
  process.exit(1);
}
const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
const LOCAL_PASSWORD = "LocalTest@2026";

async function main() {
  const targets = ["demold01", "democb01", "democb02"];
  const hash = await bcrypt.hash(LOCAL_PASSWORD, 10);
  for (const username of targets) {
    const acc = await prisma.account.findUnique({ where: { username }, select: { id: true } });
    if (!acc) {
      console.log(`- ${username}: KHONG TON TAI tren local (bo qua)`);
      continue;
    }
    await prisma.account.update({ where: { username }, data: { passwordHash: hash, status: "ACTIVE" } });
    console.log(`- ${username}: da dat mat khau test local`);
  }
  console.log("XONG (mat khau test: LocalTest@2026)");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("LOI:", e.message);
  process.exit(1);
});

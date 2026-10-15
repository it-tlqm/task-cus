/**
 * Xóa tài khoản TẠM (seed HQTL-*) sau khi Hải quan xác nhận.
 * Giữ: superadmin (dantn), cơ cấu, danh mục, tài khoản thật khác (nếu có).
 * Dry-run mặc định. Thực thi: npx tsx scripts/remove-temp-accounts.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

async function main() {
  const apply = process.argv.includes("--apply");
  const temp = await prisma.person.findMany({
    where: { code: { startsWith: "HQTL-" } },
    include: { account: { select: { username: true, status: true } } },
  });
  console.log(`[TẠM] ${temp.length} người mã HQTL-*:`, temp.map((p) => `${p.code}/${p.account?.username}`).join(", "));
  const keep = await prisma.person.findMany({
    where: { NOT: { code: { startsWith: "HQTL-" } } },
    include: { account: { select: { username: true } } },
  });
  console.log(`[GIỮ] ${keep.length} người:`, keep.map((p) => `${p.code}/${p.account?.username ?? "no-account"}`).join(", "));

  if (!apply) {
    console.log("== DRY-RUN. Thêm --apply để xóa. ==");
    return;
  }
  const ids = temp.map((p) => p.id);
  if (ids.length > 0) {
    await prisma.person.deleteMany({ where: { id: { in: ids } } }); // cascade assignment/account/grant
  }
  console.log(`Đã xóa ${ids.length} người tạm. Còn lại: ${await prisma.person.count()} người, ${await prisma.account.count()} TK.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

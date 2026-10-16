/**
 * Gán chức vụ (position) cho phân công chính của cán bộ.
 * Chạy: npx tsx scripts/set-position.ts --username dantn --position DEPUTY_CHIEF [--apply]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const username = arg("--username")?.trim().toLowerCase();
  const posCode = arg("--position")?.trim().toUpperCase();
  if (!username || !posCode) {
    console.error("Thiếu --username hoặc --position.");
    process.exit(1);
  }
  const account = await prisma.account.findUnique({
    where: { username },
    include: {
      person: { include: { assignments: { where: { isPrimary: true }, include: { position: true, unit: true } } } },
    },
  });
  if (!account) {
    console.error("Không tìm thấy tài khoản.");
    process.exit(1);
  }
  const position = await prisma.position.findUnique({ where: { code: posCode } });
  if (!position) {
    console.error(`Không tìm thấy chức vụ ${posCode}.`);
    process.exit(1);
  }
  const primary = account.person.assignments[0];
  console.log(`Hiện tại: ${primary?.position?.title || "(trống)"} @ ${primary?.unit?.name || "?"}`);
  console.log(`Đề xuất: ${position.title} (${position.code})`);
  if (!apply) {
    console.log("== DRY-RUN. Thêm --apply để ghi. ==");
    return;
  }
  if (!primary) {
    console.error("Không có phân công chính.");
    process.exit(1);
  }
  await prisma.personAssignment.update({ where: { id: primary.id }, data: { positionId: position.id } });
  console.log("Đã cập nhật chức vụ.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

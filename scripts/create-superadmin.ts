/**
 * Khởi tạo tài khoản Quản trị hệ thống (SYSTEM_ADMIN) đầu tiên.
 * Dùng MỘT LẦN khi bàn giao. Mật khẩu sinh ngẫu nhiên, in RA MỘT LẦN duy nhất —
 * người chạy phải chuyển cho quản trị Hải quan qua kênh riêng (không chat nhóm, không email chung).
 *
 * Cách dùng:
 *   npx tsx scripts/create-superadmin.ts --username qt_admin --name "Nguyễn Hoàng Nam"
 *   npx tsx scripts/create-superadmin.ts --username qt_admin --name "..." --allow-second
 *
 * Từ chối chạy nếu đã tồn tại SYSTEM_ADMIN đang ACTIVE (trừ khi --allow-second).
 * KHÔNG bao giờ hardcode mật khẩu trong file này hay bất kỳ file nào khác.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function randomPassword(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function main() {
  const username = arg("--username")?.trim().toLowerCase();
  const fullName = arg("--name")?.trim();
  const allowSecond = process.argv.includes("--allow-second");

  if (!username || !/^[a-z0-9_]{4,32}$/.test(username)) {
    console.error("Thiếu --username hợp lệ (4-32 ký tự: chữ thường, số, gạch dưới).");
    process.exit(1);
  }
  if (!fullName || fullName.length < 2) {
    console.error("Thiếu --name (họ tên quản trị).");
    process.exit(1);
  }

  const existingAdmin = await prisma.account.findFirst({
    where: {
      status: "ACTIVE",
      roleGrants: { some: { role: { code: "SYSTEM_ADMIN" } } },
    },
    include: { person: true },
  });
  if (existingAdmin && !allowSecond) {
    console.error(
      `Đã tồn tại SYSTEM_ADMIN đang hoạt động ("${existingAdmin.username}"). ` +
        `Từ chối tạo thêm để tránh tài khoản quản trị mồ côi. Dùng --allow-second nếu thật sự cần.`
    );
    process.exit(1);
  }

  const role = await prisma.role.findUnique({ where: { code: "SYSTEM_ADMIN" } });
  if (!role) {
    console.error("Không tìm thấy vai trò SYSTEM_ADMIN trong DB. Hãy seed vai trò trước.");
    process.exit(1);
  }

  const dupUser = await prisma.account.findUnique({ where: { username } });
  if (dupUser) {
    console.error(`Tên đăng nhập "${username}" đã tồn tại.`);
    process.exit(1);
  }

  const rootUnit = await prisma.orgUnit.findFirst({
    where: { level: 1 },
    orderBy: { sortOrder: "asc" },
  });

  const password = randomPassword(16);
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        code: `QT-ADMIN-${Date.now().toString().slice(-4)}`,
        fullName,
        status: "ACTIVE",
        notes: "Tài khoản quản trị hệ thống khởi tạo khi bàn giao",
      },
    });
    const account = await tx.account.create({
      data: { personId: person.id, username, passwordHash, status: "ACTIVE" },
    });
    await tx.roleGrant.create({
      data: {
        accountId: account.id,
        roleId: role.id,
        scopeType: "ORGANIZATION",
        scopeUnitId: null,
      },
    });
    if (rootUnit) {
      const adminPos = await tx.position.findFirst({ where: { code: "ADMIN" } });
      await tx.personAssignment.create({
        data: {
          personId: person.id,
          unitId: rootUnit.id,
          positionId: adminPos?.id || null,
          isPrimary: true,
        },
      });
    }
    await tx.auditEvent.create({
      data: {
        actorId: account.id,
        action: "SUPERADMIN_BOOTSTRAPPED",
        resourceType: "Account",
        resourceId: account.id,
        newData: { username, fullName, at: new Date().toISOString() },
      },
    });
    return { person, account };
  });

  console.log("================================================================");
  console.log("TẠO SUPERADMIN THÀNH CÔNG — GHI LẠI NGAY, CHỈ HIỆN MỘT LẦN:");
  console.log(`  Tên đăng nhập: ${username}`);
  console.log(`  Mật khẩu:      ${password}`);
  console.log(`  Người dùng:    ${result.person.fullName} (${result.person.code})`);
  console.log("----------------------------------------------------------------");
  console.log("BẮT BUỘC: đăng nhập ngay và đổi mật khẩu (nút Đổi MK trên header).");
  console.log("Chuyển thông tin qua kênh riêng. Không lưu mật khẩu này vào file/chat.");
  console.log("================================================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

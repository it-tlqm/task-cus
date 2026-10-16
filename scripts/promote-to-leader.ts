/**
 * Chuyển tài khoản sang vai trò UNIT_LEADER (lãnh đạo đơn vị) để vừa quản trị
 * vừa xem/sử dụng số liệu nghiệp vụ. Giữ nguyên person/unit/position.
 * Kèm cấp quyền system.config cho vai trò UNIT_LEADER (để vẫn sửa được tham số hệ thống).
 * Chạy: npx tsx scripts/promote-to-leader.ts --username dantn [--apply]
 * Mặc định dry-run (chỉ in dự kiến).
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
  if (!username) {
    console.error("Thiếu --username.");
    process.exit(1);
  }

  const account = await prisma.account.findUnique({
    where: { username },
    include: { person: true, roleGrants: { include: { role: true } } },
  });
  if (!account) {
    console.error(`Không tìm thấy tài khoản "${username}".`);
    process.exit(1);
  }
  console.log(`TK: ${username} (${account.person.fullName})`);
  console.log("Grants hiện tại:", account.roleGrants.map((g) => `${g.role.code}/${g.scopeType}`).join(", "));

  const leaderRole = await prisma.role.findUnique({ where: { code: "UNIT_LEADER" } });
  if (!leaderRole) {
    console.error("Không tìm thấy vai trò UNIT_LEADER.");
    process.exit(1);
  }

  let sysPerm = await prisma.permission.findUnique({ where: { code: "system.config" } });
  console.log(`Quyền system.config trong DB: ${sysPerm ? "có" : "CHƯA CÓ"}`);
  const leaderHasSys = sysPerm
    ? await prisma.rolePermission.findFirst({
        where: { roleId: leaderRole.id, permissionId: sysPerm.id },
      })
    : null;
  console.log(`UNIT_LEADER có system.config: ${leaderHasSys ? "có" : "CHƯA CÓ"}`);

  if (!apply) {
    console.log("== DRY-RUN. Thêm --apply để thực hiện. ==");
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Xóa grant cũ, cấp UNIT_LEADER phạm vi toàn đơn vị
    await tx.roleGrant.deleteMany({ where: { accountId: account.id } });
    await tx.roleGrant.create({
      data: {
        accountId: account.id,
        roleId: leaderRole.id,
        scopeType: "ORGANIZATION",
        scopeUnitId: null,
      },
    });
    // Bảo đảm UNIT_LEADER sửa được tham số hệ thống
    if (!sysPerm) {
      sysPerm = await tx.permission.create({
        data: { code: "system.config", name: "Cấu hình hệ thống", module: "SYSTEM" },
      });
    }
    if (!(await tx.rolePermission.findFirst({ where: { roleId: leaderRole.id, permissionId: sysPerm.id } }))) {
      await tx.rolePermission.create({ data: { roleId: leaderRole.id, permissionId: sysPerm.id } });
    }
    await tx.auditEvent.create({
      data: {
        actorId: account.id,
        action: "ACCOUNT_ROLE_PROMOTED",
        resourceType: "Account",
        resourceId: account.id,
        newData: { username, newRole: "UNIT_LEADER", scope: "ORGANIZATION" },
      },
    });
  });
  console.log(`Đã chuyển "${username}" thành UNIT_LEADER (ORGANIZATION) + quyền system.config.`);
  console.log("Lưu ý: đăng xuất/đăng nhập lại để nhận quyền mới (JWT cũ hết hiệu lực sau tối đa 60 giây).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

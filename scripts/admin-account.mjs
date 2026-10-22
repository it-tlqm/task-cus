/**
 * admin-account.mjs — CƠ CHẾ KHÔI PHỤC QUYỀN QUẢN TRỊ ĐỘC LẬP.
 *
 * Tách khỏi `reset-and-init.mjs` (script reset dữ liệu) để:
 *  - KHÔNG phụ thuộc việc chạy lại toàn bộ quy trình reset khi quên mật khẩu admin.
 *  - KHÔNG bao giờ xóa/đụng tới dữ liệu nghiệp vụ.
 *
 * Lệnh:
 *   node scripts/admin-account.mjs status   --db=<url>
 *   node scripts/admin-account.mjs create   --db=<url> [--confirm=ADMIN-CREATE-2026-10-22]
 *   node scripts/admin-account.mjs reset-password --db=<url> --confirm=ADMIN-RESET-2026-10-22
 *   node scripts/admin-account.mjs unlock   --db=<url> --confirm=ADMIN-UNLOCK-2026-10-22
 *
 * Mật khẩu mới KHÔNG BAO GIỜ in ra log/chat: ghi vào file git-ignored trong
 * `demo-ops/reset/` kèm ACL giới hạn (chỉ tài khoản đang chạy lệnh).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const REPO = "D:/thanhnx/OpenCode/talung-cus-work/";
const creq = createRequire(path.join(REPO, "package.json"));
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");

const arg = (k, d = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const CMD = (process.argv[2] || "status").toLowerCase();
const DB = arg("db");
const CONFIRM = arg("confirm", "");
const OUT_DIR = path.join(REPO, "demo-ops", "reset");

const CONFIRM_TOKENS = {
  create: "ADMIN-CREATE-2026-10-22",
  "reset-password": "ADMIN-RESET-2026-10-22",
  unlock: "ADMIN-UNLOCK-2026-10-22",
};

if (!DB) {
  console.error("Thiếu --db=<url> (chuỗi kết nối Production/local).");
  process.exit(2);
}
if (CMD !== "status" && CONFIRM !== CONFIRM_TOKENS[CMD]) {
  console.error(
    `CHƯA XÁC NHẬN: lệnh "${CMD}" cần --confirm=${CONFIRM_TOKENS[CMD]} (lệnh xoá/thay đổi quyền quản trị).`
  );
  process.exit(2);
}

function writeSecretFile(content) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const file = path.join(OUT_DIR, `admin-tk-credentials-${stamp}.txt`);
  fs.writeFileSync(file, content, { encoding: "utf8", mode: 0o600 });
  // Siết ACL trên Windows: chỉ tài khoản đang chạy lệnh được đọc.
  try {
    const user = process.env.USERNAME;
    execFileSync("icacls", [file, "/inheritance:r", "/grant:r", `${user}:(F)`], {
      stdio: "ignore",
    });
  } catch {
    console.warn("  (không siết được ACL bằng icacls — kiểm tra quyền truy cập file thủ công)");
  }
  return path.relative(REPO, file);
}

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: DB } } });
  const masked = String(DB).replace(/:[^:@/]*@/, ":***@");
  console.log(`LỆNH: ${CMD} | DB: ${masked}`);

  const role = await prisma.role.findFirst({ where: { code: "SYSTEM_ADMIN" } });
  if (!role) {
    console.error("Không tìm thấy role SYSTEM_ADMIN trong DB.");
    await prisma.$disconnect();
    process.exit(2);
  }

  const acc = await prisma.account.findFirst({
    where: { username: "admin.tk" },
    include: { person: true, roleGrants: { include: { role: true } } },
  });

  if (CMD === "status") {
    if (!acc) {
      console.log("  Chưa có tài khoản admin.tk.");
    } else {
      console.log(`  admin.tk | person=${acc.person.code} ${acc.person.fullName}`);
      console.log(`  status=${acc.status} | mustChangePassword=${acc.mustChangePassword}`);
      console.log(
        `  grants=${acc.roleGrants.map((g) => `${g.role.code}/${g.scopeType}`).join(", ") || "(khong co)"}`
      );
      console.log(`  gan don vi: ${acc.person.assignments?.length ?? 0}`);
    }
    await prisma.$disconnect();
    return;
  }

  if (CMD === "create") {
    if (acc) {
      console.log("  Tài khoản admin.tk đã tồn tại — không tạo lại (idempotent).");
      await prisma.$disconnect();
      return;
    }
    const person = await prisma.person.create({
      data: {
        code: "ADMIN-TK",
        fullName: "Quản trị hệ thống (kỹ thuật)",
        status: "ACTIVE",
        notes:
          "Tài khoản quản trị kỹ thuật duy nhất khởi tạo mới. Không gán đơn vị Hải quan, không duyệt nghiệp vụ.",
      },
    });
    const pwd = crypto.randomBytes(18).toString("base64url");
    await prisma.account.create({
      data: {
        username: "admin.tk",
        passwordHash: await bcrypt.hash(pwd, 12),
        personId: person.id,
        status: "ACTIVE",
        mustChangePassword: true,
        roleGrants: { create: [{ roleId: role.id, scopeType: "ORGANIZATION" }] },
      },
    });
    const file = writeSecretFile(
      `TALUNG-CUS-WORK — TAI KHOAN SUPER ADMIN KY THUAT\n` +
        `Sinh luc: ${new Date().toISOString()}\n` +
        `Username: admin.tk\nMat khau khoi tao: ${pwd}\n\n` +
        `BAT BUOC doi mat khau o lan dang nhap dau tien.\n` +
        `KHONG commit, KHONG gui qua email/chat.\n`
    );
    await prisma.auditEvent.create({
      data: {
        action: "SYSTEM_ADMIN_CREATED",
        resourceType: "Account",
        resourceId: acc?.id || "admin.tk",
        newData: { username: "admin.tk", by: "admin-account.mjs", mode: CMD },
      },
    });
    console.log(`  Đã tạo admin.tk | mật khẩu: xem file ${file} (KHông in ra log)`);
    await prisma.$disconnect();
    return;
  }

  if (CMD === "reset-password") {
    if (!acc) {
      console.error("Không có tài khoản admin.tk — dùng lệnh create.");
      await prisma.$disconnect();
      process.exit(2);
    }
    const pwd = crypto.randomBytes(18).toString("base64url");
    await prisma.account.update({
      where: { id: acc.id },
      data: {
        passwordHash: await bcrypt.hash(pwd, 12),
        mustChangePassword: true,
        status: "ACTIVE",
      },
    });
    const file = writeSecretFile(
      `TALUNG-CUS-WORK — ĐẶT LẠI MẬT KHẨU SUPER ADMIN\n` +
        `Sinh luc: ${new Date().toISOString()}\n` +
        `Username: admin.tk\nMat khau moi: ${pwd}\n\n` +
        `BẮT BUỘC đổi mật khẩu ở lần đăng nhập đầu tiên.\n` +
        `KHÔNG commit, KHÔNG gửi qua email/chat.\n`
    );
    await prisma.auditEvent.create({
      data: {
        actorId: acc.id,
        action: "SYSTEM_ADMIN_PASSWORD_RESET",
        resourceType: "Account",
        resourceId: acc.id,
        newData: { username: "admin.tk", by: "admin-account.mjs", mode: CMD },
      },
    });
    console.log(`  Đã đặt lại mật khẩu admin.tk | xem file ${file} (KHông in ra log)`);
    await prisma.$disconnect();
    return;
  }

  if (CMD === "unlock") {
    if (!acc) {
      console.error("Không có tài khoản admin.tk.");
      await prisma.$disconnect();
      process.exit(2);
    }
    await prisma.account.update({
      where: { id: acc.id },
      data: { status: "ACTIVE" },
    });
    await prisma.auditEvent.create({
      data: {
        actorId: acc.id,
        action: "SYSTEM_ADMIN_UNLOCKED",
        resourceType: "Account",
        resourceId: acc.id,
        newData: { username: "admin.tk", by: "admin-account.mjs", mode: CMD },
      },
    });
    console.log("  Đã mở khóa tài khoản admin.tk.");
    await prisma.$disconnect();
    return;
  }

  console.error("Lệnh không hợp lệ. Dùng: status | create | reset-password | unlock");
  await prisma.$disconnect();
  process.exit(2);
}

main().catch(async (e) => {
  console.error("LỖI:", String(e.message || e).slice(0, 300));
  process.exit(1);
});

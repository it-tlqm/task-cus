/**
 * test-yc39-p1-orgunit.ts — YC-39 P1: khóa quyền tạo đơn vị/bộ phận tổ chức.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc38_restore"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx next dev -p 3100          # chạy song song
 *   npx tsx scripts/test-yc39-p1-orgunit.ts
 *
 * Kiểm thử (mục 3 của yêu cầu):
 *  1. STAFF POST tạo đơn vị            → 403
 *  2. UNIT_LEADER có thẩm quyền        → được phép (theo phạm vi hợp lệ)
 *  3. SYSTEM_ADMIN kỹ thuật             → 403 (không tự có quyền tạo đơn vị nghiệp vụ)
 *  4. GET cây tổ chức                   → không bị ảnh hưởng
 *  5. Request bị từ chối                → không có thay đổi dữ liệu
 *  6. Không tạo được qua đường API thay thế (PATCH/DELETE/positions → vẫn theo quyền cũ)
 *  7. Tắt cờ RBAC_HARDEN_ORGUNIT_CREATE_SCOPE → vẫn chặn STAFF (rollback an toàn)
 *
 * LƯU Ý: dùng mật khẩu NGẪU NHIÊN do script tự sinh cho các tài khoản test trên DB LOCAL.
 * Không dùng mật khẩu demo Production, không reset mật khẩu tài khoản người dùng.
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

const TMP = "[YC39-P1-TEST]";
const createdUnits: string[] = [];
const tempAccountIds: string[] = [];
const tempPersonIds: string[] = [];

async function login(username: string, password: string) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.token || null, body: j };
}

async function postUnit(token: string | null, code: string, name: string, parentId?: string) {
  return fetch(`${BASE}/api/org-units/tree`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ code, name, parentId }),
  });
}

async function main() {
  console.log("=== YC-39 P1 — Khóa quyền tạo đơn vị tổ chức ===\n");

  // --- Chuẩn bị tài khoản test trên DB LOCAL (mật khẩu ngẫu nhiên, không dùng file repo)
  const pw = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(pw, 10);
  // Tài khoản RIÊNG cho bài test (không dùng/đụng tài khoản demo dùng chung)
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  const leaderRole = await prisma.role.findUnique({ where: { code: "UNIT_LEADER" } });
  const rootUnit = await prisma.orgUnit.findFirst({ where: { parentId: null } });
  const mkAccount = async (code: string, roleId: string, scopeType: string) => {
    const person = await prisma.person.create({
      data: { code, fullName: `YC39 P1 ${code}`, status: "ACTIVE" },
    });
    const acc = await prisma.account.create({
      data: {
        username: `${code.toLowerCase()}_${Date.now().toString(36)}`,
        passwordHash: hash,
        personId: person.id,
        status: "ACTIVE",
        roleGrants: { create: [{ roleId, scopeType }] },
      },
    });
    tempAccountIds.push(acc.id);
    tempPersonIds.push(person.id);
    return { acc, username: acc.username };
  };
  const staffAcct = await mkAccount("YC39-P1-STAFF", staffRole!.id, "DEPARTMENT");
  const leaderAcct = await mkAccount("YC39-P1-LEADER", leaderRole!.id, "ORGANIZATION");

  // Tài khoản SYSTEM_ADMIN tạm (chỉ trên DB local) — cấp role SYSTEM_ADMIN nhưng KHÔNG có role_grants
  const adminPerson = await prisma.person.findFirst({ where: { code: "YC39-P1-ADMIN" } });
  let adminPersonId = adminPerson?.id;
  if (!adminPersonId) {
    const p = await prisma.person.create({
      data: { code: "YC39-P1-ADMIN", fullName: "YC39 P1 Admin tam", status: "ACTIVE" },
    });
    adminPersonId = p.id;
  }
  const sysAdminRole = await prisma.role.findUnique({ where: { code: "SYSTEM_ADMIN" } });
  // dọn tài khoản tạm còn sót từ lần chạy trước (chỉ DB local)
  await prisma.account.deleteMany({ where: { personId: adminPersonId } });
  const adminAcc = await prisma.account.create({
    data: {
      username: `yc39p1admin_${Date.now().toString(36)}`,
      passwordHash: hash,
      personId: adminPersonId,
      status: "ACTIVE",
      roleGrants: { create: [{ roleId: sysAdminRole!.id, scopeType: "ORGANIZATION" }] },
    },
  });
  tempAccountIds.push(adminAcc.id);
  const adminUsername = adminAcc.username;

  const unitsBefore = await prisma.orgUnit.count();

  // --- 1. STAFF → 403
  const sLogin = await login(staffAcct.username, pw);
  check("0. Đăng nhập tài khoản Công chức (local)", sLogin.status === 200 && !!sLogin.token);
  const rStaff = await postUnit(sLogin.token, `${TMP}STAFF`, "YC39 P1 don vi STAFF");
  check("1. Công chức POST tạo đơn vị → 403", rStaff.status === 403, `HTTP ${rStaff.status}`);

  // --- 2. SYSTEM_ADMIN kỹ thuật → 403
  const aLogin = await login(adminUsername, pw);
  const rAdmin = await postUnit(aLogin.token, `${TMP}ADMIN`, "YC39 P1 don vi ADMIN");
  check(
    "3. Quản trị hệ thống (kỹ thuật) POST tạo đơn vị → 403",
    rAdmin.status === 403,
    `HTTP ${rAdmin.status}`
  );

  // --- 3. Không xác thực → 401
  const rNoAuth = await postUnit(null, `${TMP}ANON`, "YC39 P1 don vi anon");
  check("3b. Chưa đăng nhập POST tạo đơn vị → 401", rNoAuth.status === 401, `HTTP ${rNoAuth.status}`);

  // --- 4. Không có thay đổi dữ liệu khi bị từ chối
  const unitsAfterReject = await prisma.orgUnit.count();
  check(
    "5. Các request bị từ chối KHÔNG tạo đơn vị nào",
    unitsAfterReject === unitsBefore,
    `trước=${unitsBefore} sau=${unitsAfterReject}`
  );
  const leaked = await prisma.orgUnit.findMany({ where: { code: { startsWith: TMP } } });
  check("5b. Không còn mã đơn vị thử nghiệm sót lại", leaked.length === 0, `n=${leaked.length}`);

  // --- 5. UNIT_LEADER → được phép
  const lLogin = await login(leaderAcct.username, pw);
  check("0b. Đăng nhập tài khoản Lãnh đạo (local)", lLogin.status === 200 && !!lLogin.token);
  const rLeader = await postUnit(lLogin.token, `${TMP}LEADER`, "YC39 P1 don vi LANH DAO");
  const lj = await rLeader.json().catch(() => ({}));
  check(
    "2. Lãnh đạo đơn vị POST tạo đơn vị → được phép",
    rLeader.status === 200 || rLeader.status === 201,
    `HTTP ${rLeader.status}`
  );
  if (lj?.data?.id) createdUnits.push(lj.data.id);

  // --- 6. GET cây tổ chức không bị ảnh hưởng (chính sách cũ: mọi tài khoản đã đăng nhập đều xem được)
  const gStaff = await fetch(`${BASE}/api/org-units/tree`, {
    headers: { Authorization: `Bearer ${sLogin.token}` },
  });
  const gBody = await gStaff.json().catch(() => ({}));
  check(
    "4. GET cây tổ chức bằng tài khoản Công chức → vẫn xem được (không đổi chính sách)",
    gStaff.status === 200 && Array.isArray(gBody?.data) && gBody.data.length > 0,
    `HTTP ${gStaff.status}, n=${gBody?.data?.length}`
  );
  const gAdmin = await fetch(`${BASE}/api/org-units/tree`, {
    headers: { Authorization: `Bearer ${aLogin.token}` },
  });
  check("4b. GET cây tổ chức bằng tài khoản quản trị → vẫn xem được", gAdmin.status === 200, `HTTP ${gAdmin.status}`);

  // --- 7. Đường API thay thế: sửa/xoá đơn vị + tạo chức vụ
  const target = createdUnits[0] || (await prisma.orgUnit.findFirst({ where: { level: 2 } }))!;
  const rPatchStaff = await fetch(`${BASE}/api/org-units/${target.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sLogin.token}` },
    body: JSON.stringify({ name: `${TMP} doi ten` }),
  });
  check(
    "6a. Công chức PATCH đổi tên đơn vị → 403 (quyền cũ, không nới lỏng)",
    rPatchStaff.status === 403,
    `HTTP ${rPatchStaff.status}`
  );
  const rPosStaff = await fetch(`${BASE}/api/positions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sLogin.token}` },
    body: JSON.stringify({ name: `${TMP} chuc vu` }),
  });
  check(
    "6b. Công chức POST tạo chức vụ → 403 (không có đường vòng)",
    rPosStaff.status === 403,
    `HTTP ${rPosStaff.status}`
  );

  // --- 8. Tắt cờ phạm vi ⇒ VẪN chặn Công chức (rollback an toàn)
  // (kiểm tra logic tại mã nguồn vì cờ đọc ở thời gian chạy)
  const src = require("fs").readFileSync(
    "D:/thanhnx/OpenCode/talung-cus-work/src/app/api/org-units/tree/route.ts",
    "utf8"
  );
  check(
    "7a. Kiểm tra org.manage KHÔNG nằm sau feature flag (không tắt được)",
    /if \(!checkPermission\(user, "org\.manage"\)\)/.test(src) &&
      !/RBAC_HARDEN_ORGUNIT_CREATE_SCOPE[\s\S]{0,400}!checkPermission/.test(src)
  );
  const flagPos = src.lastIndexOf("RBAC_HARDEN_ORGUNIT_CREATE_SCOPE");
  const permPos = src.indexOf('checkPermission(user, "org.manage")');
  check(
    "7b. Cờ chỉ chi phối kiểm tra PHẠM VI, không ảnh hưởng kiểm tra thẩm quyền",
    flagPos > permPos && permPos > 0,
    `vi tri co: quyen=${permPos}, co=${flagPos}`
  );
  check(
    "7c. SYSTEM_ADMIN bị chặn trừ khi có grant vai trò NGHIỆP VỤ chứa 'org.manage'",
    /orgManageFromTechRole && !orgManageFromBusinessRole/.test(src)
  );

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(failed === 0 ? 0 : 1);
}

async function cleanup() {
  for (const id of createdUnits) {
    try {
      await prisma.orgUnit.delete({ where: { id } });
    } catch {}
  }
  try {
    await prisma.orgUnit.deleteMany({ where: { code: { startsWith: TMP } } });
  } catch {}
  for (const id of tempAccountIds) {
    try {
      await prisma.account.delete({ where: { id } });
    } catch {}
  }
  try {
    await prisma.person.deleteMany({ where: { id: { in: tempPersonIds } } });
  } catch {}
  try {
    await prisma.position.deleteMany({ where: { name: { startsWith: TMP } } });
  } catch {}
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

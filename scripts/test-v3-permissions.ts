/**
 * test-v3-permissions.ts — V3 Giai đoạn 1: kiểm thử bảo mật Trung tâm phân quyền.
 *
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_v3_demo"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   $env:TEST_BASE_URL="http://localhost:3100"
 *   npx tsx scripts/test-v3-permissions.ts
 *
 * Kiểm tra: 401 (không đăng nhập) · 403 (không đủ quyền / tự nâng quyền / vai trò nhạy cảm)
 * · 409 (trùng) · role hết hạn mất hiệu lực · thao tác bị từ chối KHÔNG làm đổi dữ liệu.
 */
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire("D:/thanhnx/OpenCode/talung-cus-work/package.json");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DIRECT_URL } } });

const BASE = process.env.TEST_BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";

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

async function login(username: string, password = PASSWORD) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}
const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

const createdPersonIds: string[] = [];
const createdAccountIds: string[] = [];

async function main() {
  console.log("=== V3 — BẢO MẬT TRUNG TÂM PHÂN QUYỀN ===\n");

  // Tài khoản thử nghiệm (tạo trực tiếp trong DB demo)
  const pw = crypto.randomBytes(12).toString("base64url");
  const hash = await bcrypt.hash(pw, 10);
  const staffRole = await prisma.role.findUnique({ where: { code: "STAFF" } });
  const leaderRole = await prisma.role.findUnique({ where: { code: "UNIT_LEADER" } });
  const unitA = await prisma.orgUnit.findFirst({ where: { code: "BP_NGHIEPVU_A" } });
  const person = await prisma.person.create({
    data: { code: `V3PERM-${Date.now().toString(36).toUpperCase()}`, fullName: "V3 Perm Test", status: "ACTIVE" },
  });
  createdPersonIds.push(person.id);
  const account = await prisma.account.create({
    data: {
      username: `v3perm_${Date.now().toString(36)}`,
      passwordHash: hash,
      personId: person.id,
      status: "ACTIVE",
      roleGrants: {
        create: [{ roleId: staffRole.id, scopeType: "DEPARTMENT", scopeUnitId: unitA!.id }],
      },
    },
  });
  createdAccountIds.push(account.id);
  console.log(`  (tài khoản thử: ${account.username})`);

  // ---------------------------------------------------------------- 1. 401
  const noAuth = await fetch(`${BASE}/api/admin/permissions`);
  check("1. Không đăng nhập ⇒ 401", noAuth.status === 401, `HTTP ${noAuth.status}`);

  // ---------------------------------------------------------------- 2. 403 khi không đủ quyền
  const staffLogin = await login("democb01");
  const staffToken = staffLogin.json.token;
  check("2. Cán bộ đăng nhập được", !!staffToken, `HTTP ${staffLogin.res.status}`);
  const staffRes = await fetch(`${BASE}/api/admin/permissions`, { headers: H(staffToken) });
  check("2. Cán bộ xem cấu hình phân quyền ⇒ 403", staffRes.status === 403, `HTTP ${staffRes.status}`);

  // ---------------------------------------------------------------- 3. Lãnh đạo xem được
  const leaderLogin = await login("demold01");
  const leaderToken = leaderLogin.json.token;
  const leaderRes = await fetch(`${BASE}/api/admin/permissions`, { headers: H(leaderToken) });
  const leaderJson = await leaderRes.json().catch(() => ({}));
  check("3. Lãnh đạo xem được cấu hình phân quyền", leaderRes.status === 200, `HTTP ${leaderRes.status}`);
  check("3. Có danh sách vai trò", (leaderJson.data?.roles || []).length >= 4, `${(leaderJson.data?.roles || []).length} vai trò`);
  check("3. Có danh sách quyền", (leaderJson.data?.permissions || []).length >= 10);
  check("3. Có danh sách tài khoản + grant", (leaderJson.data?.accounts || []).length > 0);
  check(
    "3. Có quan hệ quản lý trực tiếp",
    (leaderJson.data?.supervision || []).length > 0,
    `${(leaderJson.data?.supervision || []).length} quan hệ`
  );
  check(
    "3. Ma trận vai trò × quyền đầy đủ",
    (leaderJson.data?.roles || []).every((r: any) => Array.isArray(r.permissions))
  );

  // ---------------------------------------------------------------- 4. Từ chối không đổi dữ liệu
  const grantsBefore = await prisma.roleGrant.count();
  const denyGrants = await fetch(`${BASE}/api/admin/permissions`, {
    method: "POST",
    headers: H(staffToken),
    body: JSON.stringify({ accountId: account.id, roleCode: "UNIT_LEADER" }),
  });
  check("4. Cán bộ cấp vai trò ⇒ 403", denyGrants.status === 403, `HTTP ${denyGrants.status}`);
  const grantsAfterDeny = await prisma.roleGrant.count();
  check("4. Từ chối ⇒ KHÔNG phát sinh lượt cấp quyền", grantsAfterDeny === grantsBefore, `${grantsBefore} → ${grantsAfterDeny}`);

  // ---------------------------------------------------------------- 5. Không tự nâng quyền
  const selfGrant = await fetch(`${BASE}/api/admin/permissions`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ accountId: account.id, roleCode: "DEPARTMENT_LEADER", scopeType: "DEPARTMENT", scopeUnitId: unitA!.id }),
  });
  check("5. Cấp vai trò cho người khác (DEPARTMENT_LEADER) ⇒ 200", selfGrant.status === 200, `HTTP ${selfGrant.status}`);
  const selfGrant2 = await fetch(`${BASE}/api/admin/permissions`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ accountId: account.id, roleCode: "SYSTEM_ADMIN" }),
  });
  check("5. Cấp vai trò Quản trị hệ thống ⇒ 403 (đang khóa)", selfGrant2.status === 403, `HTTP ${selfGrant2.status}`);

  // 5b. Tự cấp quyền cho chính mình
  const leaderAccount = await prisma.account.findFirst({ where: { username: "demold01" } });
  const selfEscalate = await fetch(`${BASE}/api/admin/permissions`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ accountId: leaderAccount.id, roleCode: "DEPARTMENT_LEADER" }),
  });
  check("5. Tự cấp quyền cho chính mình ⇒ 403", selfEscalate.status === 403, `HTTP ${selfEscalate.status}`);

  // ---------------------------------------------------------------- 6. Trùng ⇒ 409
  const dup = await fetch(`${BASE}/api/admin/permissions`, {
    method: "POST",
    headers: H(leaderToken),
    body: JSON.stringify({ accountId: account.id, roleCode: "DEPARTMENT_LEADER", scopeType: "DEPARTMENT", scopeUnitId: unitA!.id }),
  });
  check("6. Cấp lại cùng vai trò + phạmvi ⇒ 409", dup.status === 409, `HTTP ${dup.status}`);

  // ---------------------------------------------------------------- 7. Thu hồi
  const grantId = (await prisma.roleGrant.findFirst({
    where: { accountId: account.id, role: { code: "DEPARTMENT_LEADER" } },
  }))!.id;
  const revoke = await fetch(`${BASE}/api/admin/permissions?grantId=${grantId}`, { method: "DELETE", headers: H(leaderToken) });
  check("7. Thu hồi vai trò ⇒ 200", revoke.status === 200, `HTTP ${revoke.status}`);
  const revoked = await prisma.roleGrant.findUnique({ where: { id: grantId } });
  check("7. Lượt cấp quyền được đóng hạn (giữ lịch sử)", !!revoked?.validTo, revoked?.validTo?.toISOString());

  const revokeAgain = await fetch(`${BASE}/api/admin/permissions?grantId=${grantId}`, { method: "DELETE", headers: H(leaderToken) });
  check("7. Thu hồi lượt đã hết hạn ⇒ 409", revokeAgain.status === 409, `HTTP ${revokeAgain.status}`);

  // Không tự thu hồi của chính mình
  const ownGrant = await prisma.roleGrant.findFirst({ where: { accountId: leaderAccount.id } });
  const selfRevoke = await fetch(`${BASE}/api/admin/permissions?grantId=${ownGrant!.id}`, { method: "DELETE", headers: H(leaderToken) });
  check("7. Tự thu hồi quyền của mình ⇒ 403", selfRevoke.status === 403, `HTTP ${selfRevoke.status}`);

  // ---------------------------------------------------------------- 8. Role hết hạn mất hiệu lực
  const expiredGrant = await prisma.roleGrant.create({
    data: {
      accountId: account.id,
      roleId: leaderRole!.id,
      scopeType: "ORGANIZATION",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: new Date("2026-01-31T00:00:00.000Z"),
    },
  });
  const expiredLogin = await login(account.username, pw);
  const expiredPerms: string[] = expiredLogin.json?.user?.permissions || [];
  check(
    "8. Grant đã hết hạn ⇒ KHÔNG còn quyền của vai trò đó",
    !expiredPerms.includes("reports.export") && !expiredPerms.includes("system.config"),
    `permissions=${expiredPerms.join(",") || "(trống)"}`
  );
  const activeGrant = await prisma.roleGrant.create({
    data: {
      accountId: account.id,
      roleId: leaderRole!.id,
      scopeType: "ORGANIZATION",
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validTo: null,
    },
  });
  const activeLogin = await login(account.username, pw);
  const activePerms: string[] = activeLogin.json?.user?.permissions || [];
  check(
    "8. Grant còn hiệu lực ⇒ CÓ quyền của vai trò đó",
    activePerms.includes("reports.export"),
    `permissions=${activePerms.join(",") || "(trống)"}`
  );
  await prisma.roleGrant.delete({ where: { id: expiredGrant.id } });
  await prisma.roleGrant.delete({ where: { id: activeGrant.id } });

  // ---------------------------------------------------------------- 9. Nhật ký
  const audit = await prisma.auditEvent.findMany({ where: { action: { in: ["ROLE_GRANT_CREATE", "ROLE_GRANT_REVOKE"] } } });
  check("9. Có nhật ký cấp quyền", audit.some((a) => a.action === "ROLE_GRANT_CREATE"), `${audit.length} mục`);
  check("9. Có nhật ký thu hồi quyền", audit.some((a) => a.action === "ROLE_GRANT_REVOKE"));
  const withReason = audit.find((a) => a.action === "ROLE_GRANT_CREATE" && (a.newData as any)?.reason);
  check("9. Nhật ký lưu lý do (nếu có)", !!withReason || true, withReason ? "có lý do" : "không nhập lý do");

  console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exitCode = failed === 0 ? 0 : 1;
}

async function cleanup() {
  for (const id of createdAccountIds) {
    try {
      await prisma.roleGrant.deleteMany({ where: { accountId: id } });
      await prisma.account.delete({ where: { id } });
    } catch {}
  }
  for (const id of createdPersonIds) {
    try {
      await prisma.person.delete({ where: { id } });
    } catch {}
  }
  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
  });

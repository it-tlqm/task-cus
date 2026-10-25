import { assertLocalTestDatabase } from "./lib/test-db-safety";
import { createRequire } from "node:module";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-ux-phase3e-system-admin-api"
);
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const BASE = process.env.TEST_BASE_URL || "http://localhost:3113";
const PASSWORD = process.env.V3_DEMO_PASSWORD || "LocalTest@2026";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ""}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` - ${detail}` : ""}`); }
};

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`login ${username}: ${json.error || res.status}`);
  const cookies = res.headers.getSetCookie?.() || [];
  const token = cookies.find((c) => c.startsWith("token="))?.split(";")[0].slice(6);
  if (!token) throw new Error("no session cookie");
  return { token, body: json };
}

async function api(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: `token=${token}`, ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const admin = await prisma.account.findUnique({ where: { username: "demold01" } });
  const target = await prisma.account.findUnique({ where: { username: "democb01" } });
  const role = await prisma.role.findUnique({ where: { code: "SYSTEM_ADMIN" } });
  if (!admin || !target || !role) throw new Error("fixture accounts/role missing");

  const createdGrantIds: string[] = [];
  let adminGrantId: string | null = null;
  try {
    await prisma.roleGrant.deleteMany({
      where: { roleId: role.id, accountId: { in: [admin.id, target.id] } },
    });
    const adminGrant = await prisma.roleGrant.create({
      data: {
        accountId: admin.id,
        roleId: role.id,
        scopeType: "ORGANIZATION",
        validFrom: new Date(Date.now() - 60_000),
      },
    });
    adminGrantId = adminGrant.id;

    const session = await login("demold01");
    check("SYSTEM_ADMIN đăng nhập đúng vai trò", session.body.user?.role === "SYSTEM_ADMIN");

    const cfg = await api("/api/admin/permissions", session.token);
    check("Admin xem được cấu hình phân quyền", cfg.status === 200);
    check("Admin được phép cấp SYSTEM_ADMIN", cfg.json?.data?.canGrantSystemAdmin === true);
    check("SYSTEM_ADMIN không còn bị khóa", (cfg.json?.data?.sensitiveRolesLocked || []).length === 0);

    const created = await api("/api/admin/permissions", session.token, {
      method: "POST",
      body: JSON.stringify({
        accountId: target.id,
        roleCode: "SYSTEM_ADMIN",
        scopeType: "ORGANIZATION",
        scopeUnitId: null,
        reason: "Kiểm thử cấp quyền quản trị có kiểm soát",
      }),
    });
    check("Cấp SYSTEM_ADMIN cho người khác thành công", created.status === 200, `HTTP ${created.status}`);
    if (created.json?.data?.id) createdGrantIds.push(created.json.data.id);

    const self = await api("/api/admin/permissions", session.token, {
      method: "POST",
      body: JSON.stringify({
        accountId: admin.id,
        roleCode: "SYSTEM_ADMIN",
        scopeType: "ORGANIZATION",
        reason: "Tự cấp quyền quản trị phải bị chặn",
      }),
    });
    check("Chặn tự cấp SYSTEM_ADMIN", self.status === 403, `HTTP ${self.status}`);

    if (createdGrantIds[0]) {
      const noReason = await api(`/api/admin/permissions?grantId=${createdGrantIds[0]}`, session.token, {
        method: "DELETE",
      });
      check("Chặn thu hồi SYSTEM_ADMIN thiếu lý do", noReason.status === 400, `HTTP ${noReason.status}`);

      const revoked = await api(
        `/api/admin/permissions?grantId=${createdGrantIds[0]}&reason=${encodeURIComponent("Kiểm thử thu hồi có lý do")}`,
        session.token,
        { method: "DELETE" }
      );
      check("Thu hồi SYSTEM_ADMIN có lý do thành công", revoked.status === 200, `HTTP ${revoked.status}`);
    }
  } finally {
    if (createdGrantIds.length > 0) {
      await prisma.roleGrant.deleteMany({ where: { id: { in: createdGrantIds } } });
    }
    if (adminGrantId) {
      await prisma.roleGrant.deleteMany({ where: { id: adminGrantId } });
    }
    await prisma.$disconnect();
  }

  console.log(`\nKẾT QUẢ API: ${pass} pass / ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

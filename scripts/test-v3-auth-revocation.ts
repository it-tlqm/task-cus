/**
 * Task 2.2 — Thu hồi quyền có hiệu lực NGAY, không còn cache 60 giây
 * và không còn fallback quyền từ JWT khi grant cuối cùng bị thu hồi.
 *
 *   npx tsx scripts/test-v3-auth-revocation.ts                 # bắt buộc chạy fixture DB/API
 *   npx tsx scripts/test-v3-auth-revocation.ts --static-only   # chỉ kiểm tra tĩnh (opt-out rõ ràng)
 *
 * Chạy trên database kiểm thử cục bộ + server dev cục bộ:
 *   - TEST_BASE_URL mặc định http://127.0.0.1:3100
 *   - TEST_DATABASE_URL/DATABASE_URL phải trỏ ĐÚNG database mà server đang dùng
 *     (mặc định lấy từ .env.local); BẮT BUỘC là database test cục bộ
 *     (scripts/lib/test-db-safety.ts sẽ từ chối mọi URL khác).
 *   - Nếu server được khởi động với DATABASE_URL khác .env.local, truyền cùng URL:
 *       $env:DATABASE_URL="postgresql://.../talung_v3_fixture_integration"
 *       npx tsx scripts/test-v3-auth-revocation.ts
 *
 * Chế độ mặc định FAIL-CLOSED: nếu không kết nối được fixture DB/server thì thoát mã 2,
 * không bao giờ "xanh" khi chưa thực sự kiểm thử HTTP.
 *
 * Kịch bản (fixture tự tạo, tự dọn kể cả khi setup lỗi giữa chừng):
 *   1. Đăng nhập tài khoản fixture có DUY NHẤT một grant DEPARTMENT_LEADER.
 *   2. Mô phỏng đúng shape điều chuyển của /api/people/[id]/transfer: đóng phân công cũ
 *      (isPrimary:false, effectiveTo), tạo phân công chính mới, cập nhật scopeUnitId của grant.
 *      /api/auth/me phải trả unitId/unitName/positionTitle/scopeUnitId hiện hành NGAY.
 *   3. Thu hồi grant DUY NHẤT bằng đúng shape của /api/admin/permissions
 *      (validTo = new Date()): /api/auth/me mất vai trò/quyền cũ ngay, endpoint có guard
 *      (POST /api/plans) trả 403 ngay — không chờ 60 giây, không dùng claim JWT.
 *   4. Vô hiệu hóa tài khoản: /api/auth/me trả 401 ngay.
 *   5. finally: khôi phục + xoá fixture, xác minh đã xoá sạch; báo lỗi nếu còn sót.
 *
 * Không dùng thông tin đăng nhập Production, không ghi ra ngoài database fixture.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const ROOT = process.cwd();
const STATIC_ONLY = process.argv.slice(2).includes("--static-only");

// Nạp biến môi trường cục bộ nếu người chạy chưa export (không ghi đè biến đã có).
function loadLocalEnv() {
  for (const file of [".env.local", ".env"]) {
    if (process.env.DATABASE_URL && process.env.DIRECT_URL) return;
    const full = path.join(ROOT, file);
    if (!fs.existsSync(full)) continue;
    try {
      process.loadEnvFile(full);
    } catch {
      // Bỏ qua file .env hỏng — lỗi cấu hình sẽ được báo ở bước kiểm tra DB.
    }
  }
}

loadLocalEnv();

const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const FIXTURE_USERNAME = "task22_revocation_fixture";
const FIXTURE_PERSON_CODE = "TASK22-FIXTURE";
const FIXTURE_FULL_NAME = "Tài khoản kiểm thử Task 2.2 (thu hồi quyền)";
const LEADER_ONLY_PERMISSION = "plans.approve";
const GUARDED_PLAN_PERMISSION = "plans.create";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

const BASE_URL = (process.env.TEST_BASE_URL || "http://127.0.0.1:3100").replace(/\/+$/, "");

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.error(`[FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function skip(name: string, reason: string) {
  skipped++;
  console.warn(`[SKIP] ${name} — ${reason}`);
}

function errText(error: any): string {
  return String(error?.message || error).slice(0, 240);
}

// ---------------------------------------------------------------------------
// 1. Kiểm tra tĩnh: không cache, không fallback quyền từ JWT
// ---------------------------------------------------------------------------
function sourceLevelChecks() {
  console.log("\n== Static checks (src/server/auth.ts) ==");
  const source = fs.readFileSync(path.join(ROOT, "src/server/auth.ts"), "utf8");

  check("no authMemoryCache", !source.includes("authMemoryCache"));
  check("no CachedAuth interface", !source.includes("CachedAuth"));
  check("no AUTH_CACHE_MAX", !source.includes("AUTH_CACHE_MAX"));
  check("no pruneAuthCache", !source.includes("pruneAuthCache"));
  check("no 60_000 cache TTL", !source.includes("60_000") && !source.includes("60 * 1000"));
  check("no expiresAt cache field", !source.includes("expiresAt"));
  check("no in-memory Map cache keyed by token", !/new Map<[^>]*>\s*\(\s*\)/.test(source));

  const start = source.indexOf("export async function authenticateRequest");
  const end = source.indexOf("export async function getAccountWithPermissions");
  const fn = start >= 0 && end > start ? source.slice(start, end) : "";
  check("authenticateRequest exists", fn.length > 0);
  check("authenticateRequest reads account from DB every call", fn.includes("prisma.account.findUnique"));
  check("authenticateRequest rejects non-ACTIVE account", fn.includes('account.status !== "ACTIVE"') && fn.includes("return null"));
  check("authenticateRequest has no cache read/write", !/authMemoryCache|cached\.|expiresAt/.test(fn));

  // Không fallback BẤT KỲ trường phân quyền nào từ JWT (kể cả grant cuối cùng bị thu hồi).
  const forbiddenFallbacks = [
    "decoded.role",
    "decoded.permissions",
    "decoded.scopeType",
    "decoded.scopeUnitId",
    "decoded.unitId",
    "decoded.unitName",
    "decoded.positionTitle",
  ];
  for (const field of forbiddenFallbacks) {
    check(`authenticateRequest does not fall back to ${field}`, !fn.includes(field));
  }

  // Các trường phân quyền lấy từ DB, cùng default với getAccountWithPermissions.
  check("role comes from DB (default STAFF)", fn.includes('role: primaryGrant?.role.code || "STAFF"'));
  check(
    "scopeType comes from DB (default DEPARTMENT)",
    fn.includes('scopeType: (primaryGrant?.scopeType as SessionUser["scopeType"]) || "DEPARTMENT"')
  );
  check("scopeUnitId comes from DB grant", fn.includes("scopeUnitId: primaryGrant?.scopeUnitId"));
  check("unitId comes from DB assignment", fn.includes("unitId: primaryAssignment?.unitId"));
  check("unitName comes from DB assignment", fn.includes("unitName: primaryAssignment?.unit?.name"));
  check(
    "positionTitle comes from DB assignment (default Cán bộ công chức)",
    fn.includes('positionTitle: primaryAssignment?.position?.title || "Cán bộ công chức"')
  );
  check("permissions are always the DB set (even empty)", fn.includes("permissions: Array.from(permissions)"));

  // Chỉ giữ trường định danh bất biến từ token.
  for (const identity of ["id", "personId", "username", "fullName", "personCode", "mustChangePassword"]) {
    check(`identity field ${identity} is retained from session`, fn.includes(`${identity}: decoded.${identity}`));
  }
}

// ---------------------------------------------------------------------------
// 2. Kiểm thử fixture DB + API
// ---------------------------------------------------------------------------
const FIXTURE_PASSWORD = `${crypto.randomBytes(12).toString("base64url")}Aa1!`;

const DB_URL = (): string => process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || process.env.DIRECT_URL || "";

/** Dọn fixture theo username/person code — chạy được cả khi setup lỗi trước khi có object fixture. */
async function cleanupFixture(prisma: any): Promise<string[]> {
  const errors: string[] = [];
  const account = await prisma.account.findUnique({ where: { username: FIXTURE_USERNAME } }).catch((e: any) => {
    errors.push(`đọc fixture account: ${errText(e)}`);
    return null;
  });
  const person = await prisma.person.findUnique({ where: { code: FIXTURE_PERSON_CODE } }).catch((e: any) => {
    errors.push(`đọc fixture person: ${errText(e)}`);
    return null;
  });

  if (account) {
    // Khôi phục trạng thái an toàn trước khi xoá (nếu bước xoá thất bại).
    await prisma.account
      .update({ where: { id: account.id }, data: { status: "ACTIVE" } })
      .catch((e: any) => errors.push(`khôi phục account ACTIVE: ${errText(e)}`));
    await prisma.roleGrant
      .updateMany({ where: { accountId: account.id }, data: { validTo: null } })
      .catch((e: any) => errors.push(`khôi phục grant validTo=null: ${errText(e)}`));
    await prisma.auditEvent
      .deleteMany({ where: { actorId: account.id } })
      .catch((e: any) => errors.push(`xoá audit của fixture: ${errText(e)}`));
    await prisma.roleGrant
      .deleteMany({ where: { accountId: account.id } })
      .catch((e: any) => errors.push(`xoá role grants: ${errText(e)}`));
    await prisma.account
      .delete({ where: { id: account.id } })
      .catch((e: any) => errors.push(`xoá account: ${errText(e)}`));
  }

  if (person) {
    await prisma.personAssignment
      .deleteMany({ where: { personId: person.id } })
      .catch((e: any) => errors.push(`xoá assignments: ${errText(e)}`));
    await prisma.person
      .delete({ where: { id: person.id } })
      .catch((e: any) => errors.push(`xoá person: ${errText(e)}`));
  }

  const leftAccount = await prisma.account.findUnique({ where: { username: FIXTURE_USERNAME } }).catch(() => null);
  const leftPerson = await prisma.person.findUnique({ where: { code: FIXTURE_PERSON_CODE } }).catch(() => null);
  if (leftAccount) errors.push("account fixture vẫn còn sau khi dọn");
  if (leftPerson) errors.push("person fixture vẫn còn sau khi dọn");
  return errors;
}

async function runFixtureChecks(): Promise<"ok" | "unavailable"> {
  const rawDbUrl = DB_URL();
  if (!rawDbUrl) {
    skip("fixture DB/API checks", "no DATABASE_URL/TEST_DATABASE_URL configured");
    return "unavailable";
  }
  const dbUrl = assertLocalTestDatabase(rawDbUrl, "test-v3-auth-revocation");
  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  try {
    console.log("\n== Fixture DB/API checks ==");
    console.log(`[INFO] DB: ${new URL(dbUrl).hostname}/${new URL(dbUrl).pathname.replace(/^\//, "")}`);
    console.log(`[INFO] API: ${BASE_URL}`);

    // Xác nhận server cục bộ đang chạy trước khi ghi dữ liệu fixture.
    try {
      const probe = await fetch(`${BASE_URL}/login`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
      if (probe.status >= 500) throw new Error(`HTTP ${probe.status}`);
    } catch (error: any) {
      skip("fixture DB/API checks", `server ${BASE_URL} unreachable: ${errText(error)}`);
      return "unavailable";
    }

    const [staffRole, leaderRole] = await Promise.all([
      prisma.role.findUnique({ where: { code: "STAFF" }, select: { id: true } }),
      prisma.role.findUnique({ where: { code: "DEPARTMENT_LEADER" }, select: { id: true } }),
    ]);
    if (!leaderRole) {
      skip("fixture DB/API checks", "missing DEPARTMENT_LEADER role in fixture DB");
      return "unavailable";
    }
    if (!staffRole) {
      skip("fixture DB/API checks", "missing STAFF role in fixture DB");
      return "unavailable";
    }

    const units = await prisma.orgUnit.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { code: "asc" },
      take: 2,
    });
    if (units.length < 2) {
      skip("fixture DB/API checks", "need 2 ACTIVE org units for transfer test");
      return "unavailable";
    }
    const [unitA, unitB] = units;

    const positions = await prisma.position.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, title: true },
      orderBy: { code: "asc" },
      take: 2,
    });
    if (positions.length < 2) {
      skip("fixture DB/API checks", "need 2 ACTIVE positions for transfer test");
      return "unavailable";
    }
    const [positionA, positionB] = positions;

    // --- Tạo/khôi phục fixture -------------------------------------------
    const person = await prisma.person.upsert({
      where: { code: FIXTURE_PERSON_CODE },
      update: { status: "ACTIVE", fullName: FIXTURE_FULL_NAME },
      create: { code: FIXTURE_PERSON_CODE, fullName: FIXTURE_FULL_NAME, status: "ACTIVE" },
    });

    let account = await prisma.account.findUnique({ where: { username: FIXTURE_USERNAME } });
    if (!account) {
      account = await prisma.account.create({
        data: { username: FIXTURE_USERNAME, passwordHash: "", personId: person.id, status: "ACTIVE" },
      });
    }

    const passwordHash = await bcrypt.hash(FIXTURE_PASSWORD, 10);
    await prisma.$transaction([
      prisma.roleGrant.deleteMany({ where: { accountId: account.id } }),
      prisma.personAssignment.deleteMany({ where: { personId: person.id } }),
      prisma.account.update({
        where: { id: account.id },
        data: { status: "ACTIVE", passwordHash, mustChangePassword: false },
      }),
      prisma.person.update({ where: { id: person.id }, data: { status: "ACTIVE" } }),
    ]);

    const assignment = await prisma.personAssignment.create({
      data: {
        personId: person.id,
        unitId: unitA.id,
        positionId: positionA.id,
        isPrimary: true,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    // Grant DUY NHẤT — đúng kịch bản lỗ hổng: thu hồi grant cuối cùng.
    const grant = await prisma.roleGrant.create({
      data: {
        accountId: account.id,
        roleId: leaderRole.id,
        scopeType: "DEPARTMENT",
        scopeUnitId: unitA.id,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    const grantCount = await prisma.roleGrant.count({ where: { accountId: account.id } });
    check("fixture account has exactly one role grant", grantCount === 1, `${grantCount} grant`);
    check(
      "fixture grant initially active with scope unit A",
      grant.scopeUnitId === unitA.id && grant.validTo === null,
      `scopeUnitId=${grant.scopeUnitId}`
    );

    // --- 1. Đăng nhập ------------------------------------------------------
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: FIXTURE_USERNAME, password: FIXTURE_PASSWORD, remember: false }),
      signal: AbortSignal.timeout(30_000),
    });
    const loginJson: any = await loginRes.json().catch(() => ({}));
    check("fixture login returns 200", loginRes.status === 200, `HTTP ${loginRes.status}`);
    if (loginRes.status !== 200) {
      console.error(
        `[INFO] Fixture account vừa tạo trong DB nhưng server ${BASE_URL} từ chối đăng nhập — ` +
          "server có thể đang dùng DATABASE_URL khác. Truyền DATABASE_URL trùng với server khi chạy test."
      );
      return "ok";
    }
    const token: string = loginJson?.token || "";
    check("fixture login returns a token", token.length > 0);
    if (!token) return "ok";

    const me = async () => {
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const body: any = await res.json().catch(() => null);
      return { status: res.status, body };
    };
    const guardedPlanStatus = async () => {
      const res = await fetch(`${BASE_URL}/api/plans`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(30_000),
      });
      await res.body?.cancel().catch(() => {});
      return res.status;
    };

    // Làm "nóng" cache 60 giây (nếu còn) trước mọi thay đổi quyền.
    const warm1 = await me();
    const warm2 = await me();
    check("warm-up /api/auth/me 1 returns 200", warm1.status === 200, `HTTP ${warm1.status}`);
    check("warm-up /api/auth/me 2 returns 200", warm2.status === 200, `HTTP ${warm2.status}`);
    check("session shows sole-grant leader role", warm2.body?.user?.role === "DEPARTMENT_LEADER", String(warm2.body?.user?.role));
    check("session shows primary unit A", warm2.body?.user?.unitId === unitA.id, String(warm2.body?.user?.unitId));
    check("session shows position A", warm2.body?.user?.positionTitle === positionA.title, String(warm2.body?.user?.positionTitle));
    check("session shows scope unit A", warm2.body?.user?.scopeUnitId === unitA.id, String(warm2.body?.user?.scopeUnitId));
    check(
      `session has ${LEADER_ONLY_PERMISSION}`,
      Array.isArray(warm2.body?.user?.permissions) && warm2.body.user.permissions.includes(LEADER_ONLY_PERMISSION)
    );
    const guardBefore = await guardedPlanStatus();
    check(
      "guarded POST /api/plans passes permission check before revocation (400 validation)",
      guardBefore === 400,
      `HTTP ${guardBefore}`
    );

    // --- 2. Điều chuyển đúng shape /api/people/[id]/transfer --------------
    // Ngày hiệu lực lùi 1 giây để phân công cũ chắc chắn đã đóng tại thời điểm gọi /me.
    const effDate = new Date(Date.now() - 1000);
    const transferAssignment = await prisma.$transaction(async (tx: any) => {
      // a. Đóng phân công cũ (giữ lịch sử)
      await tx.personAssignment.update({
        where: { id: assignment.id },
        data: { isPrimary: false, effectiveTo: effDate },
      });
      // b. Tạo phân công chính mới
      const created = await tx.personAssignment.create({
        data: {
          personId: person.id,
          unitId: unitB.id,
          positionId: positionB.id,
          isPrimary: true,
          effectiveFrom: effDate,
          effectiveTo: null,
        },
      });
      // c. Cập nhật scopeUnit của grant DEPARTMENT
      await tx.roleGrant.update({ where: { id: grant.id }, data: { scopeUnitId: unitB.id } });
      return created;
    });

    const afterTransfer = await me();
    check(
      "transfer: unitId is the new unit immediately",
      afterTransfer.status === 200 && afterTransfer.body?.user?.unitId === unitB.id,
      `HTTP ${afterTransfer.status}, unitId=${afterTransfer.body?.user?.unitId}`
    );
    check(
      "transfer: unitName is the new unit immediately",
      afterTransfer.body?.user?.unitName === unitB.name,
      String(afterTransfer.body?.user?.unitName)
    );
    check(
      "transfer: positionTitle is the new position immediately",
      afterTransfer.body?.user?.positionTitle === positionB.title,
      String(afterTransfer.body?.user?.positionTitle)
    );
    check(
      "transfer: scopeUnitId is the new unit immediately",
      afterTransfer.body?.user?.scopeUnitId === unitB.id,
      String(afterTransfer.body?.user?.scopeUnitId)
    );
    check(
      "transfer: role remains active leader",
      afterTransfer.body?.user?.role === "DEPARTMENT_LEADER",
      String(afterTransfer.body?.user?.role)
    );

    // Khôi phục phân công ban đầu (để các bước sau kiểm tra trên trạng thái tất định).
    await prisma.$transaction([
      prisma.personAssignment.delete({ where: { id: transferAssignment.id } }),
      prisma.personAssignment.update({
        where: { id: assignment.id },
        data: { isPrimary: true, effectiveTo: null },
      }),
      prisma.roleGrant.update({ where: { id: grant.id }, data: { scopeUnitId: unitA.id } }),
    ]);
    const afterTransferRestore = await me();
    check(
      "transfer restore is immediate",
      afterTransferRestore.body?.user?.unitId === unitA.id &&
        afterTransferRestore.body?.user?.positionTitle === positionA.title &&
        afterTransferRestore.body?.user?.scopeUnitId === unitA.id,
      `unitId=${afterTransferRestore.body?.user?.unitId}, scopeUnitId=${afterTransferRestore.body?.user?.scopeUnitId}`
    );

    // --- 3. Thu hồi grant DUY NHẤT bằng đúng shape admin route -------------
    const revokedAt = new Date(); // /api/admin/permissions: data: { validTo: now }
    await prisma.roleGrant.update({ where: { id: grant.id }, data: { validTo: revokedAt } });
    const revokedRow = await prisma.roleGrant.findUnique({ where: { id: grant.id }, select: { validTo: true } });
    check("sole grant write uses admin revoke shape (validTo = now)", !!revokedRow?.validTo, String(revokedRow?.validTo));

    const t0 = Date.now();
    const afterRevoke = await me();
    const revokeLatency = Date.now() - t0;
    const revokedPermissions: string[] = afterRevoke.body?.user?.permissions || [];
    check(
      "last-grant revocation: /api/auth/me returns 200 with DB-derived session",
      afterRevoke.status === 200,
      `HTTP ${afterRevoke.status}, ${revokeLatency}ms after DB write`
    );
    check(
      "last-grant revocation: old leader role is gone immediately (STAFF default)",
      afterRevoke.body?.user?.role === "STAFF",
      `role=${afterRevoke.body?.user?.role}`
    );
    check(
      "last-grant revocation: old permissions are gone immediately (empty DB set)",
      Array.isArray(revokedPermissions) && revokedPermissions.length === 0,
      `permissions=${JSON.stringify(revokedPermissions)}`
    );
    check(
      `last-grant revocation: ${GUARDED_PLAN_PERMISSION} is no longer effective`,
      !revokedPermissions.includes(GUARDED_PLAN_PERMISSION)
    );
    check(
      "last-grant revocation: scope falls back to DB defaults",
      afterRevoke.body?.user?.scopeType === "DEPARTMENT" && (afterRevoke.body?.user?.scopeUnitId ?? null) === null,
      `scopeType=${afterRevoke.body?.user?.scopeType}, scopeUnitId=${afterRevoke.body?.user?.scopeUnitId}`
    );
    check(
      "last-grant revocation: identity fields stay intact",
      afterRevoke.body?.user?.username === FIXTURE_USERNAME &&
        afterRevoke.body?.user?.fullName === FIXTURE_FULL_NAME,
      String(afterRevoke.body?.user?.username)
    );
    check(
      "last-grant revocation: unit still comes from current DB assignment",
      afterRevoke.body?.user?.unitId === unitA.id,
      String(afterRevoke.body?.user?.unitId)
    );

    const guardAfter = await guardedPlanStatus();
    check("last-grant revocation: guarded POST /api/plans returns 403 immediately", guardAfter === 403, `HTTP ${guardAfter}`);

    // Khôi phục grant (validTo = null) — quyền phải trở lại ngay.
    await prisma.roleGrant.update({ where: { id: grant.id }, data: { validTo: null } });
    const afterGrantRestore = await me();
    check(
      "grant restore is immediate (leader role + permission back)",
      afterGrantRestore.body?.user?.role === "DEPARTMENT_LEADER" &&
        (afterGrantRestore.body?.user?.permissions || []).includes(GUARDED_PLAN_PERMISSION),
      `role=${afterGrantRestore.body?.user?.role}`
    );
    const guardRestored = await guardedPlanStatus();
    check("guarded endpoint allows permission check after restore (400 validation)", guardRestored === 400, `HTTP ${guardRestored}`);

    // --- 4. Vô hiệu hóa tài khoản: 401 ngay ------------------------------
    await prisma.account.update({ where: { id: account.id }, data: { status: "INACTIVE" } });
    const t1 = Date.now();
    const afterDeactivate = await me();
    const deactivateLatency = Date.now() - t1;
    check(
      "account deactivation revokes access immediately (401, no 60s cache)",
      afterDeactivate.status === 401,
      `HTTP ${afterDeactivate.status}, ${deactivateLatency}ms after DB write`
    );
    await prisma.account.update({ where: { id: account.id }, data: { status: "ACTIVE" } });
    const afterReactivate = await me();
    check("account reactivation is immediate (200)", afterReactivate.status === 200, `HTTP ${afterReactivate.status}`);

    return "ok";
  } finally {
    // Dọn theo username/person code — chạy được cả khi setup ném lỗi trước khi có biến fixture.
    const cleanupErrors = await cleanupFixture(prisma).catch((e: any) => [`cleanup ngoại lệ: ${errText(e)}`]);
    await prisma.$disconnect().catch(() => {});
    if (cleanupErrors.length > 0) {
      failed++;
      failures.push(`fixture cleanup: ${cleanupErrors.join("; ")}`);
      console.error(`[FAIL] fixture cleanup incomplete — ${cleanupErrors.join("; ")}`);
    } else {
      console.log("[INFO] fixture cleanup complete (đã xác minh không còn bản ghi fixture)");
    }
  }
}

async function main() {
  console.log("================================================================================");
  console.log("Task 2.2 — thu hồi quyền ngay, bỏ cache 60s, bỏ fallback quyền từ JWT");
  console.log("================================================================================");

  const baseHost = (() => {
    try {
      return new URL(BASE_URL).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!LOCAL_HOSTS.has(baseHost)) {
    throw new Error(`TỪ CHỐI CHẠY: TEST_BASE_URL phải là server cục bộ, nhận "${BASE_URL}"`);
  }

  sourceLevelChecks();

  let runtimeUnavailable = false;
  if (STATIC_ONLY) {
    console.log("\n[INFO] --static-only: bỏ qua kiểm thử fixture/API theo yêu cầu rõ ràng.");
  } else {
    runtimeUnavailable = (await runFixtureChecks()) === "unavailable";
  }

  console.log("\n================================================================================");
  console.log(`RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (runtimeUnavailable) {
    console.error("[FAIL-CLOSED] Fixture/API chưa được kiểm thử — thoát mã 2 (dùng --static-only để chủ động bỏ qua).");
  } else if (STATIC_ONLY) {
    console.log("[INFO] Chỉ kiểm tra tĩnh — KHÔNG tuyên bố đạt kiểm thử HTTP.");
  }
  if (failed === 0 && failures.length === 0) console.log("Không có lỗi.");
  console.log("================================================================================");
  process.exitCode = failed > 0 ? 1 : runtimeUnavailable ? 2 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

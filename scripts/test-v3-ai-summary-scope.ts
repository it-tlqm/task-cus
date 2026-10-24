/**
 * Task 2.3 — Số nghỉ phép trong AI summary phải cùng phạm vi đơn vị với số nhiệm vụ.
 *
 *   npx tsx scripts/test-v3-ai-summary-scope.ts                 # bắt buộc chạy fixture DB
 *   npx tsx scripts/test-v3-ai-summary-scope.ts --static-only   # chỉ kiểm tra tĩnh (opt-out rõ ràng)
 *
 * Chạy trên database kiểm thử cục bộ (không cần server, không gọi AI thật):
 *   - TEST_DATABASE_URL/DATABASE_URL/DIRECT_URL lấy từ .env.local/.env nếu chưa export.
 *   - BẮT BUỘC là database test cục bộ (scripts/lib/test-db-safety.ts từ chối mọi URL khác).
 *   - Nếu fixture DB không truy cập được: thoát mã 2 (fail-closed) trừ khi truyền --static-only.
 *
 * Kịch bản fixture (tự tạo, tự dọn trong finally):
 *   1. Tạo 2 đơn vị fixture A/B, 2 người có phân công CHÍNH tại A/B.
 *      Người B còn có thêm phân công KHÔNG chính tại A (không được tính vào phạm vi A).
 *   2. Tạo leave APPROVED cho A và B, thêm 1 leave PENDING cho A (không được đếm).
 *   3. Tạo task IN_PROGRESS tại A/B + 1 task CANCELED tại A (không được đếm vào tổng).
 *   4. getAuthorizedUnitIds(DEPARTMENT_LEADER scope A) -> [A]; helper chỉ đếm leave/task của A.
 *   5. getAuthorizedUnitIds(UNIT_LEADER) -> "ALL"; helper đếm cả A và B.
 *   6. Kiểm tra leave/task dùng CÙNG một phạm vi; không gọi summarizePeriod/AI.
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

const RUN_ID = crypto.randomBytes(4).toString("hex");
const CODE_PREFIX = `TASK23_${RUN_ID}`;
const REASON_MARKER = `Fixture Task 2.3 ${RUN_ID}`;

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

function readSource(relativePath: string): string {
  const full = path.join(ROOT, relativePath);
  return fs.existsSync(full) ? fs.readFileSync(full, "utf8") : "";
}

/** Bỏ chú thích để kiểm tra tĩnh không bắt nhầm tên hàm được nhắc trong tài liệu. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// 1. Kiểm tra tĩnh: route mỏng + helper dùng đúng phạm vi cho cả task và leave
// ---------------------------------------------------------------------------
function sourceLevelChecks() {
  console.log("\n== Static checks ==");
  const route = stripComments(readSource("src/app/api/ai/route.ts"));
  const helper = stripComments(readSource("src/server/ai-summary.ts"));

  check("src/server/ai-summary.ts exists", helper.length > 0);
  check(
    "route imports getAiSummaryStats from @/server/ai-summary",
    /import\s*\{[^}]*getAiSummaryStats[^}]*\}\s*from\s*"@\/server\/ai-summary"/.test(route)
  );

  const resolvedScopeCalls = (route.match(/getAuthorizedUnitIds\s*\(/g) || []).length;
  check("route resolves scope exactly once via getAuthorizedUnitIds", resolvedScopeCalls === 1, `${resolvedScopeCalls} call(s)`);

  const helperCalls = (route.match(/getAiSummaryStats\s*\(/g) || []).length;
  check("route calls getAiSummaryStats exactly once", helperCalls === 1, `${helperCalls} call(s)`);
  check(
    "route passes the resolved authorizedUnits to the helper",
    /getAiSummaryStats\s*\(\s*authorizedUnits\s*\)/.test(route)
  );
  check("route no longer queries leaveRequest directly", !route.includes("leaveRequest"));
  check(
    "route keeps the summarizePeriod payload keys",
    ["summarizePeriod", "label", "total", "completed", "inProgress", "overdue", "waiting", "leaveApproved"].every(
      (token) => route.includes(token)
    )
  );

  check("helper exports getAiSummaryStats", /export\s+async\s+function\s+getAiSummaryStats\s*\(/.test(helper));
  check("helper is data-only (no AI/provider calls)", !/summarizePeriod|callGemini|draftDirective|fetch\s*\(/.test(helper));
  check(
    "route still calls summarizePeriod exactly once (AI provider path unchanged)",
    (route.match(/summarizePeriod\s*\(/g) || []).length === 1
  );
  check("helper does not resolve auth scope itself", !helper.includes("getAuthorizedUnitIds"));
  check(
    "helper scopes leaves by the person's PRIMARY assignment unit",
    /person:\s*\{\s*assignments:\s*\{\s*some:\s*\{\s*isPrimary:\s*true,\s*unitId:\s*\{\s*in:\s*authorizedUnits\s*\}\s*,?\s*\}\s*,?\s*\}\s*,?\s*\}/.test(
      helper
    )
  );
  check(
    "helper counts only APPROVED leaves",
    /leaveRequest\.count\(\s*\{\s*where:\s*\{\s*\.\.\.leaveScope,\s*status:\s*"APPROVED"\s*\}\s*\}\s*\)/.test(helper)
  );
  check(
    "helper derives task scope AND leave scope from authorizedUnits",
    (helper.match(/authorizedUnits\s*===\s*"ALL"/g) || []).length === 2
  );
}

// ---------------------------------------------------------------------------
// 2. Fixture DB: DEPARTMENT_LEADER chỉ thấy đơn vị mình, UNIT_LEADER thấy tất cả
// ---------------------------------------------------------------------------
const DB_URL = (): string => process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || process.env.DIRECT_URL || "";

/** Dọn fixture theo tiền tố code + marker reason — chạy được cả khi setup lỗi giữa chừng. */
async function cleanupFixture(prisma: any): Promise<string[]> {
  const errors: string[] = [];
  const persons = await prisma.person
    .findMany({ where: { code: { startsWith: CODE_PREFIX } }, select: { id: true } })
    .catch((e: any) => {
      errors.push(`đọc fixture persons: ${errText(e)}`);
      return [] as Array<{ id: string }>;
    });
  const personIds = persons.map((p: { id: string }) => p.id);

  await prisma.task
    .deleteMany({ where: { code: { startsWith: CODE_PREFIX } } })
    .catch((e: any) => errors.push(`xoá tasks: ${errText(e)}`));
  await prisma.leaveRequest
    .deleteMany({
      where: {
        OR: [
          { reason: REASON_MARKER },
          ...(personIds.length > 0 ? [{ personId: { in: personIds } }] : []),
        ],
      },
    })
    .catch((e: any) => errors.push(`xoá leaves: ${errText(e)}`));
  await prisma.personAssignment
    .deleteMany({ where: { personId: { in: personIds } } })
    .catch((e: any) => errors.push(`xoá assignments: ${errText(e)}`));
  await prisma.person
    .deleteMany({ where: { id: { in: personIds } } })
    .catch((e: any) => errors.push(`xoá persons: ${errText(e)}`));
  await prisma.orgUnit
    .deleteMany({ where: { code: { startsWith: CODE_PREFIX } } })
    .catch((e: any) => errors.push(`xoá org units: ${errText(e)}`));

  const leftPersons = await prisma.person.count({ where: { code: { startsWith: CODE_PREFIX } } }).catch(() => -1);
  const leftUnits = await prisma.orgUnit.count({ where: { code: { startsWith: CODE_PREFIX } } }).catch(() => -1);
  const leftTasks = await prisma.task.count({ where: { code: { startsWith: CODE_PREFIX } } }).catch(() => -1);
  const leftLeaves = await prisma.leaveRequest.count({ where: { reason: REASON_MARKER } }).catch(() => -1);
  if (leftPersons !== 0) errors.push(`person fixture còn ${leftPersons} bản ghi`);
  if (leftUnits !== 0) errors.push(`org unit fixture còn ${leftUnits} bản ghi`);
  if (leftTasks !== 0) errors.push(`task fixture còn ${leftTasks} bản ghi`);
  if (leftLeaves !== 0) errors.push(`leave fixture còn ${leftLeaves} bản ghi`);
  return errors;
}

function fakeLeader(overrides: Record<string, any>) {
  return {
    id: `task23-${RUN_ID}`,
    personId: `task23-person-${RUN_ID}`,
    username: `task23_${RUN_ID}`,
    fullName: "Task 2.3 fixture",
    permissions: [],
    unitId: null,
    scopeType: "DEPARTMENT",
    scopeUnitId: null,
    ...overrides,
  };
}

async function runFixtureChecks(): Promise<"ok" | "unavailable"> {
  const rawDbUrl = DB_URL();
  if (!rawDbUrl) {
    skip("fixture DB checks", "no DATABASE_URL/TEST_DATABASE_URL configured");
    return "unavailable";
  }
  const dbUrl = assertLocalTestDatabase(rawDbUrl, "test-v3-ai-summary-scope");
  // Helper/guard dùng singleton Prisma của ứng dụng -> trỏ cùng database đã kiểm tra an toàn.
  process.env.DATABASE_URL = dbUrl;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  let dbReachable = false;
  try {
    console.log("\n== Fixture DB checks ==");
    console.log(`[INFO] DB: ${new URL(dbUrl).hostname}/${new URL(dbUrl).pathname.replace(/^\//, "")}`);

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbReachable = true;
    } catch (error: any) {
      skip("fixture DB checks", `database unreachable: ${errText(error)}`);
      return "unavailable";
    }

    const helperPath = path.join(ROOT, "src/server/ai-summary.ts");
    if (!fs.existsSync(helperPath)) {
      check("src/server/ai-summary.ts exists for runtime checks", false, "missing helper — no scoped count to verify");
      return "ok";
    }

    // Dọn leftover của lần chạy trước (nếu có) trước khi đo baseline.
    const staleCleanup = await cleanupFixture(prisma);
    if (staleCleanup.length > 0) {
      check("stale fixture cleanup before setup", false, staleCleanup.join("; "));
    }

    const organization = await prisma.organization.findFirst({ orderBy: { code: "asc" }, select: { id: true } });
    if (!organization) {
      skip("fixture DB checks", "no organization in fixture DB");
      return "unavailable";
    }

    const { getAiSummaryStats } = await import("../src/server/ai-summary");
    const { getAuthorizedUnitIds } = await import("../src/server/guard");

    // Baseline toàn hệ thống (scope ALL) — dùng delta để không phụ thuộc dữ liệu sẵn có.
    const beforeAll = await getAiSummaryStats("ALL");

    // --- Tạo đơn vị + người + phân công -----------------------------------
    const unitA = await prisma.orgUnit.create({
      data: { orgId: organization.id, code: `${CODE_PREFIX}_UNIT_A`, name: `Fixture Task 2.3 A ${RUN_ID}`, status: "INACTIVE" },
    });
    const unitB = await prisma.orgUnit.create({
      data: { orgId: organization.id, code: `${CODE_PREFIX}_UNIT_B`, name: `Fixture Task 2.3 B ${RUN_ID}`, status: "INACTIVE" },
    });

    const personA = await prisma.person.create({
      data: { code: `${CODE_PREFIX}_PERSON_A`, fullName: `Fixture 2.3 người A ${RUN_ID}`, status: "INACTIVE" },
    });
    const personB = await prisma.person.create({
      data: { code: `${CODE_PREFIX}_PERSON_B`, fullName: `Fixture 2.3 người B ${RUN_ID}`, status: "INACTIVE" },
    });

    await prisma.personAssignment.createMany({
      data: [
        { personId: personA.id, unitId: unitA.id, isPrimary: true },
        { personId: personB.id, unitId: unitB.id, isPrimary: true },
        // Phân công KHÔNG chính tại A: không được kéo leave của B vào phạm vi A.
        { personId: personB.id, unitId: unitA.id, isPrimary: false },
      ],
    });

    // Đơn vị A mới hoàn toàn -> baseline phải là 0.
    const beforeA = await getAiSummaryStats([unitA.id]);
    check(
      "new fixture unit A starts with zero task/leave counts",
      beforeA.total === 0 && beforeA.leaveApproved === 0 && beforeA.inProgress === 0,
      JSON.stringify(beforeA)
    );

    // --- Leave: APPROVED ở A và B, PENDING ở A ----------------------------
    const leaveDates = { startDate: new Date("2026-10-01T00:00:00.000Z"), endDate: new Date("2026-10-02T00:00:00.000Z") };
    await prisma.leaveRequest.create({
      data: {
        personId: personA.id,
        type: "NGHI_PHEP",
        reason: REASON_MARKER,
        status: "APPROVED",
        ...leaveDates,
      },
    });
    await prisma.leaveRequest.create({
      data: {
        personId: personA.id,
        type: "NGHI_PHEP",
        reason: REASON_MARKER,
        status: "PENDING",
        ...leaveDates,
      },
    });
    await prisma.leaveRequest.create({
      data: {
        personId: personB.id,
        type: "NGHI_PHEP",
        reason: REASON_MARKER,
        status: "APPROVED",
        ...leaveDates,
      },
    });

    // --- Task: IN_PROGRESS ở A/B, CANCELED ở A ----------------------------
    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.task.create({
      data: {
        code: `${CODE_PREFIX}_TASK_A`,
        title: `Fixture task A ${RUN_ID}`,
        ownerId: personA.id,
        unitId: unitA.id,
        status: "IN_PROGRESS",
        originalDeadline: deadline,
        currentDeadline: deadline,
      },
    });
    await prisma.task.create({
      data: {
        code: `${CODE_PREFIX}_TASK_A_CANCELED`,
        title: `Fixture task A canceled ${RUN_ID}`,
        ownerId: personA.id,
        unitId: unitA.id,
        status: "CANCELED",
        originalDeadline: deadline,
        currentDeadline: deadline,
      },
    });
    await prisma.task.create({
      data: {
        code: `${CODE_PREFIX}_TASK_B`,
        title: `Fixture task B ${RUN_ID}`,
        ownerId: personB.id,
        unitId: unitB.id,
        status: "IN_PROGRESS",
        originalDeadline: deadline,
        currentDeadline: deadline,
      },
    });

    // --- 1. DEPARTMENT_LEADER phạm vi đơn vị A ---------------------------
    const deptLeaderA = fakeLeader({
      role: "DEPARTMENT_LEADER",
      scopeType: "DEPARTMENT",
      scopeUnitId: unitA.id,
      unitId: unitA.id,
    });
    const resolvedDeptA = await getAuthorizedUnitIds(deptLeaderA as any);
    check(
      "getAuthorizedUnitIds(DEPARTMENT_LEADER scope A) returns only unit A",
      Array.isArray(resolvedDeptA) && resolvedDeptA.length === 1 && resolvedDeptA[0] === unitA.id,
      JSON.stringify(resolvedDeptA)
    );

    const deptStatsA = await getAiSummaryStats(resolvedDeptA as string[] | "ALL");
    check(
      "DEPARTMENT_LEADER A: only A's APPROVED leave is counted (B + PENDING excluded)",
      deptStatsA.leaveApproved === 1,
      `leaveApproved=${deptStatsA.leaveApproved} (fixture has 1 APPROVED A, 1 PENDING A, 1 APPROVED B)`
    );
    check(
      "DEPARTMENT_LEADER A: task counts use the same unit scope",
      deptStatsA.total === 1 && deptStatsA.inProgress === 1 && deptStatsA.completed === 0 && deptStatsA.waiting === 0,
      JSON.stringify(deptStatsA)
    );

    // --- 2. Lãnh đạo có phạm vi ALL (UNIT_LEADER) ------------------------
    const unitLeader = fakeLeader({ role: "UNIT_LEADER", scopeType: "DEPARTMENT", scopeUnitId: unitA.id, unitId: unitA.id });
    const resolvedUnitLeader = await getAuthorizedUnitIds(unitLeader as any);
    check('getAuthorizedUnitIds(UNIT_LEADER) returns "ALL"', resolvedUnitLeader === "ALL", String(resolvedUnitLeader));

    const allStats = await getAiSummaryStats(resolvedUnitLeader as string[] | "ALL");
    check(
      "scope ALL: both A and B APPROVED leaves are counted (except PENDING)",
      allStats.leaveApproved === beforeAll.leaveApproved + 2,
      `leaveApproved=${allStats.leaveApproved}, baseline=${beforeAll.leaveApproved}`
    );
    check(
      "scope ALL: task counts include both units but exclude CANCELED",
      allStats.total === beforeAll.total + 2 && allStats.inProgress === beforeAll.inProgress + 2,
      `total=${allStats.total} (baseline ${beforeAll.total}), inProgress=${allStats.inProgress} (baseline ${beforeAll.inProgress})`
    );

    // --- 3. Bằng chứng lỗ rò: phạm vi A nhỏ hơn hẳn phạm vi ALL ----------
    check(
      "scoped A count is smaller than ALL count (B's leave is excluded, not leaked)",
      deptStatsA.leaveApproved < allStats.leaveApproved,
      `A=${deptStatsA.leaveApproved}, ALL=${allStats.leaveApproved}`
    );
    check(
      "B's non-primary assignment in A does NOT leak B's leave into scope A",
      deptStatsA.leaveApproved === 1,
      `leaveApproved=${deptStatsA.leaveApproved}`
    );

    return "ok";
  } catch (error: any) {
    failed++;
    failures.push(`fixture checks threw: ${errText(error)}`);
    console.error(`[FAIL] fixture checks threw: ${errText(error)}`);
    return "ok";
  } finally {
    if (!dbReachable) {
      await prisma.$disconnect().catch(() => {});
      console.log("[INFO] fixture cleanup skipped — database unreachable, no fixture data written");
    } else {
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
}

async function main() {
  console.log("================================================================================");
  console.log("Task 2.3 — số nghỉ phép trong AI summary phải scoped theo đơn vị");
  console.log("================================================================================");

  sourceLevelChecks();

  let runtimeUnavailable = false;
  if (STATIC_ONLY) {
    console.log("\n[INFO] --static-only: bỏ qua kiểm thử fixture DB theo yêu cầu rõ ràng.");
  } else {
    runtimeUnavailable = (await runFixtureChecks()) === "unavailable";
  }

  console.log("\n================================================================================");
  console.log(`RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (runtimeUnavailable) {
    console.error("[FAIL-CLOSED] Fixture DB chưa được kiểm thử — thoát mã 2 (dùng --static-only để chủ động bỏ qua).");
  } else if (STATIC_ONLY) {
    console.log("[INFO] Chỉ kiểm tra tĩnh — KHÔNG tuyên bố đạt kiểm thử số liệu.");
  }
  if (failed === 0) console.log("Không có lỗi.");
  console.log("================================================================================");
  process.exitCode = failed > 0 ? 1 : runtimeUnavailable ? 2 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

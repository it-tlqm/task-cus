/**
 * YC-11 Phase 3 â€” pre-check/final theo PersonSupervision.
 *
 * Cháº¡y trÃªn DB fixture cá»¥c bá»™: talung_v3_approval_impl_quality (port 3117).
 * Server pháº£i cháº¡y vá»›i V3_YC11_PRECHECK=true cho pháº§n HTTP.
 * CÃ¡c case flag OFF Ä‘Æ°á»£c kiá»ƒm tra trá»±c tiáº¿p service (khÃ´ng cáº§n restart server).
 *
 * Fixture supervision Ä‘Æ°á»£c táº¡o/xÃ³a trong DB test; KHÃ”NG seed Production.
 */
import { createRequire } from "node:module";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

const creq = createRequire(import.meta.url);
const { PrismaClient } = creq("@prisma/client");
const bcrypt = creq("bcryptjs");

const dbUrl = assertLocalTestDatabase(
  process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  "test-v3-yc11-precheck"
);
process.env.DATABASE_URL = dbUrl;
process.env.DIRECT_URL = dbUrl;
process.env.JWT_SECRET = process.env.JWT_SECRET || "phase_a_local_test_secret";
// Các test gọi service trực tiếp cần cùng flag với server HTTP.
process.env.V3_YC11_PRECHECK = process.env.V3_YC11_PRECHECK || "true";
process.env.V3_YC10_QUALITY = process.env.V3_YC10_QUALITY || "true";

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const BASE = process.env.TEST_BASE_URL || "http://localhost:3117";
const PASSWORD = process.env.TEST_PASSWORD || "LocalTest@2026";
const TAG = `YC11-${Date.now().toString().slice(-6)}`;

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  [PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
};

const createdTaskIds: string[] = [];
const createdPersonIds: string[] = [];
const createdAccountIds: string[] = [];
const createdSupervisionIds: string[] = [];
const createdGrantIds: string[] = [];

async function login(username: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!json.token) throw new Error(`Ä‘Äƒng nháº­p ${username} lá»—i HTTP ${res.status}: ${json.error || ""}`);
  return json.token as string;
}

const H = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

async function createTempPerson(input: {
  suffix: string;
  roleCode: "STAFF" | "UNIT_LEADER" | "SYSTEM_ADMIN";
  unitId?: string | null;
  withAccount?: boolean;
  fullName?: string;
}) {
  const role = await prisma.role.findUnique({ where: { code: input.roleCode } });
  if (!role) throw new Error(`thiáº¿u role ${input.roleCode}`);
  const person = await prisma.person.create({
    data: {
      code: `${TAG}-${input.suffix}`.toUpperCase(),
      fullName: input.fullName || `${TAG} ${input.suffix}`,
      status: "ACTIVE",
      assignments: input.unitId
        ? { create: [{ unitId: input.unitId, isPrimary: true }] }
        : undefined,
    },
  });
  createdPersonIds.push(person.id);
  if (input.withAccount === false) return { person, account: null, role };

  const username = `yc11${input.suffix}${TAG.slice(-4)}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const account = await prisma.account.create({
    data: {
      personId: person.id,
      username,
      passwordHash: await bcrypt.hash(PASSWORD, 10),
      status: "ACTIVE",
      roleGrants: {
        create: [
          {
            roleId: role.id,
            scopeType: input.roleCode === "UNIT_LEADER" || input.roleCode === "SYSTEM_ADMIN" ? "ORGANIZATION" : "DEPARTMENT",
            scopeUnitId: null,
          },
        ],
      },
    },
    include: { roleGrants: true },
  });
  createdAccountIds.push(account.id);
  for (const g of account.roleGrants) createdGrantIds.push(g.id);
  return { person, account, role };
}

async function addSupervision(managerPersonId: string, subordinatePersonId: string, offsetDays = 0) {
  const effectiveFrom = new Date(Date.now() - (5 + offsetDays) * 86400000);
  const row = await prisma.personSupervision.create({
    data: {
      managerPersonId,
      subordinatePersonId,
      scopeType: "UNIT",
      effectiveFrom,
      status: "CONFIRMED",
    },
  });
  createdSupervisionIds.push(row.id);
  return row;
}

async function createTask(input: {
  suffix: string;
  ownerId: string;
  unitId: string;
  collaboratorIds?: string[];
  withParticipantRows?: boolean;
  status?: string;
  actualResultText?: string;
}) {
  const task = await prisma.task.create({
    data: {
      code: `${TAG}-${input.suffix}`,
      title: `${TAG} nhiá»‡m vá»¥ ${input.suffix}`,
      ownerId: input.ownerId,
      unitId: input.unitId,
      status: input.status || "IN_PROGRESS",
      priority: "Trung bÃ¬nh",
      originalDeadline: new Date("2026-12-31T00:00:00.000Z"),
      currentDeadline: new Date("2026-12-31T00:00:00.000Z"),
      description: TAG,
      actualResultText: input.actualResultText ?? `Káº¿t quáº£ ${input.suffix}`,
      assignees:
        input.collaboratorIds && input.collaboratorIds.length > 0
          ? {
              create: input.collaboratorIds.map((personId) => ({
                personId,
                role: "COLLABORATOR",
              })),
            }
          : undefined,
    },
  });
  createdTaskIds.push(task.id);
  if (input.withParticipantRows !== false) {
    await prisma.taskParticipantResult.createMany({
      data: [
        {
          taskId: task.id,
          personId: input.ownerId,
          role: "OWNER",
          partStatus: "NOT_STARTED",
          legacy: false,
        },
        ...(input.collaboratorIds || []).map((personId) => ({
          taskId: task.id,
          personId,
          role: "COLLABORATOR",
          partStatus: "NOT_STARTED",
          legacy: false,
        })),
      ],
    });
  }
  return task;
}

async function submitPart(token: string, taskId: string, text: string) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}/participant-results`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify({
      action: "SUBMIT",
      partResultText: text,
      partCompletedOn: new Date().toISOString().slice(0, 10),
      partProgressPercent: 100,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function precheck(
  token: string,
  taskId: string,
  personId: string,
  action: "PASS" | "RETURN",
  note?: string
) {
  const res = await fetch(
    `${BASE}/api/tasks/${taskId}/participant-results/${personId}/precheck`,
    {
      method: "POST",
      headers: H(token),
      body: JSON.stringify({ action, note: note ?? null }),
    }
  );
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function submitOverall(token: string, taskId: string) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}/submit-overall`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify({ actualResultText: `${TAG} káº¿t quáº£ chung` }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function decide(
  token: string,
  taskId: string,
  action: "AGREE" | "REJECT" | "CLARIFY",
  extra: Record<string, unknown> = {}
) {
  const res = await fetch(`${BASE}/api/approvals/TASK_RESULT/${taskId}/decision`, {
    method: "POST",
    headers: H(token),
    body: JSON.stringify({
      action,
      qualityPercent: action === "AGREE" ? 80 : null,
      ...extra,
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { res, json };
}

async function taskDetail(token: string, taskId: string) {
  const res = await fetch(`${BASE}/api/tasks/${taskId}`, { headers: H(token) });
  const json = await res.json().catch(() => ({}));
  return { res, json, data: json?.data };
}

async function sessionFor(username: string) {
  const account = await prisma.account.findUnique({
    where: { username },
    include: {
      person: { include: { assignments: { where: { isPrimary: true }, include: { unit: true } } } },
      roleGrants: { include: { role: true } },
    },
  });
  if (!account) throw new Error(`thiáº¿u account ${username}`);
  const now = new Date();
  const grants = account.roleGrants.filter(
    (g) => g.validFrom <= now && (!g.validTo || g.validTo >= now)
  );
  const priority: Record<string, number> = {
    SYSTEM_ADMIN: 4,
    UNIT_LEADER: 3,
    DEPARTMENT_LEADER: 2,
    STAFF: 1,
  };
  const grant = [...grants].sort(
    (a, b) => (priority[b.role.code] || 0) - (priority[a.role.code] || 0)
  )[0];
  return {
    id: account.id,
    personId: account.personId,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    unitId: account.person.assignments[0]?.unitId,
    unitName: account.person.assignments[0]?.unit?.name,
    role: grant?.role.code || "STAFF",
    scopeType: (grant?.scopeType as any) || "DEPARTMENT",
    scopeUnitId: grant?.scopeUnitId ?? null,
    permissions: [],
  };
}

async function cleanup() {
  try {
    if (createdTaskIds.length > 0) {
      await prisma.approvalCase.deleteMany({
        where: { caseType: "TASK_RESULT", resourceId: { in: createdTaskIds } },
      });
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    }
    if (createdSupervisionIds.length > 0) {
      await prisma.personSupervision.deleteMany({ where: { id: { in: createdSupervisionIds } } });
    }
    if (createdGrantIds.length > 0) {
      await prisma.roleGrant.deleteMany({ where: { id: { in: createdGrantIds } } });
    }
    if (createdAccountIds.length > 0) {
      await prisma.account.deleteMany({ where: { id: { in: createdAccountIds } } });
    }
    if (createdPersonIds.length > 0) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
  } catch (err: any) {
    console.error("  [WARN] cleanup lá»—i:", err?.message || err);
  }
}

async function main() {
  console.log(`=== YC-11 PHASE 3 PRECHECK â€” ${BASE} ===\n`);
  console.log(`DB: ${dbUrl}\n`);

  const demoOwner = await prisma.account.findUnique({
    where: { username: "democb01" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  const demoCollab = await prisma.account.findUnique({
    where: { username: "democb02" },
    include: { person: { include: { assignments: { where: { isPrimary: true } } } } },
  });
  const demoLeader = await prisma.account.findUnique({ where: { username: "demold01" } });
  if (!demoOwner || !demoCollab || !demoLeader) {
    console.log("  THIáº¾U tÃ i khoáº£n demo (democb01/democb02/demold01) â€” bá» qua.");
    return;
  }
  const unitA = demoOwner.person.assignments[0]!.unitId;
  const unitB = demoCollab.person.assignments[0]!.unitId;

  const tokOwner = await login("democb01");
  const tokCollab = await login("democb02");
  const tokLeader = await login("demold01");

  const preA = await createTempPerson({
    suffix: "preA",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Pre-check A`,
  });
  const preB = await createTempPerson({
    suffix: "preB",
    roleCode: "STAFF",
    unitId: unitB,
    fullName: `${TAG} Pre-check B`,
  });
  const admin = await createTempPerson({
    suffix: "admin",
    roleCode: "SYSTEM_ADMIN",
    unitId: unitA,
    fullName: `${TAG} Quáº£n trá»‹`,
  });
  const missing = await createTempPerson({
    suffix: "missing",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Missing route`,
  });
  const selfPerson = await createTempPerson({
    suffix: "self",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Self supervision`,
  });
  const cycleP = await createTempPerson({
    suffix: "cycleP",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Cycle P`,
  });
  const cycleM1 = await createTempPerson({
    suffix: "cycleM1",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Cycle M1`,
  });
  const cycleM2 = await createTempPerson({
    suffix: "cycleM2",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Cycle M2`,
  });
  const finalOnlyPerson = await createTempPerson({
    suffix: "finalonly",
    roleCode: "STAFF",
    unitId: unitA,
    fullName: `${TAG} Final-only participant`,
  });
  const finalOnlyLeader = await createTempPerson({
    suffix: "finalonlyld",
    roleCode: "UNIT_LEADER",
    unitId: unitA,
    fullName: `${TAG} Final-only leader`,
  });

  const tokPreA = preA.account ? await login(preA.account.username) : "";
  const tokPreB = preB.account ? await login(preB.account.username) : "";
  const tokAdmin = admin.account ? await login(admin.account.username) : "";
  const tokMissing = missing.account ? await login(missing.account.username) : "";
  const tokSelf = selfPerson.account ? await login(selfPerson.account.username) : "";
  const tokCycle = cycleP.account ? await login(cycleP.account.username) : "";
  const tokFinalOnly = finalOnlyPerson.account ? await login(finalOnlyPerson.account.username) : "";
  const tokFinalOnlyLeader = finalOnlyLeader.account ? await login(finalOnlyLeader.account.username) : "";

  const baseline = {
    supervision: await prisma.personSupervision.count(),
    roles: await prisma.role.count(),
    permissions: await prisma.permission.count(),
    monthly: await prisma.monthlyWorkResult.count(),
    products: await prisma.productItem.count(),
    workProducts: await prisma.workItemProduct.count(),
    assessments: await prisma.evaluationAssessment.count(),
  };

  try {
    // ================================================================
    // A. Route resolver: missing / self / cycle / final-only
    // ================================================================
    console.log("\n--- A. Route resolver ---");

    // Missing route
    await addSupervision(selfPerson.person.id, selfPerson.person.id);
    const tMissing = await createTask({
      suffix: "MISS",
      ownerId: missing.person.id,
      unitId: unitA,
    });
    await submitPart(tokMissing, tMissing.id, "Pháº§n viá»‡c missing route Ä‘Ã£ xong.");
    {
      const d = await taskDetail(tokMissing, tMissing.id);
      check("A1 missing route => WAITING_ASSIGNMENT", d.data?.precheck?.route?.status === "WAITING_ASSIGNMENT", d.data?.precheck?.route?.status);
      check("A2 missing route canSubmitOverall=false", d.data?.precheck?.canSubmitOverall === false);
      const sub = await submitOverall(tokMissing, tMissing.id);
      check("A3 missing route owner submit => 409", sub.res.status === 409, String(sub.res.status));
      const snapshotCount = await prisma.approvalRouteSnapshot.count({ where: { taskId: tMissing.id } });
      check("A4 missing route no snapshot", snapshotCount === 0, String(snapshotCount));
      const pre = await precheck(tokPreA, tMissing.id, missing.person.id, "PASS");
      check("A5 missing route pre-check => 403/404/409", [403, 404, 409].includes(pre.res.status), String(pre.res.status));
    }

    // Self supervision
    const tSelf = await createTask({
      suffix: "SELF",
      ownerId: selfPerson.person.id,
      unitId: unitA,
    });
    await submitPart(tokSelf, tSelf.id, "Pháº§n viá»‡c self supervision Ä‘Ã£ xong.");
    {
      const d = await taskDetail(tokSelf, tSelf.id);
      check("A6 self supervision => WAITING_ASSIGNMENT", d.data?.precheck?.route?.status === "WAITING_ASSIGNMENT", d.data?.precheck?.route?.status);
      const sub = await submitOverall(tokSelf, tSelf.id);
      check("A7 self supervision submit => 409", sub.res.status === 409, String(sub.res.status));
    }

    // Cycle: cycleP manager cycleM1; cycleM1 manager cycleM2; cycleM2 manager cycleP
    await addSupervision(cycleM1.person.id, cycleP.person.id, 1);
    await addSupervision(cycleM2.person.id, cycleM1.person.id, 2);
    await addSupervision(cycleP.person.id, cycleM2.person.id, 3);
    const tCycle = await createTask({
      suffix: "CYCLE",
      ownerId: cycleP.person.id,
      unitId: unitA,
    });
    await submitPart(tokCycle, tCycle.id, "Pháº§n viá»‡c cycle Ä‘Ã£ xong.");
    {
      const d = await taskDetail(tokCycle, tCycle.id);
      check("A8 cycle => CYCLE", d.data?.precheck?.route?.status === "CYCLE", d.data?.precheck?.route?.status);
      const sub = await submitOverall(tokCycle, tCycle.id);
      check("A9 cycle submit => 409", sub.res.status === 409, String(sub.res.status));
      const snapshotCount = await prisma.approvalRouteSnapshot.count({ where: { taskId: tCycle.id } });
      check("A10 cycle no snapshot", snapshotCount === 0);
    }

    // Final-only manager: participant's only manager is final-eligible leader.
    await addSupervision(finalOnlyLeader.person.id, finalOnlyPerson.person.id, 4);
    const tFinalOnly = await createTask({
      suffix: "FONLY",
      ownerId: finalOnlyPerson.person.id,
      unitId: unitA,
    });
    await submitPart(tokFinalOnly, tFinalOnly.id, "Pháº§n viá»‡c final-only manager Ä‘Ã£ xong.");
    {
      const d = await taskDetail(tokFinalOnly, tFinalOnly.id);
      check(
        "A11 manager=final authority => WAITING_ASSIGNMENT",
        d.data?.precheck?.route?.status === "WAITING_ASSIGNMENT",
        d.data?.precheck?.route?.status
      );
      const pre = await precheck(tokFinalOnlyLeader, tFinalOnly.id, finalOnlyPerson.person.id, "PASS");
      check("A12 final authority cannot pre-check => 403/409", [403, 409].includes(pre.res.status), String(pre.res.status));
      const sub = await submitOverall(tokFinalOnly, tFinalOnly.id);
      check("A13 final authority-only route submit => 409", sub.res.status === 409, String(sub.res.status));
    }

    // ================================================================
    // B. Happy path 2-step, multi-department
    // ================================================================
    console.log("\n--- B. Happy path / multi-department ---");
    await addSupervision(preA.person.id, demoOwner.personId, 5);
    await addSupervision(preB.person.id, demoCollab.personId, 6);

    const tMain = await createTask({
      suffix: "MAIN",
      ownerId: demoOwner.personId,
      unitId: unitA,
      collaboratorIds: [demoCollab.personId],
    });

    const ownerPart = await submitPart(tokOwner, tMain.id, "Chá»§ trÃ¬ Ä‘Ã£ hoÃ n thÃ nh pháº§n tá»•ng há»£p.");
    check("B1 owner bÃ¡o pháº§n mÃ¬nh", ownerPart.res.status === 201, String(ownerPart.res.status));
    const collabPart = await submitPart(tokCollab, tMain.id, "Phá»‘i há»£p Ä‘Ã£ hoÃ n thÃ nh pháº§n chuyÃªn mÃ´n.");
    check("B2 collaborator bÃ¡o pháº§n mÃ¬nh", collabPart.res.status === 201, String(collabPart.res.status));

    {
      const dA = await taskDetail(tokPreA, tMain.id);
      const ownerRoute = dA.data?.precheck?.route?.participants?.find(
        (p: any) => p.personId === demoOwner.personId
      );
      const collabRoute = dA.data?.precheck?.route?.participants?.find(
        (p: any) => p.personId === demoCollab.personId
      );
      check("B3 route READY", dA.data?.precheck?.route?.status === "READY", dA.data?.precheck?.route?.status);
      check("B4 preA is owner-route prechecker", !!ownerRoute?.eligiblePrecheckers?.some((p: any) => p.personId === preA.person.id));
      check("B5 preA cannot pre-check collaborator route", !collabRoute?.eligiblePrecheckers?.some((p: any) => p.personId === preA.person.id));
      check("B6 preA canPrecheck owner part", ownerRoute?.canPrecheck === true);
    }
    {
      const dB = await taskDetail(tokPreB, tMain.id);
      const collabRoute = dB.data?.precheck?.route?.participants?.find(
        (p: any) => p.personId === demoCollab.personId
      );
      check("B7 preB canPrecheck collaborator part", collabRoute?.canPrecheck === true);
    }

    const passOwner = await precheck(tokPreA, tMain.id, demoOwner.personId, "PASS");
    check("B8 pre-check owner PASS", passOwner.res.status === 200, String(passOwner.res.status));
    {
      const row = await prisma.taskParticipantResult.findUnique({
        where: { taskId_personId: { taskId: tMain.id, personId: demoOwner.personId } },
      });
      const task = await prisma.task.findUnique({ where: { id: tMain.id } });
      const caseCount = await prisma.approvalCase.count({
        where: { caseType: "TASK_RESULT", resourceId: tMain.id },
      });
      check("B9 pre-check does not ACCEPT participant", row?.partStatus === "SUBMITTED", row?.partStatus);
      check("B10 pre-check keeps Task IN_PROGRESS", task?.status === "IN_PROGRESS", task?.status);
      check("B11 pre-check does not open ApprovalCase", caseCount === 0, String(caseCount));
    }

    const passOwnerAgain = await precheck(tokPreA, tMain.id, demoOwner.personId, "PASS");
    check("B12 second pre-checker PASS is idempotent", passOwnerAgain.res.status === 200 && passOwnerAgain.json?.data?.alreadyPassed === true, JSON.stringify(passOwnerAgain.json?.data));
    {
      const events = await prisma.taskParticipantEvent.count({
        where: { taskId: tMain.id, personId: demoOwner.personId, eventType: "PRECHECK_PASS" },
      });
      check("B13 one PASS event only (E11.6)", events === 1, String(events));
    }

    const passCollab = await precheck(tokPreB, tMain.id, demoCollab.personId, "PASS");
    check("B14 pre-check collaborator PASS", passCollab.res.status === 200, String(passCollab.res.status));

    {
      const d = await taskDetail(tokOwner, tMain.id);
      check("B15 all parts pre-checked => canSubmitOverall", d.data?.precheck?.canSubmitOverall === true);
    }

    const subMain = await submitOverall(tokOwner, tMain.id);
    check("B16 owner submits overall after pre-check", subMain.res.status === 201, `${subMain.res.status} ${subMain.json?.error || ""}`);
    {
      const task = await prisma.task.findUnique({ where: { id: tMain.id } });
      const snap = await prisma.approvalRouteSnapshot.findFirst({ where: { taskId: tMain.id } });
      const json: any = snap?.routeJson ?? {};
      check("B17 Task WAITING_REVIEW", task?.status === "WAITING_REVIEW", task?.status);
      check("B18 route snapshot READY", snap?.routeStatus === "READY", snap?.routeStatus);
      check(
        "B19 snapshot records actual precheckers",
        json?.participants?.find((p: any) => p.personId === demoOwner.personId)?.precheckedBy?.personId === preA.person.id &&
          json?.participants?.find((p: any) => p.personId === demoCollab.personId)?.precheckedBy?.personId === preB.person.id
      );
      check(
        "B20 snapshot final candidates exclude participants",
        Array.isArray(json?.final?.candidates) &&
          !json.final.candidates.some((c: any) => c.personId === demoOwner.personId || c.personId === demoCollab.personId)
      );
    }

    // Snapshot immutability test is run after security checks (so routes stay usable here).

    // Non-candidate leader (added after snapshot) cannot final.
    const lateLeader = await createTempPerson({
      suffix: "lateleader",
      roleCode: "UNIT_LEADER",
      unitId: unitA,
      fullName: `${TAG} Late leader`,
    });
    const tokLateLeader = lateLeader.account ? await login(lateLeader.account.username) : "";
    {
      const d = await decide(tokLateLeader, tMain.id, "AGREE");
      check("B22 leader outside snapshot => 403", d.res.status === 403, `${d.res.status} ${d.json?.error || ""}`);
    }

    // Pre-checker cannot become final even if granted leader role after snapshot.
    {
      const leaderRole = await prisma.role.findUnique({ where: { code: "UNIT_LEADER" } });
      if (leaderRole && preA.account) {
        const grant = await prisma.roleGrant.create({
          data: {
            accountId: preA.account.id,
            roleId: leaderRole.id,
            scopeType: "ORGANIZATION",
          },
        });
        createdGrantIds.push(grant.id);
        const tokPreAPromoted = await login(preA.account.username);
        const d = await decide(tokPreAPromoted, tMain.id, "AGREE");
        check("B23 pre-checker cannot final after promotion => 403", d.res.status === 403, `${d.res.status} ${d.json?.error || ""}`);
        // Tráº£ láº¡i role STAFF cho cÃ¡c test sau (C/E dÃ¹ng preA lÃ m pre-checker).
        await prisma.roleGrant.delete({ where: { id: grant.id } });
      }
    }

    // Final by authorized leader.
    const finalMain = await decide(tokLeader, tMain.id, "AGREE", { reason: "Äá»“ng Ã½ nghiá»‡m thu" });
    check("B24 final AGREE after pre-check", finalMain.res.status === 200, `${finalMain.res.status} ${finalMain.json?.error || ""}`);
    {
      const task = await prisma.task.findUnique({ where: { id: tMain.id } });
      const rows = await prisma.taskParticipantResult.findMany({ where: { taskId: tMain.id } });
      const cases = await prisma.approvalCase.findMany({
        where: { caseType: "TASK_RESULT", resourceId: tMain.id },
        include: { decisions: true, routeSnapshots: true },
      });
      check("B25 Task COMPLETED only after final", task?.status === "COMPLETED", task?.status);
      check("B26 participants ACCEPTED after final", rows.every((r) => r.partStatus === "ACCEPTED"));
      check("B27 exactly one ApprovalCase", cases.length === 1, String(cases.length));
      check("B28 exactly one final decision", cases[0]?.decisions?.filter((x) => x.action === "AGREE").length === 1);
      check("B29 snapshot linked to case", cases[0]?.routeSnapshots?.length === 1 && cases[0].routeSnapshots[0].caseId === cases[0].id);
    }

    // ================================================================
    // C. Pre-check RETURN
    // ================================================================
    console.log("\n--- C. Pre-check RETURN ---");
    const tReturn = await createTask({
      suffix: "RET",
      ownerId: demoOwner.personId,
      unitId: unitA,
      collaboratorIds: [demoCollab.personId],
    });
    await submitPart(tokOwner, tReturn.id, "Báº£n Ä‘áº§u tiÃªn cá»§a chá»§ trÃ¬.");
    await submitPart(tokCollab, tReturn.id, "Báº£n Ä‘áº§u tiÃªn cá»§a phá»‘i há»£p.");
    {
      const bad = await precheck(tokPreA, tReturn.id, demoOwner.personId, "RETURN", "x");
      check("C1 RETURN without valid note => 422", bad.res.status === 422, String(bad.res.status));
      const ret = await precheck(tokPreA, tReturn.id, demoOwner.personId, "RETURN", "Thiáº¿u minh chá»©ng, bá»• sung.");
      check("C2 pre-check RETURN succeeds", ret.res.status === 200, String(ret.res.status));
      const row = await prisma.taskParticipantResult.findUnique({
        where: { taskId_personId: { taskId: tReturn.id, personId: demoOwner.personId } },
      });
      const task = await prisma.task.findUnique({ where: { id: tReturn.id } });
      const caseCount = await prisma.approvalCase.count({
        where: { caseType: "TASK_RESULT", resourceId: tReturn.id },
      });
      check("C3 participant RETURNED", row?.partStatus === "RETURNED", row?.partStatus);
      check("C4 Task stays IN_PROGRESS", task?.status === "IN_PROGRESS", task?.status);
      check("C5 still no ApprovalCase", caseCount === 0);
    }
    {
      const sub = await submitOverall(tokOwner, tReturn.id);
      check("C6 owner submit while part RETURNED => 409", sub.res.status === 409, String(sub.res.status));
      const again = await submitPart(tokOwner, tReturn.id, "Báº£n bá»• sung minh chá»©ng.");
      check("C7 owner re-submits own part", again.res.status === 201, String(again.res.status));
      const pass = await precheck(tokPreA, tReturn.id, demoOwner.personId, "PASS");
      check("C8 pre-check PASS after re-submit", pass.res.status === 200, String(pass.res.status));
      const pass2 = await precheck(tokPreB, tReturn.id, demoCollab.personId, "PASS");
      check("C9 collaborator pre-check PASS", pass2.res.status === 200, String(pass2.res.status));
      const sub2 = await submitOverall(tokOwner, tReturn.id);
      check("C10 submit after rework => 201", sub2.res.status === 201, String(sub2.res.status));
    }

    // ================================================================
    // D. Legacy final-only
    // ================================================================
    console.log("\n--- D. Legacy final-only ---");
    const tLegacy = await createTask({
      suffix: "LEGACY",
      ownerId: demoOwner.personId,
      unitId: unitA,
      withParticipantRows: false,
      status: "WAITING_REVIEW",
      actualResultText: "Káº¿t quáº£ legacy Ä‘Ã£ trÃ¬nh trÆ°á»›c khi báº­t YC-11.",
    });
    {
      const d = await taskDetail(tokOwner, tLegacy.id);
      check("D1 legacy precheck view enabled", d.data?.precheck?.enabled === true);
      check("D2 legacy route legacyOnly", d.data?.precheck?.route?.legacyOnly === true);
      const final = await decide(tokLeader, tLegacy.id, "AGREE", { reason: "Legacy Ä‘á»“ng Ã½" });
      check("D3 legacy final-only succeeds", final.res.status === 200, `${final.res.status} ${final.json?.error || ""}`);
      const snapshotCount = await prisma.approvalRouteSnapshot.count({ where: { taskId: tLegacy.id } });
      check("D4 legacy has no route snapshot", snapshotCount === 0);
    }

    // D5-D6: Task có participant row nhưng thiếu snapshot KHÔNG được coi là legacy.
    {
      const tNoSnapshot = await createTask({
        suffix: "NOSNAPSHOT",
        ownerId: demoOwner.personId,
        unitId: unitA,
        withParticipantRows: true,
        status: "WAITING_REVIEW",
        actualResultText: "Task co participant row nhung thieu snapshot.",
      });
      const blocked = await decide(tokLeader, tNoSnapshot.id, "AGREE", {
        reason: "Thu final khi thieu snapshot",
      });
      check(
        "D5 participant task without snapshot => 409",
        blocked.res.status === 409,
        `${blocked.res.status} ${blocked.json?.error || ""}`
      );
      const caseCount = await prisma.approvalCase.count({
        where: { caseType: "TASK_RESULT", resourceId: tNoSnapshot.id },
      });
      check("D6 no ApprovalCase when snapshot missing", caseCount === 0, String(caseCount));
    }

    // ================================================================
    // E. Security: SYSTEM_ADMIN, self, wrong route
    // ================================================================
    console.log("\n--- E. Security ---");
    {
      const tSec = await createTask({
        suffix: "SEC",
        ownerId: demoOwner.personId,
        unitId: unitA,
        collaboratorIds: [demoCollab.personId],
      });
      await submitPart(tokOwner, tSec.id, "Pháº§n viá»‡c báº£o máº­t.");
      const adminPre = await precheck(tokAdmin, tSec.id, demoOwner.personId, "PASS");
      check("E1 SYSTEM_ADMIN pre-check blocked", adminPre.res.status === 403, String(adminPre.res.status));
      const adminFinal = await decide(tokAdmin, tSec.id, "AGREE");
      check("E2 SYSTEM_ADMIN final blocked", adminFinal.res.status === 403, String(adminFinal.res.status));
      const selfPre = await precheck(tokOwner, tSec.id, demoOwner.personId, "PASS");
      check("E3 self pre-check blocked", selfPre.res.status === 403, String(selfPre.res.status));
      const wrongRoute = await precheck(tokPreB, tSec.id, demoOwner.personId, "PASS");
      check("E4 wrong route pre-check blocked", wrongRoute.res.status === 403, String(wrongRoute.res.status));
    }

    // E5. KhÃ´ng cho "pháº£n há»“i giáº£i trÃ¬nh" táº¯t bÆ°á»›c pre-check á»Ÿ Task per-person.
    {
      const tResp = await createTask({
        suffix: "RESP",
        ownerId: demoOwner.personId,
        unitId: unitA,
        collaboratorIds: [demoCollab.personId],
      });
      await prisma.approvalCase.create({
        data: {
          caseType: "TASK_RESULT",
          resourceId: tResp.id,
          resourceCode: tResp.code,
          title: tResp.title,
          unitId: unitA,
          submittedById: demoOwner.personId,
          status: "CLARIFY_REQUESTED",
          currentRound: 1,
        },
      });
      const { respondToApproval } = await import("../src/server/approval-case");
      const ownerSession = await sessionFor("democb01");
      const resp = await respondToApproval(
        ownerSession as any,
        "TASK_RESULT",
        tResp.id,
        "Pháº£n há»“i giáº£i trÃ¬nh táº¯t bÆ°á»›c"
      );
      check(
        "E5 respond-to-clarify cannot bypass pre-check => 409",
        resp.success === false && resp.status === 409,
        JSON.stringify({ success: resp.success, status: resp.status, error: resp.error })
      );
    }

    // Snapshot immutability: route changes after submission must not rewrite snapshot.
    {
      await prisma.personSupervision.deleteMany({
        where: {
          managerPersonId: preA.person.id,
          subordinatePersonId: demoOwner.personId,
        },
      });
      await addSupervision(preA.person.id, demoCollab.personId, 7);
      const d = await taskDetail(tokOwner, tMain.id);
      const snapshot = d.data?.precheck?.latestSnapshot;
      const json: any = snapshot?.routeJson ?? {};
      check(
        "E6 snapshot remains after route change",
        snapshot?.routeStatus === "READY" &&
          json?.participants?.find((p: any) => p.personId === demoOwner.personId)?.precheckedBy?.personId === preA.person.id &&
          json?.participants?.find((p: any) => p.personId === demoCollab.personId)?.precheckedBy?.personId === preB.person.id
      );
    }

    // ================================================================
    // F. Flag OFF â€” direct service, legacy path
    // ================================================================
    console.log("\n--- F. Flag OFF legacy path ---");
    {
      const prevPrecheck = process.env.V3_YC11_PRECHECK;
      const prevQuality = process.env.V3_YC10_QUALITY;
      process.env.V3_YC11_PRECHECK = "false";
      process.env.V3_YC10_QUALITY = "false";
      const { submitOverallResult } = await import("../src/server/task-participant");
      const { decideApproval } = await import("../src/server/approval-case");

      const tOff = await createTask({
        suffix: "OFF",
        ownerId: demoOwner.personId,
        unitId: unitA,
        collaboratorIds: [demoCollab.personId],
      });
      await submitPart(tokCollab, tOff.id, "Phá»‘i há»£p bÃ¡o pháº§n viá»‡c khi flag OFF.");
      const ownerSession = await sessionFor("democb01");
      const leaderSession = await sessionFor("demold01");
      let offSubmitOk = false;
      let offFinalOk = false;
      try {
        await submitOverallResult(ownerSession as any, tOff.id, {
          actualResultText: "Ná»™p chung khi flag OFF.",
        });
        offSubmitOk = true;
      } catch (err: any) {
        console.log("  flag OFF submit error:", err?.message || err);
      }
      check("F1 flag OFF submit overall without pre-check", offSubmitOk);
      const snapshotCount = await prisma.approvalRouteSnapshot.count({ where: { taskId: tOff.id } });
      check("F2 flag OFF no route snapshot", snapshotCount === 0);
      try {
        const res = await decideApproval({
          user: leaderSession as any,
          caseType: "TASK_RESULT",
          resourceId: tOff.id,
          action: "AGREE",
          reason: "Flag OFF final",
        });
        offFinalOk = res.success === true;
      } catch (err: any) {
        console.log("  flag OFF final error:", err?.message || err);
      }
      check("F3 flag OFF final-only succeeds", offFinalOk);

      if (prevPrecheck === undefined) delete process.env.V3_YC11_PRECHECK;
      else process.env.V3_YC11_PRECHECK = prevPrecheck;
      if (prevQuality === undefined) delete process.env.V3_YC10_QUALITY;
      else process.env.V3_YC10_QUALITY = prevQuality;
    }

    // ================================================================
    // G. Schema / migration / score isolation
    // ================================================================
    console.log("\n--- G. Schema / isolation ---");
    {
      const table = await prisma.$queryRawUnsafe<any[]>(
        `select to_regclass('approval_route_snapshots')::text as t`
      );
      check("G1 approval_route_snapshots exists", !!table[0]?.t);
      const unique = await prisma.$queryRawUnsafe<any[]>(
        `select indexname from pg_indexes where tablename='approval_route_snapshots' and indexdef like '%UNIQUE%'`
      );
      check(
        "G2 unique (task_id, round)",
        unique.some((x) => String(x.indexname).includes("task_id_round"))
      );
      let checkRejected = false;
      try {
        await prisma.$executeRawUnsafe(
          `insert into approval_route_snapshots (id, task_id, round, route_status, route_json) values ('${TAG}-bad', '${tLegacy.id}', 99, 'INVALID', '{}'::jsonb)`
        );
      } catch {
        checkRejected = true;
      }
      check("G3 route_status CHECK rejects invalid", checkRejected);
      const roles = await prisma.role.count();
      const permissions = await prisma.permission.count();
      const existingFixtureSupervisions =
        createdSupervisionIds.length > 0
          ? await prisma.personSupervision.count({
              where: { id: { in: createdSupervisionIds } },
            })
          : 0;
      const supervision = await prisma.personSupervision.count();
      check("G4 no new role", roles === baseline.roles, `${baseline.roles} -> ${roles}`);
      check("G5 no new permission", permissions === baseline.permissions, `${baseline.permissions} -> ${permissions}`);
      check(
        "G6 person_supervisions only fixture rows",
        supervision === baseline.supervision + existingFixtureSupervisions,
        `${baseline.supervision} + ${existingFixtureSupervisions} -> ${supervision}`
      );
      check("G7 no MonthlyWorkResult changes", (await prisma.monthlyWorkResult.count()) === baseline.monthly);
      check("G8 no ProductItem changes", (await prisma.productItem.count()) === baseline.products);
      check("G9 no WorkItemProduct changes", (await prisma.workItemProduct.count()) === baseline.workProducts);
      check("G10 no EvaluationAssessment changes", (await prisma.evaluationAssessment.count()) === baseline.assessments);
    }

    // ================================================================
    // H. Quick approve quality flag exposure (Phase 2b)
    // ================================================================
    console.log("\n--- H. Quick approve quality bridge ---");
    {
      const listRes = await fetch(`${BASE}/api/tasks?pageSize=5`, { headers: H(tokLeader) });
      const listJson = await listRes.json().catch(() => ({}));
      check("H1 GET /api/tasks exposes qualityEnabled", typeof listJson?.qualityEnabled === "boolean", String(listJson?.qualityEnabled));
      check("H2 task rows expose qualityEnabled", Array.isArray(listJson?.data) && (listJson.data.length === 0 || typeof listJson.data[0]?.qualityEnabled === "boolean"));

      const tQuick = await createTask({
        suffix: "QUICK",
        ownerId: demoOwner.personId,
        unitId: unitA,
        withParticipantRows: false,
        status: "WAITING_REVIEW",
        actualResultText: "Káº¿t quáº£ chá» duyá»‡t nhanh.",
      });
      const quickRes = await fetch(`${BASE}/api/tasks`, {
        method: "PATCH",
        headers: H(tokLeader),
        body: JSON.stringify({ id: tQuick.id, action: "CONFIRM_COMPLETION", qualityPercent: 65 }),
      });
      const quickJson = await quickRes.json().catch(() => ({}));
      check("H3 quick approve with quality succeeds", quickRes.status === 200, `${quickRes.status} ${quickJson?.error || ""}`);
      const caseRow = await prisma.approvalCase.findFirst({
        where: { caseType: "TASK_RESULT", resourceId: tQuick.id },
        include: { decisions: true },
      });
      check("H4 quick approve stores quality 65", caseRow?.decisions?.[0]?.qualityPercent === 65, String(caseRow?.decisions?.[0]?.qualityPercent));
    }
  } finally {
    await cleanup();
  }

  console.log(`\n=== Káº¾T QUáº¢: ${pass} PASS / ${fail} FAIL ===`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch(async (err) => {
    console.error("\nLá»–I TEST:", err);
    await cleanup();
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


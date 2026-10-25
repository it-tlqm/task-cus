/**
 * test-ux-phase2a-plan-edit.ts — Kiểm thử API sửa tiêu đề kế hoạch (Phase 2A / Task 2A2).
 *
 * Chạy trên database kiểm thử CỤC BỘ (chặn bởi test-db-safety):
 *   npx tsx scripts/test-ux-phase2a-plan-edit.ts
 *
 * Phạm vi:
 *  1. Người tạo (STAFF) sửa được tiêu đề kế hoạch DRAFT/RETURNED của chính mình.
 *  2. STAFF cùng đơn vị không phải người tạo, hoặc lãnh đạo ngoài phạm vi → 403.
 *  3. Lãnh đạo/Trưởng bộ phận trong phạm vi sửa được theo policy hiện hành.
 *  4. SUBMITTED/APPROVED/IN_EFFECT → 409, không ghi đè nội dung.
 *  5. Validate title 1..300, từ chối field không được đổi (unit/period/status/creator).
 *  6. Kỳ đã chốt → 423.
 *  7. Audit `PLAN_UPDATE` lưu old/new tiêu đề.
 *
 * Script tự tạo fixture (kế hoạch + kỳ khóa tạm) và dọn sạch trong finally.
 */
import fs from "fs";
import { assertLocalTestDatabase } from "./lib/test-db-safety";

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

const dbUrl = assertLocalTestDatabase(process.env.DATABASE_URL, "test-ux-phase2a-plan-edit");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(name + (detail ? " - " + detail : ""));
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

async function main() {
  const { PrismaClient } = await import("@prisma/client");
  const { NextRequest } = await import("next/server");
  const { pickPrimaryGrant, signToken } = await import("../src/server/auth");
  const { PATCH } = await import("../src/app/api/plans/[id]/route");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const now = new Date();
  const planIds: string[] = [];
  let lockedPeriodId = "";

  try {
    const accounts = await prisma.account.findMany({
      where: { status: "ACTIVE", person: { status: "ACTIVE" } },
      include: {
        person: {
          include: {
            assignments: {
              where: {
                isPrimary: true,
                effectiveFrom: { lte: now },
                OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
              },
            },
          },
        },
        roleGrants: {
          where: {
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gte: now } }],
          },
          include: { role: true },
        },
      },
    });

    const mapped = accounts.map((a) => {
      const grant = pickPrimaryGrant(a.roleGrants);
      return {
        ...a,
        roleCode: grant?.role.code || "STAFF",
        scopeType: grant?.scopeType || "DEPARTMENT",
        scopeUnitId: grant?.scopeUnitId || null,
        unitId: a.person?.assignments?.[0]?.unitId || null,
      };
    });

    const inScopeLeader = mapped.find(
      (a) => a.roleCode === "DEPARTMENT_LEADER" && a.scopeUnitId && a.person
    );
    if (!inScopeLeader) throw new Error("Fixture thiếu tài khoản DEPARTMENT_LEADER trong đơn vị");

    const unitId = inScopeLeader.scopeUnitId!;
    const unitStaff = mapped.filter(
      (a) => a.roleCode === "STAFF" && a.unitId === unitId && a.person
    );
    const creator = unitStaff[0];
    const otherStaff = unitStaff.find((a) => a.person!.id !== creator?.person?.id);
    const outsiderLeader = mapped.find(
      (a) => a.roleCode === "DEPARTMENT_LEADER" && a.scopeUnitId !== unitId && a.person
    );

    if (!creator || !otherStaff || !outsiderLeader) {
      throw new Error(
        "Fixture thiếu tài khoản phù hợp (cần 1 DEPARTMENT_LEADER trong đơn vị, " +
          "2 STAFF cùng đơn vị, 1 DEPARTMENT_LEADER ngoài đơn vị)"
      );
    }

    const token = (a: typeof creator) =>
      signToken({
        id: a.id,
        personId: a.person!.id,
        username: a.username,
        fullName: a.person!.fullName,
        role: a.roleCode,
        scopeType: a.scopeType as any,
        scopeUnitId: a.scopeUnitId,
        permissions: [],
      });

    const tokenCreator = token(creator);
    const tokenOtherStaff = token(otherStaff);
    const tokenInScopeLeader = token(inScopeLeader);
    const tokenOutsiderLeader = token(outsiderLeader);

    const period = await prisma.reportingPeriod.findFirst({
      where: { isLocked: false },
      orderBy: { startAt: "desc" },
    });
    if (!period) throw new Error("Fixture thiếu kỳ công tác chưa chốt");

    const stamp = Date.now();
    const createPlan = async (status: string, title: string, periodId = period.id) => {
      const plan = await prisma.plan.create({
        data: {
          periodId,
          unitId,
          creatorId: creator.person!.id,
          title,
          status,
        },
      });
      planIds.push(plan.id);
      return plan;
    };

    const planDraft = await createPlan("DRAFT", `[TEST-2A2] Kế hoạch nháp ${stamp}`);
    const planReturned = await createPlan("RETURNED", `[TEST-2A2] Kế hoạch trả lại ${stamp}`);
    const planSubmitted = await createPlan("SUBMITTED", `[TEST-2A2] Kế hoạch chờ duyệt ${stamp}`);
    const planApproved = await createPlan("APPROVED", `[TEST-2A2] Kế hoạch đã duyệt ${stamp}`);
    const planInEffect = await createPlan("IN_EFFECT", `[TEST-2A2] Kế hoạch hiệu lực ${stamp}`);
    const planValidation = await createPlan("DRAFT", `[TEST-2A2] Kế hoạch validate ${stamp}`);

    lockedPeriodId = (
      await prisma.reportingPeriod.create({
        data: {
          type: "WEEK",
          title: `[TEST-2A2] Kỳ đã chốt ${stamp}`,
          startAt: new Date("2027-01-04T00:00:00.000Z"),
          endAt: new Date("2027-01-10T00:00:00.000Z"),
          isLocked: true,
        },
      })
    ).id;
    const planLockedPeriod = await createPlan(
      "DRAFT",
      `[TEST-2A2] Kế hoạch kỳ khóa ${stamp}`,
      lockedPeriodId
    );

    const call = async (tok: string | null, planId: string, payload: any) => {
      const req = new NextRequest(`http://localhost/api/plans/${planId}`, {
        method: "PATCH",
        headers: {
          ...(tok ? { authorization: `Bearer ${tok}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const res = await PATCH(req as any, { params: Promise.resolve({ id: planId }) } as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    const rawCall = async (tok: string, planId: string, raw: string) => {
      const req = new NextRequest(`http://localhost/api/plans/${planId}`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: raw,
      });
      const res = await PATCH(req as any, { params: Promise.resolve({ id: planId }) } as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    // --- 1. Xác thực & phân quyền
    const noAuth = await call(null, planDraft.id, { title: "Không đăng nhập" });
    check("Không có token PATCH bị 401", noAuth.status === 401, `status=${noAuth.status}`);

    const outsiderStaff = await call(tokenOtherStaff, planDraft.id, {
      title: "[TEST-2A2] STAFF khác sửa",
    });
    check(
      "STAFF cùng đơn vị không phải người tạo bị 403",
      outsiderStaff.status === 403,
      `status=${outsiderStaff.status}`
    );

    const outsiderLeaderRes = await call(tokenOutsiderLeader, planDraft.id, {
      title: "[TEST-2A2] Lãnh đạo ngoài phạm vi sửa",
    });
    check(
      "Trưởng bộ phận ngoài phạm vi đơn vị bị 403",
      outsiderLeaderRes.status === 403,
      `status=${outsiderLeaderRes.status}`
    );

    const stillDraft = await prisma.plan.findUnique({ where: { id: planDraft.id } });
    check("403 không làm thay đổi tiêu đề", stillDraft?.title === planDraft.title);

    // --- 2. Người tạo sửa DRAFT (STAFF không có plans.create trong token/DB)
    const newTitle = `[TEST-2A2] Tiêu đề người tạo đã sửa ${stamp}`;
    const creatorUpdate = await call(tokenCreator, planDraft.id, {
      title: `   ${newTitle}   `,
    });
    check("Người tạo sửa tiêu đề DRAFT được", creatorUpdate.status === 200, `status=${creatorUpdate.status}`);
    check("Response trả tiêu đề đã trim", creatorUpdate.json?.data?.title === newTitle);

    const afterCreator = await prisma.plan.findUnique({ where: { id: planDraft.id } });
    check("DB lưu tiêu đề mới", afterCreator?.title === newTitle, afterCreator?.title || "");
    check("Không đổi trạng thái kế hoạch", afterCreator?.status === "DRAFT", afterCreator?.status || "");
    check("Không đổi đơn vị kế hoạch", afterCreator?.unitId === planDraft.unitId);
    check("Không đổi kỳ kế hoạch", afterCreator?.periodId === planDraft.periodId);

    const audit = await prisma.auditEvent.findFirst({
      where: { action: "PLAN_UPDATE", resourceType: "Plan", resourceId: planDraft.id },
      orderBy: { timestamp: "desc" },
    });
    const auditOld = (audit?.oldData || {}) as any;
    const auditNew = (audit?.newData || {}) as any;
    check("Có audit PLAN_UPDATE", !!audit);
    check(
      "Audit lưu old/new tiêu đề",
      auditOld.title === planDraft.title && auditNew.title === newTitle,
      `old=${auditOld.title} new=${auditNew.title}`
    );

    // --- 3. Validate title + field không được đổi
    const missingTitle = await call(tokenCreator, planValidation.id, {});
    check("Thiếu title bị 400", missingTitle.status === 400, `status=${missingTitle.status}`);

    const emptyTitle = await call(tokenCreator, planValidation.id, { title: "   " });
    check("Title rỗng bị 400", emptyTitle.status === 400, `status=${emptyTitle.status}`);

    const longTitle = await call(tokenCreator, planValidation.id, { title: "x".repeat(301) });
    check("Title quá 300 ký tự bị 400", longTitle.status === 400, `status=${longTitle.status}`);

    const nonStringTitle = await call(tokenCreator, planValidation.id, { title: 123 });
    check("Title không phải chuỗi bị 400", nonStringTitle.status === 400, `status=${nonStringTitle.status}`);

    const nullBody = await rawCall(tokenCreator, planValidation.id, "null");
    check("Body null bị 400", nullBody.status === 400, `status=${nullBody.status}`);

    const changeUnit = await call(tokenCreator, planValidation.id, {
      title: "[TEST-2A2] Đổi đơn vị",
      unitId: "00000000-0000-4000-8000-000000000000",
    });
    check("PATCH kèm unitId bị 400", changeUnit.status === 400, `status=${changeUnit.status}`);

    const changeStatus = await call(tokenCreator, planValidation.id, {
      title: "[TEST-2A2] Đổi trạng thái",
      status: "APPROVED",
    });
    check("PATCH kèm status bị 400", changeStatus.status === 400, `status=${changeStatus.status}`);

    const changePeriod = await call(tokenCreator, planValidation.id, {
      title: "[TEST-2A2] Đổi kỳ",
      periodId: period.id,
    });
    check("PATCH kèm periodId bị 400", changePeriod.status === 400, `status=${changePeriod.status}`);

    const afterInvalid = await prisma.plan.findUnique({ where: { id: planValidation.id } });
    check(
      "Các request không hợp lệ không đổi tiêu đề/trạng thái",
      afterInvalid?.title === planValidation.title && afterInvalid?.status === "DRAFT"
    );

    const maxTitlePrefix = "[TEST-2A2] ";
    const maxTitle = `${maxTitlePrefix}${"y".repeat(300 - maxTitlePrefix.length)}`;
    const maxTitleRes = await call(tokenCreator, planValidation.id, { title: maxTitle });
    check("Title đúng 300 ký tự được chấp nhận", maxTitleRes.status === 200, `status=${maxTitleRes.status}`);
    const afterMaxTitle = await prisma.plan.findUnique({ where: { id: planValidation.id } });
    check("DB lưu title đúng 300 ký tự", afterMaxTitle?.title.length === 300);

    const sameTitle = await call(tokenCreator, planValidation.id, {
      title: afterMaxTitle?.title || maxTitle,
    });
    check("Lưu lại đúng tiêu đề cũ trả 200", sameTitle.status === 200, `status=${sameTitle.status}`);

    const missingPlan = await call(
      tokenCreator,
      "00000000-0000-4000-8000-000000000000",
      { title: "Kế hoạch không tồn tại" }
    );
    check("Kế hoạch không tồn tại bị 404", missingPlan.status === 404, `status=${missingPlan.status}`);

    // --- 4. Trạng thái đã khóa → 409
    for (const [label, plan] of [
      ["SUBMITTED", planSubmitted],
      ["APPROVED", planApproved],
      ["IN_EFFECT", planInEffect],
    ] as const) {
      const res = await call(tokenCreator, plan.id, { title: `[TEST-2A2] Sửa ${label}` });
      check(`Người tạo không sửa được kế hoạch ${label}`, res.status === 409, `status=${res.status}`);
      const after = await prisma.plan.findUnique({ where: { id: plan.id } });
      check(`Tiêu đề kế hoạch ${label} giữ nguyên`, after?.title === plan.title);
    }

    const leaderLocked = await call(tokenInScopeLeader, planSubmitted.id, {
      title: "[TEST-2A2] Lãnh đạo sửa kế hoạch chờ duyệt",
    });
    check(
      "Lãnh đạo cũng không sửa được kế hoạch SUBMITTED",
      leaderLocked.status === 409,
      `status=${leaderLocked.status}`
    );

    // --- 5. Lãnh đạo trong phạm vi + người tạo sửa RETURNED
    const leaderTitle = `[TEST-2A2] Lãnh đạo sửa bản trả lại ${stamp}`;
    const leaderUpdate = await call(tokenInScopeLeader, planReturned.id, { title: leaderTitle });
    check(
      "Trưởng bộ phận trong phạm vi sửa được kế hoạch RETURNED",
      leaderUpdate.status === 200,
      `status=${leaderUpdate.status}`
    );
    const afterLeader = await prisma.plan.findUnique({ where: { id: planReturned.id } });
    check("DB lưu tiêu đề lãnh đạo sửa", afterLeader?.title === leaderTitle);

    const creatorReturned = await call(tokenCreator, planReturned.id, {
      title: `[TEST-2A2] Người tạo sửa bản trả lại ${stamp}`,
    });
    check(
      "Người tạo sửa được kế hoạch RETURNED",
      creatorReturned.status === 200,
      `status=${creatorReturned.status}`
    );

    // --- 6. Kỳ đã chốt → 423
    const lockedEdit = await call(tokenCreator, planLockedPeriod.id, {
      title: "[TEST-2A2] Sửa kế hoạch trong kỳ đã chốt",
    });
    check("Sửa kế hoạch trong kỳ đã chốt bị 423", lockedEdit.status === 423, `status=${lockedEdit.status}`);
    const afterLocked = await prisma.plan.findUnique({ where: { id: planLockedPeriod.id } });
    check("Tiêu đề kế hoạch kỳ khóa giữ nguyên", afterLocked?.title === planLockedPeriod.title);
  } finally {
    if (planIds.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { resourceId: { in: planIds } } }).catch(() => {});
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    }
    if (lockedPeriodId) {
      await prisma.reportingPeriod.delete({ where: { id: lockedPeriodId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log(`\n== Kết quả: ${passed} pass / ${failed} fail ==`);
  if (failed > 0) {
    console.log("Failures:\n- " + failures.join("\n- "));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[ERROR]", err);
  process.exitCode = 1;
});

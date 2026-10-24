/**
 * test-ux-phase3c-plan-duplicate-cancel.ts — Phase 3 / Task 3C.
 *
 * Chạy trên database kiểm thử CỤC BỘ (chặn bởi test-db-safety):
 *   npx tsx scripts/test-ux-phase3c-plan-duplicate-cancel.ts
 *
 * Phạm vi:
 *  1. POST tạo plan trùng đơn vị + kỳ + tiêu đề chuẩn hóa → 409 kèm duplicatePlanId,
 *     không tạo bản ghi mới; khác đơn vị/kỳ/tiêu đề vẫn tạo được.
 *  2. DELETE yêu cầu lý do; thiếu/rỗng → 400.
 *  3. Chỉ DRAFT/RETURNED được hủy; APPROVED → 409.
 *  4. Có hạng mục/nhiệm vụ liên kết/đầu việc → 409, không mất dữ liệu liên kết.
 *  5. Quyền: người tạo trong đơn vị hoặc lãnh đạo trong phạm vi; ngoài phạm vi → 403.
 *  6. Hủy mềm đặt status CANCELED, ghi audit PLAN_CANCEL_DUPLICATE kèm lý do.
 *  7. GET mặc định ẩn CANCELED; `status=CANCELED|ALL` lọc được.
 *  8. Kế hoạch đã hủy không còn chặn tạo lại cùng tiêu đề.
 *
 * Script tự tạo fixture và dọn sạch trong finally. Không chạm Production.
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

const dbUrl = assertLocalTestDatabase(
  process.env.DATABASE_URL,
  "test-ux-phase3c-plan-duplicate-cancel"
);

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
  const { GET, POST } = await import("../src/app/api/plans/route");
  const { DELETE } = await import("../src/app/api/plans/[id]/route");
  const { POST: POST_PLAN_ITEM } = await import("../src/app/api/plans/[id]/items/route");

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const now = new Date();
  const stamp = Date.now();
  const planIds: string[] = [];
  const taskIds: string[] = [];
  const workItemIds: string[] = [];
  let tempPeriodId = "";

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

    const leader = mapped.find(
      (a) =>
        a.roleCode === "DEPARTMENT_LEADER" &&
        a.scopeType === "DEPARTMENT" &&
        a.scopeUnitId &&
        a.person
    );
    if (!leader) throw new Error("Fixture thiếu tài khoản DEPARTMENT_LEADER trong đơn vị");
    const unitId = leader.scopeUnitId!;

    const staffSameUnit = mapped.find(
      (a) => a.roleCode === "STAFF" && a.unitId === unitId && a.person
    );
    const outsiderLeader = mapped.find(
      (a) =>
        a.roleCode === "DEPARTMENT_LEADER" &&
        a.scopeUnitId &&
        a.scopeUnitId !== unitId &&
        a.person
    );
    if (!staffSameUnit) throw new Error("Fixture thiếu STAFF cùng đơn vị");
    if (!outsiderLeader) throw new Error("Fixture thiếu lãnh đạo ngoài đơn vị");

    const token = (a: typeof leader) =>
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

    const leaderToken = token(leader);
    const staffToken = token(staffSameUnit);
    const outsiderToken = token(outsiderLeader);

    const unlockedPeriods = await prisma.reportingPeriod.findMany({
      where: { isLocked: false },
      orderBy: { startAt: "desc" },
      take: 2,
    });
    if (unlockedPeriods.length === 0) throw new Error("Fixture thiếu kỳ công tác chưa chốt");

    const period1 = unlockedPeriods[0];
    let period2 = unlockedPeriods[1];
    if (!period2) {
      const created = await prisma.reportingPeriod.create({
        data: {
          type: "WEEK",
          title: `[TEST-3C] Kỳ phụ ${stamp}`,
          startAt: new Date("2027-03-01T00:00:00.000Z"),
          endAt: new Date("2027-03-07T00:00:00.000Z"),
          isLocked: false,
        },
      });
      tempPeriodId = created.id;
      period2 = created;
    }

    const createDirectPlan = async (args: {
      status: string;
      title: string;
      creatorId?: string;
      periodId?: string;
      planUnitId?: string;
    }) => {
      const plan = await prisma.plan.create({
        data: {
          periodId: args.periodId || period1.id,
          unitId: args.planUnitId || unitId,
          creatorId: args.creatorId || leader.person!.id,
          title: args.title,
          status: args.status,
        },
      });
      planIds.push(plan.id);
      return plan;
    };

    const callPost = async (
      tok: string | null,
      payload: Record<string, unknown>
    ) => {
      const req = new NextRequest("http://localhost/api/plans", {
        method: "POST",
        headers: {
          ...(tok ? { authorization: `Bearer ${tok}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const res = await POST(req as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    const callGet = async (tok: string | null, query = "") => {
      const req = new NextRequest(`http://localhost/api/plans${query}`, {
        headers: tok ? { authorization: `Bearer ${tok}` } : {},
      });
      const res = await GET(req as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    const callDelete = async (
      tok: string | null,
      planId: string,
      payload: unknown
    ) => {
      const req = new NextRequest(`http://localhost/api/plans/${planId}`, {
        method: "DELETE",
        headers: {
          ...(tok ? { authorization: `Bearer ${tok}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify(payload ?? {}),
      });
      const res = await DELETE(req as any, {
        params: Promise.resolve({ id: planId }),
      } as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    const callAddItem = async (tok: string, planId: string, title: string) => {
      const req = new NextRequest(`http://localhost/api/plans/${planId}/items`, {
        method: "POST",
        headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const res = await POST_PLAN_ITEM(req as any, {
        params: Promise.resolve({ id: planId }),
      } as any);
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json };
    };

    // ---- 1. Xác thực
    const postNoAuth = await callPost(null, {
      periodId: period1.id,
      unitId,
      title: "[TEST-3C] Không đăng nhập",
    });
    check("POST không token bị 401", postNoAuth.status === 401, `status=${postNoAuth.status}`);

    const getNoAuth = await callGet(null);
    check("GET không token bị 401", getNoAuth.status === 401, `status=${getNoAuth.status}`);

    const deleteNoAuth = await callDelete(null, "00000000-0000-4000-8000-000000000000", {
      reason: "test",
    });
    check("DELETE không token bị 401", deleteNoAuth.status === 401, `status=${deleteNoAuth.status}`);

    // ---- 2. Tạo bản gốc
    const baseTitle = `[TEST-3C] Kế hoạch trùng ${stamp}`;
    const baseCreate = await callPost(leaderToken, {
      periodId: period1.id,
      unitId,
      title: `   ${baseTitle}   `,
    });
    check("Tạo kế hoạch gốc trả 201", baseCreate.status === 201, `status=${baseCreate.status}`);
    const basePlan = baseCreate.json?.data;
    if (basePlan?.id) planIds.push(basePlan.id);
    check("Tiêu đề được trim khi lưu", basePlan?.title === baseTitle);
    check("Kế hoạch mới ở trạng thái DRAFT", basePlan?.status === "DRAFT");

    // ---- 3. Trùng tiêu đề chuẩn hóa
    const countBeforeDuplicate = await prisma.plan.count();
    const duplicate = await callPost(leaderToken, {
      periodId: period1.id,
      unitId,
      title: `[TEST-3C]   Kế hoạch trùng   ${stamp}`,
    });
    check("Tạo trùng (khoảng trắng) bị 409", duplicate.status === 409, `status=${duplicate.status}`);
    check(
      "409 trả duplicatePlanId của bản gốc",
      duplicate.json?.duplicatePlanId === basePlan?.id,
      `duplicatePlanId=${duplicate.json?.duplicatePlanId}`
    );
    check("409 có mã lỗi DUPLICATE_PLAN", duplicate.json?.code === "DUPLICATE_PLAN");
    check("409 có thông báo tiếng Việt", String(duplicate.json?.error || "").includes("trùng"));
    const countAfterDuplicate = await prisma.plan.count();
    check(
      "Tạo trùng không phát sinh bản ghi mới",
      countAfterDuplicate === countBeforeDuplicate,
      `${countBeforeDuplicate} -> ${countAfterDuplicate}`
    );

    const duplicateUpper = await callPost(leaderToken, {
      periodId: period1.id,
      unitId,
      title: `[TEST-3C] KẾ HOẠCH TRÙNG ${stamp}`,
    });
    check(
      "Trùng không phân biệt hoa/thường bị 409",
      duplicateUpper.status === 409,
      `status=${duplicateUpper.status}`
    );

    const differentTitle = await callPost(leaderToken, {
      periodId: period1.id,
      unitId,
      title: `${baseTitle} khác`,
    });
    check("Tiêu đề khác tạo được 201", differentTitle.status === 201, `status=${differentTitle.status}`);
    if (differentTitle.json?.data?.id) planIds.push(differentTitle.json.data.id);

    const differentUnit = await callPost(outsiderToken, {
      periodId: period1.id,
      unitId: outsiderLeader.scopeUnitId!,
      title: baseTitle,
    });
    check(
      "Cùng kỳ + tiêu đề nhưng khác đơn vị tạo được 201",
      differentUnit.status === 201,
      `status=${differentUnit.status}`
    );
    if (differentUnit.json?.data?.id) planIds.push(differentUnit.json.data.id);

    const differentPeriod = await callPost(leaderToken, {
      periodId: period2.id,
      unitId,
      title: baseTitle,
    });
    check(
      "Cùng đơn vị + tiêu đề nhưng khác kỳ tạo được 201",
      differentPeriod.status === 201,
      `status=${differentPeriod.status}`
    );
    if (differentPeriod.json?.data?.id) planIds.push(differentPeriod.json.data.id);

    // ---- 4. GET ẩn CANCELED + lọc trạng thái
    const canceledVisible = await createDirectPlan({
      status: "CANCELED",
      title: `[TEST-3C] Kế hoạch đã hủy ${stamp}`,
    });

    const listDefault = await callGet(leaderToken, `?unitId=${encodeURIComponent(unitId)}`);
    check("GET danh sách mặc định trả 200", listDefault.status === 200, `status=${listDefault.status}`);
    const defaultData: any[] = listDefault.json?.data || [];
    check(
      "GET mặc định ẩn mọi kế hoạch CANCELED",
      defaultData.length > 0 && defaultData.every((p) => p.status !== "CANCELED"),
      `count=${defaultData.length}`
    );
    check(
      "GET mặc định không chứa bản đã hủy",
      !defaultData.some((p) => p.id === canceledVisible.id)
    );

    const listCanceled = await callGet(
      leaderToken,
      `?unitId=${encodeURIComponent(unitId)}&status=CANCELED`
    );
    const canceledData: any[] = listCanceled.json?.data || [];
    check(
      "GET status=CANCELED chỉ trả bản đã hủy",
      canceledData.length > 0 && canceledData.every((p) => p.status === "CANCELED"),
      `count=${canceledData.length}`
    );
    check(
      "GET status=CANCELED thấy bản đã hủy",
      canceledData.some((p) => p.id === canceledVisible.id)
    );

    const listAll = await callGet(
      leaderToken,
      `?unitId=${encodeURIComponent(unitId)}&status=ALL`
    );
    const allData: any[] = listAll.json?.data || [];
    check(
      "GET status=ALL gồm cả CANCELED và DRAFT",
      allData.some((p) => p.id === canceledVisible.id) &&
        allData.some((p) => p.id === basePlan?.id)
    );

    // ---- 5. Phân quyền hủy
    const permissionPlan = await createDirectPlan({
      status: "DRAFT",
      title: `[TEST-3C] Kế hoạch phân quyền ${stamp}`,
    });

    const staffDelete = await callDelete(staffToken, permissionPlan.id, { reason: "Thử quyền" });
    check(
      "STAFF cùng đơn vị không phải người tạo bị 403",
      staffDelete.status === 403,
      `status=${staffDelete.status}`
    );
    const outsiderDelete = await callDelete(outsiderToken, permissionPlan.id, {
      reason: "Thử quyền ngoài phạm vi",
    });
    check(
      "Lãnh đạo ngoài phạm vi bị 403",
      outsiderDelete.status === 403,
      `status=${outsiderDelete.status}`
    );
    const afterForbidden = await prisma.plan.findUnique({ where: { id: permissionPlan.id } });
    check("403 không đổi trạng thái kế hoạch", afterForbidden?.status === "DRAFT");

    const missingPlan = await callDelete(
      leaderToken,
      "00000000-0000-4000-8000-000000000000",
      { reason: "Không tồn tại" }
    );
    check("Kế hoạch không tồn tại bị 404", missingPlan.status === 404, `status=${missingPlan.status}`);

    // ---- 6. Bắt buộc lý do
    const noReason = await callDelete(leaderToken, basePlan.id, {});
    check("Hủy thiếu reason bị 400", noReason.status === 400, `status=${noReason.status}`);
    check(
      "Thông báo thiếu lý do rõ ràng",
      String(noReason.json?.error || "").includes("Lý do")
    );
    const blankReason = await callDelete(leaderToken, basePlan.id, { reason: "   " });
    check("Hủy reason rỗng bị 400", blankReason.status === 400, `status=${blankReason.status}`);
    const stillDraft = await prisma.plan.findUnique({ where: { id: basePlan.id } });
    check("400 không đổi trạng thái kế hoạch", stillDraft?.status === "DRAFT");

    // ---- 7. Trạng thái đã duyệt bị chặn
    const approvedPlan = await createDirectPlan({
      status: "APPROVED",
      title: `[TEST-3C] Kế hoạch đã duyệt ${stamp}`,
    });
    const approvedDelete = await callDelete(leaderToken, approvedPlan.id, {
      reason: "Thử hủy bản đã duyệt",
    });
    check("Hủy kế hoạch APPROVED bị 409", approvedDelete.status === 409, `status=${approvedDelete.status}`);
    const approvedAfter = await prisma.plan.findUnique({ where: { id: approvedPlan.id } });
    check("Kế hoạch APPROVED giữ nguyên trạng thái", approvedAfter?.status === "APPROVED");

    const submittedPlan = await createDirectPlan({
      status: "SUBMITTED",
      title: `[TEST-3C] Kế hoạch chờ duyệt ${stamp}`,
    });
    const submittedDelete = await callDelete(leaderToken, submittedPlan.id, {
      reason: "Thử hủy bản chờ duyệt",
    });
    check("Hủy kế hoạch SUBMITTED bị 409", submittedDelete.status === 409, `status=${submittedDelete.status}`);

    // ---- 8. Có liên kết thì chặn, không làm mất dữ liệu
    const linkedPlan = await createDirectPlan({
      status: "DRAFT",
      title: `[TEST-3C] Kế hoạch có liên kết ${stamp}`,
    });
    const linkedItem = await prisma.planItem.create({
      data: {
        planId: linkedPlan.id,
        title: `[TEST-3C] Hạng mục liên kết ${stamp}`,
        sortOrder: 1,
      },
    });

    const linkedTask = await prisma.task.create({
      data: {
        code: `TEST-3C-${stamp}`,
        title: `[TEST-3C] Nhiệm vụ liên kết ${stamp}`,
        ownerId: leader.person!.id,
        unitId,
        originalDeadline: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        currentDeadline: new Date(now.getTime() + 7 * 24 * 3600 * 1000),
        status: "NOT_STARTED",
      },
    });
    taskIds.push(linkedTask.id);
    await prisma.planTaskLink.create({
      data: { planItemId: linkedItem.id, taskId: linkedTask.id },
    });

    const linkedWorkItem = await prisma.personalWorkItem.create({
      data: {
        personId: leader.person!.id,
        periodId: period1.id,
        planItemId: linkedItem.id,
        title: `[TEST-3C] Đầu việc liên kết ${stamp}`,
      },
    });
    workItemIds.push(linkedWorkItem.id);

    const linkedDelete = await callDelete(leaderToken, linkedPlan.id, {
      reason: "Thử hủy bản còn liên kết",
    });
    check("Hủy kế hoạch còn liên kết bị 409", linkedDelete.status === 409, `status=${linkedDelete.status}`);
    check("409 có mã PLAN_HAS_LINKS", linkedDelete.json?.code === "PLAN_HAS_LINKS");
    check(
      "409 báo rõ số hạng mục/nhiệm vụ/đầu việc",
      linkedDelete.json?.blockers?.itemCount >= 1 &&
        linkedDelete.json?.blockers?.taskLinkCount >= 1 &&
        linkedDelete.json?.blockers?.workItemCount >= 1,
      JSON.stringify(linkedDelete.json?.blockers || {})
    );
    const linkedAfter = await prisma.plan.findUnique({ where: { id: linkedPlan.id } });
    check("Kế hoạch có liên kết vẫn DRAFT", linkedAfter?.status === "DRAFT");
    check(
      "Hạng mục liên kết còn nguyên",
      (await prisma.planItem.count({ where: { planId: linkedPlan.id } })) === 1
    );
    check(
      "Nhiệm vụ liên kết còn nguyên",
      (await prisma.planTaskLink.count({ where: { planItem: { planId: linkedPlan.id } } })) === 1
    );

    // ---- 9. Hủy mềm thành công + audit
    const cancelReason = "Trùng kế hoạch tuần đã lập cho cùng đơn vị";
    const cancelBase = await callDelete(leaderToken, basePlan.id, { reason: cancelReason });
    check("Người tạo/lãnh đạo hủy bản DRAFT trả 200", cancelBase.status === 200, `status=${cancelBase.status}`);
    check("Response trả trạng thái CANCELED", cancelBase.json?.data?.status === "CANCELED");

    const canceledBase = await prisma.plan.findUnique({ where: { id: basePlan.id } });
    check("DB lưu status CANCELED", canceledBase?.status === "CANCELED");
    check("Hủy mềm không xóa bản ghi", !!canceledBase);
    check("Hủy mềm giữ nguyên tiêu đề/đơn vị/kỳ", canceledBase?.title === baseTitle && canceledBase?.unitId === unitId);

    const audit = await prisma.auditEvent.findFirst({
      where: {
        action: "PLAN_CANCEL_DUPLICATE",
        resourceType: "Plan",
        resourceId: basePlan.id,
      },
      orderBy: { timestamp: "desc" },
    });
    check("Có audit PLAN_CANCEL_DUPLICATE", !!audit);
    check("Audit ghi actor là người hủy", audit?.actorId === leader.id);
    const auditOld = (audit?.oldData || {}) as any;
    const auditNew = (audit?.newData || {}) as any;
    check("Audit lưu trạng thái cũ DRAFT", auditOld.status === "DRAFT");
    check(
      "Audit lưu CANCELED + lý do",
      auditNew.status === "CANCELED" && auditNew.reason === cancelReason,
      `status=${auditNew.status} reason=${auditNew.reason}`
    );

    const repeatDelete = await callDelete(leaderToken, basePlan.id, { reason: "Hủy lại" });
    check("Hủy lại kế hoạch đã CANCELED bị 409", repeatDelete.status === 409, `status=${repeatDelete.status}`);

    const addItemToCanceled = await callAddItem(
      leaderToken,
      basePlan.id,
      `[TEST-3C] Hạng mục thêm sau khi hủy ${stamp}`
    );
    check(
      "Kế hoạch đã hủy không thể thêm hạng mục",
      addItemToCanceled.status === 403,
      `status=${addItemToCanceled.status}`
    );
    check(
      "Không phát sinh hạng mục trên kế hoạch đã hủy",
      (await prisma.planItem.count({ where: { planId: basePlan.id } })) === 0
    );

    const baseHidden = await callGet(
      leaderToken,
      `?unitId=${encodeURIComponent(unitId)}&status=DRAFT`
    );
    check(
      "Bản đã hủy không còn trong danh sách DRAFT",
      !(baseHidden.json?.data || []).some((p: any) => p.id === basePlan.id)
    );

    // ---- 10. Đã hủy không chặn tạo lại cùng tiêu đề
    const recreate = await callPost(leaderToken, {
      periodId: period1.id,
      unitId,
      title: baseTitle,
    });
    check(
      "Tạo lại tiêu đề của bản đã hủy trả 201",
      recreate.status === 201,
      `status=${recreate.status}`
    );
    if (recreate.json?.data?.id) planIds.push(recreate.json.data.id);

    // ---- 11. Người tạo (STAFF) được hủy bản nháp của chính mình
    const staffOwnPlan = await createDirectPlan({
      status: "DRAFT",
      creatorId: staffSameUnit.person!.id,
      title: `[TEST-3C] Bản nháp của STAFF ${stamp}`,
    });
    const staffCancel = await callDelete(staffToken, staffOwnPlan.id, {
      reason: "Người tạo dọn bản nháp trùng",
    });
    check(
      "Người tạo trong đơn vị được hủy bản nháp của mình",
      staffCancel.status === 200,
      `status=${staffCancel.status}`
    );
    const staffOwnAfter = await prisma.plan.findUnique({ where: { id: staffOwnPlan.id } });
    check("Bản nháp của STAFF chuyển CANCELED", staffOwnAfter?.status === "CANCELED");
  } finally {
    if (workItemIds.length > 0) {
      await prisma.personalWorkItem.deleteMany({ where: { id: { in: workItemIds } } }).catch(() => {});
    }
    if (taskIds.length > 0) {
      await prisma.task.deleteMany({ where: { id: { in: taskIds } } }).catch(() => {});
    }
    if (planIds.length > 0) {
      await prisma.auditEvent.deleteMany({ where: { resourceId: { in: planIds } } }).catch(() => {});
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } }).catch(() => {});
    }
    if (tempPeriodId) {
      await prisma.reportingPeriod.delete({ where: { id: tempPeriodId } }).catch(() => {});
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

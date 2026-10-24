/**
 * test-ux-phase3c-plan-cancel-ui.ts — kiểm tra tĩnh Task 3C (không cần DB/server).
 *
 * Chạy: npx tsx scripts/test-ux-phase3c-plan-cancel-ui.ts
 *
 * Bao phủ:
 *  - API POST có kiểm tra trùng + trả duplicatePlanId (409), GET ẩn CANCELED mặc định.
 *  - API DELETE là hủy mềm, bắt buộc reason, chặn trạng thái khóa/liên kết, audit.
 *  - UI có nút hủy cho DRAFT/RETURNED không hạng mục, modal lý do, hiện lỗi.
 *  - Không hard-delete/cascade kế hoạch.
 */
import fs from "fs";
import path from "path";

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

function read(file: string) {
  return fs.readFileSync(path.join(process.cwd(), file), "utf-8");
}

async function main() {
  const { normalizeTitle } = await import("../src/server/idempotency");
  const {
    PLAN_CANCELABLE_STATUSES,
    PLAN_CONTENT_LOCKED,
    planCancelStatusMessage,
    planContentLockKey,
    planContentLockMessage,
  } = await import("../src/server/planning");

  // ---- Pure rules
  check(
    "Chỉ DRAFT/RETURNED được hủy mềm",
    [...PLAN_CANCELABLE_STATUSES].join(",") === "DRAFT,RETURNED",
    [...PLAN_CANCELABLE_STATUSES].join(",")
  );
  check("planCancelStatusMessage cho DRAFT = null", planCancelStatusMessage({ status: "DRAFT", title: "A" }) === null);
  check(
    "planCancelStatusMessage cho RETURNED = null",
    planCancelStatusMessage({ status: "RETURNED", title: "A" }) === null
  );
  check(
    "planCancelStatusMessage chặn APPROVED",
    !!planCancelStatusMessage({ status: "APPROVED", title: "A" })
  );
  check(
    "planCancelStatusMessage chặn SUBMITTED",
    !!planCancelStatusMessage({ status: "SUBMITTED", title: "A" })
  );
  check(
    "planCancelStatusMessage chặn CANCELED",
    !!planCancelStatusMessage({ status: "CANCELED", title: "A" })
  );
  check(
    "CANCELED là trạng thái cuối, khóa nội dung",
    !!planContentLockMessage({ status: "CANCELED", title: "A" })
  );
  check(
    "PLAN_CONTENT_LOCKED gồm CANCELED",
    (PLAN_CONTENT_LOCKED as readonly string[]).includes("CANCELED")
  );
  check(
    "planContentLockKey ổn định theo planId",
    planContentLockKey("abc") === "plan-content:abc"
  );
  check(
    "normalizeTitle gộp khoảng trắng/hoa thường",
    normalizeTitle("  Kế   HOẠCH Tuần 43 ") === normalizeTitle("kế hoạch tuần 43")
  );

  // ---- API create/list
  const listRoute = read("src/app/api/plans/route.ts");
  check("POST dùng findDuplicatePlan", listRoute.includes("findDuplicatePlan("));
  check("POST khóa chống race theo đơn vị+kỳ+tiêu đề", listRoute.includes("plan-create:${targetUnitId}:${periodId}"));
  check("409 trả duplicatePlanId", listRoute.includes("duplicatePlanId: duplicate.id"));
  check("409 có mã DUPLICATE_PLAN", listRoute.includes('code: "DUPLICATE_PLAN"'));
  check("Trùng không tự tạo bản ghi", listRoute.includes("if (duplicate) throw new DuplicatePlanError(duplicate)"));
  check(
    "GET mặc định loại CANCELED",
    listRoute.includes('where.status = { not: PLAN_CANCELED_STATUS }')
  );
  check(
    "GET hỗ trợ status=ALL",
    listRoute.includes('status !== "ALL"')
  );
  check(
    "GET lọc status cụ thể",
    listRoute.includes('if (status && status !== "ALL")')
  );

  // ---- API soft cancel
  const detailRoute = read("src/app/api/plans/[id]/route.ts");
  check("Có handler DELETE", detailRoute.includes("export async function DELETE("));
  check("DELETE kiểm tra quyền canCancelPlan", detailRoute.includes("canCancelPlan(user, plan)"));
  check("DELETE bắt buộc reason", detailRoute.includes("!body.reason.trim()"));
  check("DELETE chỉ nhận DRAFT/RETURNED", detailRoute.includes("PLAN_CANCELABLE_STATUSES"));
  check("DELETE set CANCELED (không hard delete)", detailRoute.includes("status: PLAN_CANCELED_STATUS"));
  check("DELETE chặn liên kết với 409", detailRoute.includes("PLAN_HAS_LINKS"));
  check("DELETE đếm hạng mục/nhiệm vụ/đầu việc", detailRoute.includes("taskLinkCount") && detailRoute.includes("workItemCount"));
  check("DELETE ghi audit PLAN_CANCEL_DUPLICATE", detailRoute.includes('action: "PLAN_CANCEL_DUPLICATE"'));
  check("DELETE lưu lý do vào audit", detailRoute.includes("newData: { status: PLAN_CANCELED_STATUS, reason }"));
  check(
    "DELETE khóa nội dung dùng chung",
    detailRoute.includes("advisoryLock(tx, planContentLockKey(planId))")
  );
  check(
    "DELETE đếm liên kết trong transaction sau khóa",
    /const cancelResult = await prisma\.\$transaction/.test(detailRoute) &&
      detailRoute.indexOf("advisoryLock(tx, planContentLockKey(planId))") <
        detailRoute.indexOf("tx.planItem.count({ where: { planId } })")
  );
  check(
    "DELETE chặn kỳ đã chốt bằng assertPeriodWritable",
    detailRoute.includes("await assertPeriodWritable(plan.periodId)")
  );
  check(
    "DELETE không gọi plan.delete",
    !/prisma\.plan\.delete(?!Many)/.test(detailRoute) && !detailRoute.includes("plan.deleteMany")
  );

  // ---- Khóa nội dung dùng chung cho item create + LINK_TASK
  const itemsRoute = read("src/app/api/plans/[id]/items/route.ts");
  check(
    "Item create dùng chung khóa plan-content",
    itemsRoute.includes("advisoryLock(tx, planContentLockKey(planId))")
  );
  check(
    "Item create đọc lại trạng thái trong transaction",
    itemsRoute.includes("planContentLockMessage(fresh)") &&
      itemsRoute.includes("const createResult = await prisma.$transaction")
  );

  const workflowRoute = read("src/app/api/plans/[id]/workflow/route.ts");
  check(
    "LINK_TASK dùng chung khóa plan-content",
    workflowRoute.includes("advisoryLock(tx, planContentLockKey(planId))")
  );
  check(
    "LINK_TASK chặn kế hoạch CANCELED trong transaction",
    workflowRoute.includes("planContentLockMessage(freshPlan)") &&
      workflowRoute.includes('return { kind: "locked" as const, message: freshLock }')
  );

  // ---- UI
  const page = read("src/app/plans/page.tsx");
  check("UI tính canCancelActivePlan", page.includes("canCancelActivePlan"));
  check(
    "UI chỉ cho kế hoạch DRAFT/RETURNED không hạng mục",
    page.includes("(activePlan.items?.length || 0) === 0") && page.includes("planContentEditable")
  );
  check(
    "UI đồng bộ quyền người tạo với API",
    page.includes("isActivePlanCreator || (isLeaderRole && !!planOptions?.canCreatePlan)")
  );
  check("UI có nút hủy desktop", page.includes('data-testid="cancel-plan-btn"'));
  check("UI có nút hủy mobile", page.includes('data-testid="cancel-plan-btn-mobile"'));
  check("UI mở modal nhập lý do", page.includes("openPlanCancelModal") && page.includes('data-testid="plan-cancel-reason"'));
  check("UI gọi DELETE kèm reason", page.includes("method: \"DELETE\"") && page.includes("JSON.stringify({ reason })"));
  check("UI có vùng hiển thị lỗi hủy", page.includes('data-testid="plan-cancel-error"'));
  check("UI bắt lỗi 409 và hiển thị message", page.includes("json.error || \"Không thể hủy kế hoạch\""));
  check("UI hiển thị duplicatePlanId khi tạo trùng", page.includes("json.duplicatePlanId"));
  check("UI có vùng lỗi tạo kế hoạch", page.includes('data-testid="plan-form-error"'));
  check("UI nhắc hủy mềm không xóa cứng", page.includes("CANCELED") && page.includes("không xóa cứng"));

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

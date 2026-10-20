/**
 * test-yc37-approval-flow.ts — Kiểm thử đầy đủ vòng đời hồ sơ YC-37.
 *
 * Chạy trên DB LOCAL (có fixture), tự dọn sạch dữ liệu test:
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc33_local"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/test-yc37-approval-flow.ts
 *
 * Luồng kiểm thử:
 *   1. Lãnh đạo xem trước → có quyền quyết định, hồ sơ CHƯA đổi trạng thái.
 *   2. "Yêu cầu giải trình" thiếu nội dung → từ chối.
 *   3. "Yêu cầu giải trình" hợp lệ → nhiệm vụ về IN_PROGRESS, hồ sơ CLARIFY_REQUESTED.
 *   4. Người trình xem được hồ sơ của mình + có quyền phản hồi.
 *   5. Phản hồi giải trình → hồ sơ mở lại vòng 2, nhiệm vụ về WAITING_REVIEW, KHÔNG tạo hồ sơ mới.
 *   6. "Đồng ý" → nhiệm vụ COMPLETED, hồ sơ AGREED.
 *   7. Bấm lại "Đồng ý" → 409 (chống bấm lặp).
 *   8. Lịch sử quyết định đầy đủ + audit.
 *   9. Dọn sạch dữ liệu test.
 */
import { PrismaClient } from "@prisma/client";
import {
  buildApprovalPreview,
  decideApproval,
  respondToApproval,
} from "../src/server/approval-case";

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

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (!/127\.0\.0\.1|localhost/.test(url)) {
    console.error("CHỈ chạy test này trên DB LOCAL (hiện tại: " + url + ")");
    process.exit(2);
  }

  // Lấy tài khoản lãnh đạo + cán bộ
  const leaderAcc = await prisma.account.findFirst({
    where: { person: { assignments: { some: { unit: { code: "BAN_LANH_DAO" } } } } },
    orderBy: { createdAt: "asc" },
    include: { person: { include: { assignments: true } } },
  });
  const staffAcc = await prisma.account.findFirst({
    where: { person: { code: { not: "CB-001" } } },
    orderBy: { createdAt: "asc" },
    include: { person: { include: { assignments: true } } },
  });
  if (!leaderAcc || !staffAcc) throw new Error("thieu tai khoan de test");

  const leaderUser: any = {
    id: leaderAcc.id,
    role: "UNIT_LEADER",
    personId: leaderAcc.personId,
    permissions: [],
    scopeType: "ORGANIZATION",
    scopeUnitId: null,
    unitId: leaderAcc.person.assignments[0]?.unitId ?? null,
    fullName: leaderAcc.person.fullName,
    username: leaderAcc.username,
  };
  const staffUser: any = {
    id: staffAcc.id,
    role: "STAFF",
    personId: staffAcc.personId,
    permissions: [],
    scopeType: "DEPARTMENT",
    scopeUnitId: staffAcc.person.assignments[0]?.unitId ?? null,
    unitId: staffAcc.person.assignments[0]?.unitId ?? null,
    fullName: staffAcc.person.fullName,
    username: staffAcc.username,
  };

  // Fixture: nhiệm vụ chờ nghiệm thu do cán bộ sở hữu
  const staffUnit = staffAcc.person.assignments[0];
  if (!staffUnit) throw new Error("can bo khong co bo phan");
  const plan = await prisma.plan.findFirst({
    where: { status: "IN_EFFECT" },
    include: { items: { take: 1 } },
  });
  const task = await prisma.task.create({
    data: {
      code: `YC37-TEST-${Date.now().toString(36).toUpperCase()}`,
      title: "[YC-37 TEST] Nhiệm vụ chờ nghiệm thu",
      description: "Nhiệm vụ kiểm thử tự động YC-37",
      ownerId: staffAcc.personId,
      unitId: staffUnit.unitId,
      priority: "Trung bình",
      status: "WAITING_REVIEW",
      originalDeadline: new Date(Date.now() - 3 * 86400000),
      currentDeadline: new Date(Date.now() - 3 * 86400000),
      expectedResultText: "Kết quả yêu cầu của nhiệm vụ kiểm thử",
      actualResultText: "Kết quả đã ghi của cán bộ",
    },
  });
  console.log(`Fixture: task ${task.code}\n`);

  try {
    // 1) Xem trước
    const pv = await buildApprovalPreview(leaderUser, "TASK_RESULT", task.id);
    check("Lãnh đạo xem trước hồ sơ được", pv.ok, pv.ok ? "" : pv.error);
    if (!pv.ok) throw new Error("preview failed");
    check("Preview có quyền quyết định", pv.preview.permissions.canDecide === true);
    check("Preview có người trình + hạn + kết quả", !!pv.preview.submitter?.fullName && !!pv.preview.deadline.current && !!pv.preview.result.actual);
    check("Hồ sơ chưa có quyết định nào", pv.preview.history.length === 0, `caseStatus=${pv.preview.caseStatus}`);

    const statusAfterPreview = await prisma.task.findUnique({ where: { id: task.id } });
    check(
      "Xem trước KHÔNG đổi trạng thái nhiệm vụ",
      statusAfterPreview?.status === "WAITING_REVIEW",
      String(statusAfterPreview?.status)
    );

    // 2) Yêu cầu giải trình thiếu nội dung
    const bad = await decideApproval({
      user: leaderUser,
      caseType: "TASK_RESULT",
      resourceId: task.id,
      action: "CLARIFY",
    });
    check("Yêu cầu giải trình thiếu nội dung bị từ chối", bad.success === false && bad.status === 400);

    // 3) Yêu cầu giải trình hợp lệ
    const cl = await decideApproval({
      user: leaderUser,
      caseType: "TASK_RESULT",
      resourceId: task.id,
      action: "CLARIFY",
      content: "Bổ sung minh chứng và làm rõ kết quả đạt được.",
    });
    check("Yêu cầu giải trình thành công", cl.success === true, cl.error || cl.message);
    const taskAfterCl = await prisma.task.findUnique({ where: { id: task.id } });
    check(
      "Nhiệm vụ chuyển về IN_PROGRESS",
      taskAfterCl?.status === "IN_PROGRESS",
      String(taskAfterCl?.status)
    );
    check(
      "Kết quả đã ghi của cán bộ KHÔNG bị ghi đè",
      taskAfterCl?.actualResultText === "Kết quả đã ghi của cán bộ",
      String(taskAfterCl?.actualResultText)
    );
    const caseAfterCl = await prisma.approvalCase.findUnique({
      where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: task.id } },
      include: { decisions: true },
    });
    check("Hồ sơ CLARIFY_REQUESTED", caseAfterCl?.status === "CLARIFY_REQUESTED", String(caseAfterCl?.status));
    check("Lịch sử có 1 quyết định", (caseAfterCl?.decisions.length || 0) === 1);

    // 4) Người trình xem hồ sơ của mình
    const pvStaff = await buildApprovalPreview(staffUser, "TASK_RESULT", task.id);
    check("Người trình xem được hồ sơ của mình", pvStaff.ok);
    if (pvStaff.ok) {
      check("Người trình được phản hồi giải trình", pvStaff.preview.permissions.canRespond === true);
      check("Người trình KHÔNG có quyền quyết định", pvStaff.preview.permissions.canDecide === false);
    }

    // 5) Phản hồi giải trình
    const rs = await respondToApproval(
      staffUser,
      "TASK_RESULT",
      task.id,
      "Đã bổ sung minh chứng và giải trình đầy đủ."
    );
    check("Gửi giải trình thành công", rs.success === true, rs.error || rs.message);
    const taskAfterRs = await prisma.task.findUnique({ where: { id: task.id } });
    check("Nhiệm vụ quay lại hàng đợi nghiệm thu", taskAfterRs?.status === "WAITING_REVIEW", String(taskAfterRs?.status));
    const caseAfterRs = await prisma.approvalCase.findUnique({
      where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: task.id } },
      include: { decisions: true },
    });
    check("Hồ sơ mở lại (OPEN)", caseAfterRs?.status === "OPEN", String(caseAfterRs?.status));
    check("Số vòng tăng lên 2", caseAfterRs?.currentRound === 2, String(caseAfterRs?.currentRound));
    check("Lịch sử có 2 mục (yêu cầu + phản hồi)", (caseAfterRs?.decisions.length || 0) === 2);
    const caseCount = await prisma.approvalCase.count({
      where: { caseType: "TASK_RESULT", resourceId: task.id },
    });
    check("KHÔNG tạo hồ sơ trùng", caseCount === 1, `${caseCount} hồ sơ`);

    // 6) Đồng ý
    const ag = await decideApproval({
      user: leaderUser,
      caseType: "TASK_RESULT",
      resourceId: task.id,
      action: "AGREE",
    });
    check("Chấp thuận thành công", ag.success === true, ag.error || ag.message);
    const taskAfterAg = await prisma.task.findUnique({ where: { id: task.id } });
    check("Nhiệm vụ COMPLETED", taskAfterAg?.status === "COMPLETED", String(taskAfterAg?.status));
    const caseAfterAg = await prisma.approvalCase.findUnique({
      where: { caseType_resourceId: { caseType: "TASK_RESULT", resourceId: task.id } },
    });
    check("Hồ sơ AGREED", caseAfterAg?.status === "AGREED", String(caseAfterAg?.status));

    // 7) Bấm lại
    const again = await decideApproval({
      user: leaderUser,
      caseType: "TASK_RESULT",
      resourceId: task.id,
      action: "AGREE",
    });
    check("Bấm lại bị chặn (409)", again.success === false && again.status === 409, `HTTP ${again.status}`);

    // 8) Audit
    const audits = await prisma.auditEvent.findMany({
      where: { resourceId: { in: [caseAfterAg?.id ?? "", task.id] } },
    });
    const actions = new Set(audits.map((a) => a.action));
    check(
      "Audit ghi đủ các quyết định",
      actions.has("APPROVAL_CLARIFY") && actions.has("APPROVAL_AGREE") && actions.has("APPROVAL_RESPOND"),
      [...actions].join(", ")
    );
  } finally {
    // 9) Dọn sạch dữ liệu test
    await prisma.approvalCase.deleteMany({
      where: { caseType: "TASK_RESULT", resourceId: task.id },
    });
    await prisma.task.delete({ where: { id: task.id } }).catch(() => undefined);
    console.log("\nĐã dọn sạch dữ liệu test.");
  }

  console.log("\n========================================");
  console.log(`KẾT QUẢ LUỒNG YC-37: ${passed} pass / ${failed} fail`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main()
  .catch(async (e) => {
    console.error("LỖI:", e);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

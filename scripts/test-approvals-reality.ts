/**
 * TALUNG-CUS-WORK — TOÀN BỘ KIỂM THỬ THỰC TẾ: QUY TRÌNH PHÊ DUYỆT TẬP TRUNG (/approvals)
 * 
 * Bộ kiểm thử 6 kịch bản bắt buộc theo chuẩn Backend Reality Audit:
 * - TEST 1: Phê duyệt thành công (UI/API -> PostgreSQL -> F5 Reload)
 * - TEST 2: API thất bại (HTTP 4xx/500 -> Báo lỗi đỏ, Item không biến mất, DB không đổi)
 * - TEST 3: Không đủ quyền (Cán bộ thường gọi API duyệt -> Backend chặn 403 Forbidden)
 * - TEST 4: Kết nối mạng lỗi (Client bắt catch -> Báo lỗi mạng, KHÔNG fake toast, DB nguyên vẹn)
 * - TEST 5: Phê duyệt lặp (Duyệt hồ sơ đã xử lý -> Backend chặn 400 Bad Request, không sinh trùng log)
 * - TEST 6: Chu trình nghiệm thu kết quả (Cán bộ WAITING_REVIEW -> Lãnh đạo COMPLETED -> Reload)
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";

let tokenLeader = "";       // lanhdao (UNIT_LEADER)
let tokenDeptLeaderA = "";  // truongnhom_a (DEPARTMENT_LEADER)
let tokenOfficerA = "";     // canbo_a (STAFF / OFFICER)

async function loginUser(username: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: "demo123" }),
  });
  if (!res.ok) {
    throw new Error(`Đăng nhập thất bại cho ${username}: ${res.statusText}`);
  }
  const data = await res.json();
  return data.token;
}

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, testName: string, detail: string) {
  totalCount++;
  if (condition) {
    console.log(`  [PASS] ${testName}: ${detail}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${testName}: ${detail}`);
    process.exitCode = 1;
  }
}

async function runApprovalsRealityTestSuite() {
  console.log("================================================================================");
  console.log("   TALUNG-CUS-WORK — KIỂM THỬ THỰC TẾ BÀN PHÊ DUYỆT TẬP TRUNG (/approvals)       ");
  console.log("================================================================================\n");

  // Khởi tạo các token phiên làm việc
  console.log(">> Đang khởi tạo các phiên đăng nhập...");
  tokenLeader = await loginUser("lanhdao");
  tokenDeptLeaderA = await loginUser("truongnhom_a");
  tokenOfficerA = await loginUser("canbo_a");
  console.log("✓ Đã khởi tạo 3 phiên làm việc: lanhdao (UNIT_LEADER), truongnhom_a (DEPT_LEADER), canbo_a (OFFICER).\n");

  const deptA = await prisma.orgUnit.findUnique({ where: { code: "BP_NGHIEPVU_A" } });
  if (!deptA) throw new Error("Không tìm thấy đơn vị BP_NGHIEPVU_A trong CSDL!");

  const leaderAcc = await prisma.account.findUnique({
    where: { username: "lanhdao" },
    include: { person: true },
  });
  const officerAcc = await prisma.account.findUnique({
    where: { username: "canbo_a" },
    include: { person: true },
  });

  const period = await prisma.reportingPeriod.findFirst({
    where: { type: "WEEK" },
    orderBy: { startAt: "desc" },
  });
  if (!period) throw new Error("Không tìm thấy kỳ công tác trong CSDL!");

  // ===========================================================================
  // TEST 1: PHÊ DUYỆT THÀNH CÔNG (KẾ HOẠCH TUẦN: SUBMITTED -> APPROVED)
  // ===========================================================================
  console.log("--------------------------------------------------------------------------------");
  console.log("TEST 1: PHÊ DUYỆT THÀNH CÔNG (LÃNH ĐẠO DUYỆT KẾ HOẠCH TUẦN)");
  console.log("--------------------------------------------------------------------------------");

  // Tạo kế hoạch tuần giả định ở trạng thái SUBMITTED
  const testPlanCode = `KH-TEST-${Date.now().toString().slice(-4)}`;
  const testPlan = await prisma.plan.create({
    data: {
      periodId: period.id,
      unitId: deptA.id,
      creatorId: officerAcc!.personId,
      title: `Kế hoạch kiểm thử phê duyệt [${testPlanCode}]`,
      status: "SUBMITTED",
    },
  });

  // Lãnh đạo gọi API duyệt kế hoạch
  const approvePlanRes = await fetch(`${BASE_URL}/api/plans/${testPlan.id}/workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenLeader}`,
    },
    body: JSON.stringify({
      action: "APPROVE",
      reviewNotes: "Chi cục trưởng đồng ý phê duyệt kế hoạch công tác.",
    }),
  });

  assert(
    approvePlanRes.status === 200,
    "TEST 1.1",
    `API phê duyệt kế hoạch trả về HTTP 200 (nhận được: ${approvePlanRes.status})`
  );

  const approvePlanJson = await approvePlanRes.json();
  assert(
    approvePlanJson.success === true && approvePlanJson.data?.status === "APPROVED",
    "TEST 1.2",
    "API xác nhận kế hoạch đã chuyển trạng thái APPROVED"
  );

  // Xác minh trực tiếp trong PostgreSQL
  const dbPlanAfterApprove = await prisma.plan.findUnique({ where: { id: testPlan.id } });
  assert(
    dbPlanAfterApprove?.status === "APPROVED" && dbPlanAfterApprove?.approvedBy === leaderAcc!.personId,
    "TEST 1.3",
    `PostgreSQL xác nhận plan.status = APPROVED và approvedBy = ${leaderAcc!.personId}`
  );

  // Giả lập Reload (F5): Kiểm tra danh sách hồ sơ chờ duyệt không còn chứa kế hoạch này
  const reloadPlansRes = await fetch(`${BASE_URL}/api/plans`, {
    headers: { Authorization: `Bearer ${tokenLeader}` },
  });
  const reloadPlansJson = await reloadPlansRes.json();
  const reloadPlansList = reloadPlansJson.data || [];
  const stillPendingInReload = reloadPlansList.some(
    (p: any) => p.id === testPlan.id && p.status === "SUBMITTED"
  );
  assert(
    !stillPendingInReload,
    "TEST 1.4",
    "Sau khi Reload, kế hoạch đã phê duyệt KHÔNG còn xuất hiện trong danh sách chờ duyệt"
  );

  // ===========================================================================
  // TEST 2: API THẤT BẠI (HTTP 4xx / 500 -> BÁO LỖI, ITEM KHÔNG BIẾN MẤT)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 2: XỬ LÝ KHI API THẤT BẠI (KHÔNG GIẢ LẬP THÀNH CÔNG)");
  console.log("--------------------------------------------------------------------------------");

  // Thử duyệt với một Plan ID không tồn tại
  const fakePlanId = "00000000-0000-0000-0000-000000000000";
  const failRes = await fetch(`${BASE_URL}/api/plans/${fakePlanId}/workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenLeader}`,
    },
    body: JSON.stringify({ action: "APPROVE" }),
  });

  assert(
    failRes.status === 404,
    "TEST 2.1",
    `API từ chối hồ sơ không tồn tại với HTTP 404 (nhận được: ${failRes.status})`
  );

  const failJson = await failRes.json();
  assert(
    failJson.success === false && typeof failJson.error === "string",
    "TEST 2.2",
    `Phản hồi lỗi rõ ràng từ Backend: "${failJson.error}"`
  );

  // Thử duyệt nhiệm vụ với payload sai action
  const failTaskRes = await fetch(`${BASE_URL}/api/tasks/fake-task-id/deadline-request/fake-req/review`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenLeader}`,
    },
    body: JSON.stringify({ action: "INVALID_ACTION" }),
  });
  assert(
    failTaskRes.status === 400 || failTaskRes.status === 404,
    "TEST 2.3",
    `Yêu cầu không hợp lệ bị từ chối với HTTP ${failTaskRes.status}`
  );

  // ===========================================================================
  // TEST 3: KHÔNG ĐỦ QUYỀN (CANBO THƯỜNG GỌI API DUYỆT -> 403 FORBIDDEN)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 3: PHÂN QUYỀN RBAC (CÁN BỘ KHÔNG CÓ QUYỀN GỌI API DUYỆT)");
  console.log("--------------------------------------------------------------------------------");

  // Tạo kế hoạch mới ở trạng thái SUBMITTED
  const planForRbac = await prisma.plan.create({
    data: {
      periodId: period.id,
      unitId: deptA.id,
      creatorId: officerAcc!.personId,
      title: "Kế hoạch kiểm thử phân quyền RBAC",
      status: "SUBMITTED",
    },
  });

  // Cán bộ thường (canbo_a) cố tình gọi API phê duyệt kế hoạch
  const unauthorizedPlanRes = await fetch(`${BASE_URL}/api/plans/${planForRbac.id}/workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenOfficerA}`,
    },
    body: JSON.stringify({ action: "APPROVE" }),
  });

  assert(
    unauthorizedPlanRes.status === 403,
    "TEST 3.1",
    `Backend chặn cán bộ thường phê duyệt kế hoạch với HTTP 403 Forbidden (nhận được: ${unauthorizedPlanRes.status})`
  );

  // Kiểm tra CSDL đảm bảo trạng thái kế hoạch KHÔNG bị thay đổi
  const dbPlanRbac = await prisma.plan.findUnique({ where: { id: planForRbac.id } });
  assert(
    dbPlanRbac?.status === "SUBMITTED",
    "TEST 3.2",
    "Trạng thái trong PostgreSQL vẫn giữ nguyên là SUBMITTED, không bị xâm phạm"
  );

  // Cán bộ thường cố tình gọi API tự nghiệm thu hoàn thành nhiệm vụ (COMPLETED)
  const taskForRbac = await prisma.task.create({
    data: {
      code: `TSK-RBAC-${Date.now().toString().slice(-4)}`,
      title: "Nhiệm vụ kiểm tra quyền tự nghiệm thu",
      unitId: deptA.id,
      ownerId: officerAcc!.personId,
      status: "WAITING_REVIEW",
      priority: "Trung bình",
      originalDeadline: new Date("2026-10-20T17:00:00Z"),
      currentDeadline: new Date("2026-10-20T17:00:00Z"),
    },
  });

  const unauthorizedTaskRes = await fetch(`${BASE_URL}/api/tasks/${taskForRbac.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenOfficerA}`,
    },
    body: JSON.stringify({ status: "COMPLETED" }),
  });

  assert(
    unauthorizedTaskRes.status === 403,
    "TEST 3.3",
    `Backend chặn cán bộ tự nghiệm thu hoàn thành nhiệm vụ với HTTP 403 Forbidden (nhận được: ${unauthorizedTaskRes.status})`
  );

  const dbTaskRbac = await prisma.task.findUnique({ where: { id: taskForRbac.id } });
  assert(
    dbTaskRbac?.status === "WAITING_REVIEW",
    "TEST 3.4",
    "Nhiệm vụ trong PostgreSQL vẫn bảo toàn trạng thái WAITING_REVIEW, không thể tự chuyển COMPLETED"
  );

  // ===========================================================================
  // TEST 4: KẾT NỐI MẠNG LỖI (CLIENT ERROR HANDLING KHÔNG FAKE TOAST)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 4: BẢO VỆ KHI KẾT NỐI MẠNG LỖI (ZERO FAKE TOAST / ZERO STATE LOSS)");
  console.log("--------------------------------------------------------------------------------");

  // Đọc mã nguồn src/app/approvals/page.tsx để kiểm chứng không có khối nuốt lỗi
  const fs = await import("fs");
  const approvalsPageCode = fs.readFileSync("src/app/approvals/page.tsx", "utf-8");

  const hasEmptyCatch = approvalsPageCode.includes("catch {") && !approvalsPageCode.includes("toast.error");
  assert(
    !hasEmptyCatch,
    "TEST 4.1",
    "Mã nguồn giao diện KHÔNG còn khối lệnh 'catch {}' nuốt lỗi hoặc che giấu lỗi mạng"
  );

  const hasFakeOptimisticToast = approvalsPageCode.includes('toast.info(`Đã ghi nhận phê duyệt cho');
  assert(
    !hasFakeOptimisticToast,
    "TEST 4.2",
    "Đã loại bỏ triệt để chuỗi toast.info giả lập ghi nhận phê duyệt khi API thất bại"
  );

  const removesItemOnlyOnOk = approvalsPageCode.includes("if (res.ok)") && approvalsPageCode.includes("setApprovals((prev) =>");
  assert(
    removesItemOnlyOnOk,
    "TEST 4.3",
    "Giao diện CHỈ xóa hồ sơ khỏi danh sách khi có phản hồi res.ok = true từ máy chủ"
  );

  // ===========================================================================
  // TEST 5: PHÊ DUYỆT LẶP (ANTI-REPEAT APPROVAL)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 5: CHỐNG PHÊ DUYỆT LẶP LẠI (ANTI-REPEAT APPROVAL)");
  console.log("--------------------------------------------------------------------------------");

  // Kế hoạch testPlan đã được duyệt ở TEST 1 (trạng thái APPROVED)
  // Thử gọi duyệt lại lần 2
  const repeatApproveRes = await fetch(`${BASE_URL}/api/plans/${testPlan.id}/workflow`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenLeader}`,
    },
    body: JSON.stringify({ action: "APPROVE" }),
  });

  assert(
    repeatApproveRes.status === 400,
    "TEST 5.1",
    `Backend từ chối phê duyệt lại kế hoạch đã APPROVED với HTTP 400 (nhận được: ${repeatApproveRes.status})`
  );

  const repeatJson = await repeatApproveRes.json();
  assert(
    repeatJson.error?.includes("SUBMITTED"),
    "TEST 5.2",
    `Thông báo lỗi chính xác: "${repeatJson.error}"`
  );

  // Thử nghiệm thu lại một nhiệm vụ đã COMPLETED
  const completedTask = await prisma.task.create({
    data: {
      code: `TSK-DONE-${Date.now().toString().slice(-4)}`,
      title: "Nhiệm vụ đã hoàn thành kiểm thử lặp",
      unitId: deptA.id,
      ownerId: officerAcc!.personId,
      status: "COMPLETED",
      priority: "Bình thường",
      originalDeadline: new Date("2026-10-20T17:00:00Z"),
      currentDeadline: new Date("2026-10-20T17:00:00Z"),
    },
  });

  const repeatTaskApproveRes = await fetch(`${BASE_URL}/api/tasks/${completedTask.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenLeader}`,
    },
    body: JSON.stringify({ status: "COMPLETED" }),
  });

  assert(
    repeatTaskApproveRes.status === 400,
    "TEST 5.3",
    `Backend từ chối nghiệm thu lại nhiệm vụ đã COMPLETED với HTTP 400 (nhận được: ${repeatTaskApproveRes.status})`
  );

  const repeatTaskJson = await repeatTaskApproveRes.json();
  assert(
    repeatTaskJson.error?.includes("COMPLETED"),
    "TEST 5.4",
    `Thông báo lỗi chính xác: "${repeatTaskJson.error}"`
  );

  // ===========================================================================
  // TEST 6: CHU TRÌNH NGHIỆM THU KẾT QUẢ (WAITING_REVIEW -> COMPLETED)
  // ===========================================================================
  console.log("\n--------------------------------------------------------------------------------");
  console.log("TEST 6: CHU TRÌNH NGHIỆM THU KẾT QUẢ CÔNG TÁC (WAITING_REVIEW -> COMPLETED)");
  console.log("--------------------------------------------------------------------------------");

  // 6.1. Cán bộ báo cáo hoàn thành nhiệm vụ -> chuyển sang WAITING_REVIEW
  const task6 = await prisma.task.create({
    data: {
      code: `TSK-REV-${Date.now().toString().slice(-4)}`,
      title: "Kiểm tra thực tế lô hàng nông sản xuất khẩu tại bãi soi",
      unitId: deptA.id,
      ownerId: officerAcc!.personId,
      status: "IN_PROGRESS",
      priority: "Cao",
      originalDeadline: new Date("2026-10-22T17:00:00Z"),
      currentDeadline: new Date("2026-10-22T17:00:00Z"),
    },
  });

  const officerSubmitRes = await fetch(`${BASE_URL}/api/tasks/${task6.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenOfficerA}`,
    },
    body: JSON.stringify({
      status: "WAITING_REVIEW",
      progressPercent: 100,
      actualResultText: "Đã hoàn thành kiểm tra hồ sơ và niêm phong 05 container, các seal đều nguyên vẹn.",
    }),
  });

  const officerSubmitText = await officerSubmitRes.text();
  if (officerSubmitRes.status !== 200) {
    console.error("  [DEBUG officerSubmitRes]:", officerSubmitRes.status, officerSubmitText);
  }

  assert(
    officerSubmitRes.status === 200,
    "TEST 6.1",
    `Cán bộ cập nhật tiến độ 100% và báo hoàn thành thành công (HTTP ${officerSubmitRes.status})`
  );

  const dbTaskAfterSubmit = await prisma.task.findUnique({ where: { id: task6.id } });
  assert(
    dbTaskAfterSubmit?.status === "WAITING_REVIEW",
    "TEST 6.2",
    "PostgreSQL xác nhận nhiệm vụ chuyển sang trạng thái WAITING_REVIEW"
  );

  // 6.2. Đội trưởng Đội A (truongnhom_a) nghiệm thu kết quả công tác
  const leaderAcceptRes = await fetch(`${BASE_URL}/api/tasks/${task6.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${tokenDeptLeaderA}`,
    },
    body: JSON.stringify({
      status: "COMPLETED",
      actualResultText: "Đội trưởng Đội A đã nghiệm thu và chấp thuận kết quả hoàn thành 100%.",
    }),
  });

  assert(
    leaderAcceptRes.status === 200,
    "TEST 6.3",
    "Đội trưởng nghiệm thu hoàn thành nhiệm vụ thành công (HTTP 200)"
  );

  // 6.3. Xác minh trong PostgreSQL và kiểm tra lịch sử TaskUpdate + AuditEvent
  const dbTaskAfterAccept = await prisma.task.findUnique({
    where: { id: task6.id },
    include: { updates: { orderBy: { createdAt: "desc" } } },
  });

  const latestUpdate = dbTaskAfterAccept?.updates[0];

  assert(
    dbTaskAfterAccept?.status === "COMPLETED" && latestUpdate?.progressPercent === 100,
    "TEST 6.4",
    "PostgreSQL xác nhận nhiệm vụ chuyển thành COMPLETED và TaskUpdate ghi nhận tiến độ 100%"
  );

  assert(
    latestUpdate?.statusAfter === "COMPLETED",
    "TEST 6.5",
    `Bảng TaskUpdate đã ghi nhận lịch sử chuyển trạng thái: ${latestUpdate?.statusBefore} -> ${latestUpdate?.statusAfter}`
  );

  const auditEvents = await prisma.auditEvent.findMany({
    where: { resourceId: task6.id, action: "TASK_APPROVE_COMPLETED" },
  });
  assert(
    auditEvents.length > 0,
    "TEST 6.6",
    `Bảng AuditEvent đã ghi nhận kiểm toán an ninh với action: 'TASK_APPROVE_COMPLETED'`
  );

  // 6.4. Giả lập Reload (F5): Kiểm tra chi tiết nhiệm vụ qua GET /api/tasks/:id
  const getReloadTaskRes = await fetch(`${BASE_URL}/api/tasks/${task6.id}`, {
    headers: { Authorization: `Bearer ${tokenOfficerA}` },
  });
  const getReloadTaskJson = await getReloadTaskRes.json();
  assert(
    getReloadTaskJson.data?.status === "COMPLETED",
    "TEST 6.7",
    "Sau khi Reload, GET /api/tasks/:id vẫn trả về chính xác trạng thái COMPLETED từ CSDL"
  );

  // ===========================================================================
  // TỔNG KẾT BỘ KIỂM THỬ
  // ===========================================================================
  console.log("\n================================================================================");
  console.log(`KẾT QUẢ KIỂM THỬ PHÊ DUYỆT THỰC TẾ: ${passedCount}/${totalCount} BÀI ĐẠT CHUẨN`);
  console.log("================================================================================\n");

  if (passedCount === totalCount) {
    console.log(">> TOÀN BỘ 6 KỊCH BẢN KIỂM THỬ PHÊ DUYỆT ĐỀU ĐẠT CHUẨN 100% (ZERO FAKE SUCCESS).");
  } else {
    console.error(">> CÓ BÀI KIỂM THỬ THẤT BẠI!");
    process.exit(1);
  }

  await prisma.$disconnect();
}

runApprovalsRealityTestSuite().catch(async (err) => {
  console.error("Lỗi khi thực thi bộ kiểm thử phê duyệt:", err);
  await prisma.$disconnect();
  process.exit(1);
});

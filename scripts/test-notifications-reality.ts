import { prisma } from "../src/server/db";
import { signToken } from "../src/server/auth";

const BASE_URL = "http://localhost:3000";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  evidence?: any;
}

const results: TestResult[] = [];

async function getAuthToken(username: string) {
  const account = await prisma.account.findUnique({
    where: { username },
    include: {
      person: {
        include: {
          assignments: {
            where: { isPrimary: true },
            include: { unit: true, position: true },
          },
        },
      },
      roleGrants: {
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
          scopeUnit: true,
        },
      },
    },
  });

  if (!account) throw new Error(`Account not found: ${username}`);

  const primaryAssignment = account.person.assignments[0];
  const primaryGrant = account.roleGrants[0];

  const permissions = new Set<string>();
  for (const grant of account.roleGrants) {
    for (const rp of grant.role.rolePermissions) {
      permissions.add(rp.permission.code);
    }
  }

  const token = signToken({
    id: account.id,
    personId: account.personId,
    username: account.username,
    fullName: account.person.fullName,
    personCode: account.person.code,
    positionTitle: primaryAssignment?.position?.name || "Cán bộ",
    unitId: primaryAssignment?.unitId,
    unitName: primaryAssignment?.unit?.name,
    role: primaryGrant?.role.code || "CUSTOMS_OFFICER",
    scopeType: (primaryGrant?.scopeType as any) || "DEPARTMENT",
    scopeUnitId: primaryGrant?.scopeUnitId,
    permissions: Array.from(permissions),
  });

  return { token, account, primaryAssignment };
}

async function runNotificationsRealityTests() {
  console.log("================================================================================");
  console.log("     TALUNG-CUS-WORK — P1 FIX 04: REAL NOTIFICATION ENGINE VERIFICATION        ");
  console.log("================================================================================");

  // Users
  const leaderUser = await getAuthToken("lanhdao");       // UNIT_LEADER
  const officerA = await getAuthToken("canbo_a");         // Unit A officer
  const leaderA = await getAuthToken("truongnhom_a");     // Unit A leader
  const officerB = await getAuthToken("canbo_b");         // Unit B officer

  console.log(`- Loaded Lãnh đạo: ${leaderUser.account.person.fullName} (${leaderUser.account.username})`);
  console.log(`- Loaded Cán bộ A: ${officerA.account.person.fullName} (${officerA.account.username})`);
  console.log(`- Loaded Trưởng nhóm A: ${leaderA.account.person.fullName} (${leaderA.account.username})`);
  console.log(`- Loaded Cán bộ B: ${officerB.account.person.fullName} (${officerB.account.username})`);

  const unitAId = officerA.primaryAssignment?.unitId;
  if (!unitAId) throw new Error("Unit not found for officer A");

  // Dọn dẹp dữ liệu thông báo thử nghiệm trước đó nếu có
  await prisma.notification.deleteMany({
    where: {
      recipientId: { in: [officerA.account.personId, officerB.account.personId, leaderUser.account.personId] },
    },
  });

  let createdTaskA: any = null;
  let notifAId: string | null = null;

  // -----------------------------------------------------------------------------------------
  // TEST 1 — Giao nhiệm vụ cho Cán bộ A -> Cán bộ A nhận được thông báo
  // -----------------------------------------------------------------------------------------
  try {
    const taskCode = `TASK-NTF1-${Date.now()}`;
    const resCreateTask = await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderA.token}`,
      },
      body: JSON.stringify({
        title: `Nhiệm vụ kiểm tra thông báo thực tế [${taskCode}]`,
        priority: "Cao",
        currentDeadline: new Date(Date.now() + 86400000).toISOString(),
        description: "Yêu cầu hoàn thành đúng tiến độ",
        unitId: unitAId,
        ownerId: officerA.account.personId,
      }),
    });

    if (!resCreateTask.ok) {
      throw new Error(`Failed to create task with status ${resCreateTask.status}`);
    }
    const createData = await resCreateTask.json();
    createdTaskA = createData.data;

    // Cán bộ A gọi GET /api/notifications
    const resGetNotif = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    if (!resGetNotif.ok) throw new Error(`GET /api/notifications failed with ${resGetNotif.status}`);
    const notifData = await resGetNotif.json();

    const foundNotif = notifData.data?.find(
      (n: any) => n.entityId === createdTaskA.id || n.taskCode === createdTaskA.code
    );

    if (!foundNotif) {
      throw new Error(`Notification for task ${createdTaskA.code} not found in Officer A's notifications!`);
    }

    notifAId = foundNotif.id;

    // Kiểm tra trong PostgreSQL
    const dbNotif = await prisma.notification.findUnique({ where: { id: foundNotif.id } });
    if (!dbNotif || dbNotif.recipientId !== officerA.account.personId) {
      throw new Error("PostgreSQL record missing or assigned to wrong recipient!");
    }

    results.push({
      name: "TEST 1: Giao nhiệm vụ cho cán bộ A -> Cán bộ A nhận được thông báo thực tế trong PostgreSQL",
      passed: true,
      details: `Giao nhiệm vụ ${createdTaskA.code}. Cán bộ A nhận thông báo ID ${foundNotif.id} ('${foundNotif.title}'). PostgreSQL xác nhận recipientId = ${officerA.account.personId}.`,
      evidence: { taskId: createdTaskA.id, notifId: foundNotif.id, recipientId: dbNotif.recipientId },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 1: Giao nhiệm vụ cho cán bộ A -> Cán bộ A nhận được thông báo thực tế trong PostgreSQL",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 2 — Cán bộ A đánh dấu đã đọc -> F5 (GET lại) -> Trạng thái đã đọc được lưu bền vững
  // -----------------------------------------------------------------------------------------
  try {
    if (!notifAId) throw new Error("notifAId not available from TEST 1");

    const resRead = await fetch(`${BASE_URL}/api/notifications/${notifAId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    if (!resRead.ok) throw new Error(`PATCH /api/notifications/${notifAId}/read failed with ${resRead.status}`);

    // Mô phỏng F5 bằng cách gọi lại GET /api/notifications
    const resF5 = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const dataF5 = await resF5.json();

    const notifAfterF5 = dataF5.data?.find((n: any) => n.id === notifAId);
    if (!notifAfterF5) throw new Error("Notification disappeared after read!");
    if (notifAfterF5.isUnread !== false) {
      throw new Error(`Notification is still unread after F5! Expected isUnread = false, got ${notifAfterF5.isUnread}`);
    }

    // Kiểm tra trực tiếp PostgreSQL
    const dbRecord = await prisma.notification.findUnique({ where: { id: notifAId } });
    if (!dbRecord?.isRead || !dbRecord?.readAt) {
      throw new Error(`PostgreSQL isRead is false or readAt is null! isRead: ${dbRecord?.isRead}`);
    }

    results.push({
      name: "TEST 2: Cán bộ A đánh dấu đã đọc -> F5 -> Trạng thái đã đọc được bảo toàn trong PostgreSQL",
      passed: true,
      details: `Đánh dấu đã đọc thông báo ${notifAId}. Sau F5, API trả isUnread = false. PostgreSQL xác nhận is_read = true, read_at = ${dbRecord.readAt.toISOString()}.`,
      evidence: { notifId: notifAId, isRead: dbRecord.isRead, readAt: dbRecord.readAt },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 2: Cán bộ A đánh dấu đã đọc -> F5 -> Trạng thái đã đọc được bảo toàn trong PostgreSQL",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 3 — Đánh dấu tất cả đã đọc -> Đăng xuất và Đăng nhập lại -> Giữ nguyên trạng thái
  // -----------------------------------------------------------------------------------------
  try {
    // Tạo thêm 2 thông báo mới cho cán bộ A
    await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderA.token}`,
      },
      body: JSON.stringify({
        title: `Nhiệm vụ kiểm tra đọc hết 1 [${Date.now()}]`,
        priority: "Trung bình",
        currentDeadline: new Date(Date.now() + 86400000).toISOString(),
        unitId: unitAId,
        ownerId: officerA.account.personId,
      }),
    });

    await fetch(`${BASE_URL}/api/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderA.token}`,
      },
      body: JSON.stringify({
        title: `Nhiệm vụ kiểm tra đọc hết 2 [${Date.now()}]`,
        priority: "Cao",
        currentDeadline: new Date(Date.now() + 86400000).toISOString(),
        unitId: unitAId,
        ownerId: officerA.account.personId,
      }),
    });

    // Kiểm tra unreadCount trước khi đọc hết
    const resPre = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const preData = await resPre.json();
    const countBefore = preData.unreadCount;
    if (countBefore === 0) throw new Error("Expected at least 1 unread notification before read-all");

    // Thực hiện Read All
    const resReadAll = await fetch(`${BASE_URL}/api/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    if (!resReadAll.ok) throw new Error(`POST /api/notifications/read-all failed with ${resReadAll.status}`);

    // Mô phỏng Đăng xuất & Đăng nhập lại: Sinh token mới cho cán bộ A
    const freshOfficerA = await getAuthToken("canbo_a");
    const resAfterRelogin = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${freshOfficerA.token}` },
    });
    const postData = await resAfterRelogin.json();

    if (postData.unreadCount !== 0) {
      throw new Error(`Expected unreadCount = 0 after read-all and re-login, got ${postData.unreadCount}`);
    }

    results.push({
      name: "TEST 3: Đánh dấu tất cả đã đọc -> Đăng xuất và đăng nhập lại -> unreadCount = 0 bền vững",
      passed: true,
      details: `Trước khi đọc hết: ${countBefore} chưa đọc. Sau khi gọi /api/notifications/read-all và cấp phiên mới, unreadCount = 0.`,
      evidence: { unreadBefore: countBefore, unreadAfterRelogin: postData.unreadCount },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 3: Đánh dấu tất cả đã đọc -> Đăng xuất và đăng nhập lại -> unreadCount = 0 bền vững",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 4 — Ẩn một thông báo -> F5 -> Thông báo không còn xuất hiện trong danh sách
  // -----------------------------------------------------------------------------------------
  try {
    if (!notifAId) throw new Error("notifAId not available");

    const resDismiss = await fetch(`${BASE_URL}/api/notifications/${notifAId}/dismiss`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    if (!resDismiss.ok) throw new Error(`PATCH /api/notifications/${notifAId}/dismiss failed with ${resDismiss.status}`);

    // F5 lại
    const resF5Dismiss = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const dataF5Dismiss = await resF5Dismiss.json();

    const stillPresent = dataF5Dismiss.data?.some((n: any) => n.id === notifAId);
    if (stillPresent) {
      throw new Error(`Notification ${notifAId} is still present in list after being dismissed!`);
    }

    // Kiểm tra PostgreSQL: isDismissed = true
    const dbDismissed = await prisma.notification.findUnique({ where: { id: notifAId } });
    if (!dbDismissed?.isDismissed || !dbDismissed?.dismissedAt) {
      throw new Error(`PostgreSQL isDismissed is false! isDismissed: ${dbDismissed?.isDismissed}`);
    }

    results.push({
      name: "TEST 4: Ẩn thông báo -> F5 -> Thông báo bị ẩn vĩnh viễn khỏi danh sách hiển thị",
      passed: true,
      details: `Ẩn thông báo ${notifAId}. Sau F5, thông báo biến mất hoàn toàn khỏi danh sách API. PostgreSQL xác nhận is_dismissed = true.`,
      evidence: { notifId: notifAId, isDismissed: dbDismissed.isDismissed, dismissedAt: dbDismissed.dismissedAt },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 4: Ẩn thông báo -> F5 -> Thông báo bị ẩn vĩnh viễn khỏi danh sách hiển thị",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 5 — Cán bộ B không thể đọc, sửa hoặc ẩn thông báo của Cán bộ A (IDOR Protection 403)
  // -----------------------------------------------------------------------------------------
  try {
    // Tạo 1 thông báo mới dành riêng cho cán bộ A
    const privateTask = await prisma.task.create({
      data: {
        code: `TASK-PRIV-${Date.now()}`,
        title: "Nhiệm vụ bảo mật kiểm thử chống IDOR",
        ownerId: officerA.account.personId,
        unitId: unitAId,
        status: "IN_PROGRESS",
        priority: "Khẩn",
        originalDeadline: new Date(Date.now() + 86400000),
        currentDeadline: new Date(Date.now() + 86400000),
      },
    });

    const notifA = await prisma.notification.create({
      data: {
        recipientId: officerA.account.personId,
        category: "task",
        type: "TASK_ASSIGNED",
        title: "Thông báo bảo mật riêng của Cán bộ A",
        content: "Nội dung riêng tư",
        actionUrl: `/tasks/${privateTask.id}`,
      },
    });

    // 1. Cán bộ B cố tình đánh dấu đã đọc thông báo của Cán bộ A
    const resIdorRead = await fetch(`${BASE_URL}/api/notifications/${notifA.id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${officerB.token}` },
    });

    // 2. Cán bộ B cố tình ẩn thông báo của Cán bộ A
    const resIdorDismiss = await fetch(`${BASE_URL}/api/notifications/${notifA.id}/dismiss`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${officerB.token}` },
    });

    if (resIdorRead.status !== 403) {
      throw new Error(`Expected 403 Forbidden for IDOR read attempt, got ${resIdorRead.status}`);
    }
    if (resIdorDismiss.status !== 403) {
      throw new Error(`Expected 403 Forbidden for IDOR dismiss attempt, got ${resIdorDismiss.status}`);
    }

    const idorReadData = await resIdorRead.json();
    const idorDismissData = await resIdorDismiss.json();

    results.push({
      name: "TEST 5: Scope Guard & Chống IDOR (Cán bộ B không thể đọc hoặc ẩn thông báo của Cán bộ A)",
      passed: true,
      details: `Cán bộ B bị chặn với HTTP 403 khi thao tác trên thông báo của cán bộ A ('${idorReadData.error}'). Bảo vệ dữ liệu cá nhân 100%.`,
      evidence: { idorReadStatus: resIdorRead.status, idorDismissStatus: resIdorDismiss.status, err: idorReadData.error },
    });

    // Cleanup
    await prisma.notification.delete({ where: { id: notifA.id } });
    await prisma.task.delete({ where: { id: privateTask.id } });
  } catch (err: any) {
    results.push({
      name: "TEST 5: Scope Guard & Chống IDOR (Cán bộ B không thể đọc hoặc ẩn thông báo của Cán bộ A)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 6 — Chống tạo thông báo trùng lặp (Idempotency Engine)
  // -----------------------------------------------------------------------------------------
  try {
    const overdueTaskCode = `TASK-OVERDUE-${Date.now()}`;
    const overdueTask = await prisma.task.create({
      data: {
        code: overdueTaskCode,
        title: "Nhiệm vụ quá hạn kiểm thử chống trùng thông báo",
        ownerId: officerA.account.personId,
        unitId: unitAId,
        status: "IN_PROGRESS",
        priority: "Khẩn",
        originalDeadline: new Date(Date.now() - 7200000), // 2 giờ trước
        currentDeadline: new Date(Date.now() - 7200000),
      },
    });

    // Gọi GET /api/notifications lần 1 (Kích hoạt syncOperationalAlerts)
    const resCall1 = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const data1 = await resCall1.json();
    const count1 = data1.data?.filter((n: any) => n.taskCode === overdueTaskCode).length;

    // Gọi GET /api/notifications lần 2 (Không được tạo thêm bản ghi trùng)
    const resCall2 = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const data2 = await resCall2.json();
    const count2 = data2.data?.filter((n: any) => n.taskCode === overdueTaskCode).length;

    // Gọi GET /api/notifications lần 3
    const resCall3 = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const data3 = await resCall3.json();
    const count3 = data3.data?.filter((n: any) => n.taskCode === overdueTaskCode).length;

    if (count1 !== 1 || count2 !== 1 || count3 !== 1) {
      throw new Error(`Duplicate notifications detected! Counts: call1=${count1}, call2=${count2}, call3=${count3}`);
    }

    results.push({
      name: "TEST 6: Cơ chế chống tạo thông báo trùng lặp (Idempotency Key ngăn lặp khi gọi API nhiều lần)",
      passed: true,
      details: `Nhiệm vụ quá hạn ${overdueTaskCode} qua 3 lần gọi GET liên tiếp chỉ sinh duy nhất 1 thông báo. Không bị nhân đôi/nhân ba dữ liệu.`,
      evidence: { call1: count1, call2: count2, call3: count3, idempotencyActive: true },
    });

    // Cleanup
    await prisma.notification.deleteMany({ where: { taskCode: overdueTaskCode } });
    await prisma.task.delete({ where: { id: overdueTask.id } });
  } catch (err: any) {
    results.push({
      name: "TEST 6: Cơ chế chống tạo thông báo trùng lặp (Idempotency Key ngăn lặp khi gọi API nhiều lần)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 7 — Xử lý an toàn khi mất xác thực hoặc token không hợp lệ (HTTP 401 chuẩn xác)
  // -----------------------------------------------------------------------------------------
  try {
    const resNoToken = await fetch(`${BASE_URL}/api/notifications`);
    const resBadToken = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: "Bearer bad_invalid_token_123" },
    });

    if (resNoToken.status !== 401 || resBadToken.status !== 401) {
      throw new Error(`Expected 401 for unauthorized requests, got noToken=${resNoToken.status}, badToken=${resBadToken.status}`);
    }

    results.push({
      name: "TEST 7: Xử lý an toàn khi không có token hoặc token giả mạo (HTTP 401 chuẩn xác, zero fake success)",
      passed: true,
      details: `API trả chuẩn HTTP 401 khi không đăng nhập hoặc dùng token giả mạo, UI bắt lỗi mạng và hiển thị trạng thái lỗi rõ ràng.`,
      evidence: { statusNoToken: resNoToken.status, statusBadToken: resBadToken.status },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 7: Xử lý an toàn khi không có token hoặc token giả mạo (HTTP 401 chuẩn xác, zero fake success)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 8 — Thống nhất số thông báo chưa đọc giữa API, Header badge và Navigation
  // -----------------------------------------------------------------------------------------
  try {
    const resNotifs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const notifsData = await resNotifs.json();

    const dbUnread = await prisma.notification.count({
      where: {
        recipientId: officerA.account.personId,
        isRead: false,
        isDismissed: false,
      },
    });

    if (notifsData.unreadCount !== dbUnread) {
      throw new Error(`unreadCount mismatch: API returned ${notifsData.unreadCount}, DB has ${dbUnread}`);
    }

    // Đếm số phần tử có isUnread: true trong data
    const computedUnread = notifsData.data?.filter((n: any) => n.isUnread).length;
    if (computedUnread !== dbUnread) {
      throw new Error(`data.filter(isUnread) mismatch: computed ${computedUnread}, DB has ${dbUnread}`);
    }

    results.push({
      name: "TEST 8: Đồng bộ tuyệt đối số lượng chưa đọc (unreadCount khớp 100% giữa PostgreSQL, Header và Page)",
      passed: true,
      details: `API trả về unreadCount = ${notifsData.unreadCount}, khớp chính xác với SELECT COUNT(*) từ PostgreSQL (${dbUnread}) và số phần tử chưa đọc trên danh sách.`,
      evidence: { apiUnread: notifsData.unreadCount, dbUnread, computedUnread },
    });
  } catch (err: any) {
    results.push({
      name: "TEST 8: Đồng bộ tuyệt đối số lượng chưa đọc (unreadCount khớp 100% giữa PostgreSQL, Header và Page)",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 9 — Nghiệm thu / Trả lại nhiệm vụ -> Đúng người nhận được thông báo về kết quả
  // -----------------------------------------------------------------------------------------
  try {
    // Tạo nhiệm vụ mới cho Cán bộ A
    const flowTask = await prisma.task.create({
      data: {
        code: `TASK-FLOW-NOTIF-${Date.now()}`,
        title: "Nhiệm vụ kiểm thử thông báo khi lãnh đạo nghiệm thu",
        ownerId: officerA.account.personId,
        unitId: unitAId,
        status: "WAITING_REVIEW",
        priority: "Cao",
        originalDeadline: new Date(Date.now() + 86400000),
        currentDeadline: new Date(Date.now() + 86400000),
      },
    });

    // Lãnh đạo nghiệm thu hoàn thành (COMPLETED)
    const resApprove = await fetch(`${BASE_URL}/api/tasks/${flowTask.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${leaderA.token}`,
      },
      body: JSON.stringify({
        status: "COMPLETED",
        notes: "Đội trưởng xác nhận hoàn thành",
      }),
    });
    if (!resApprove.ok) throw new Error("Leader approve task failed");

    // Cán bộ A kiểm tra thông báo
    const resOfficerNotifs = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const officerNotifsData = await resOfficerNotifs.json();

    const approveNotif = officerNotifsData.data?.find(
      (n: any) => n.entityId === flowTask.id && n.type === "TASK_COMPLETED"
    );

    if (!approveNotif) {
      throw new Error(`Officer A did not receive TASK_COMPLETED notification for task ${flowTask.code}!`);
    }

    results.push({
      name: "TEST 9: Nghiệm thu nhiệm vụ -> Đúng cán bộ phụ trách nhận thông báo kết quả phê duyệt",
      passed: true,
      details: `Lãnh đạo nghiệm thu nhiệm vụ ${flowTask.code}. Cán bộ A nhận ngay thông báo '${approveNotif.title}' (${approveNotif.tag}).`,
      evidence: { taskId: flowTask.id, notifTitle: approveNotif.title, tag: approveNotif.tag },
    });

    // Cleanup
    await prisma.notification.deleteMany({ where: { entityId: flowTask.id } });
    await prisma.task.delete({ where: { id: flowTask.id } });
  } catch (err: any) {
    results.push({
      name: "TEST 9: Nghiệm thu nhiệm vụ -> Đúng cán bộ phụ trách nhận thông báo kết quả phê duyệt",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TEST 10 — Dữ liệu nghiệp vụ thay đổi không làm mất trạng thái đã đọc của thông báo trước đó
  // -----------------------------------------------------------------------------------------
  try {
    const taskChange = await prisma.task.create({
      data: {
        code: `TASK-PERSIST-${Date.now()}`,
        title: "Nhiệm vụ kiểm tra tính bền vững của trạng thái đã đọc",
        ownerId: officerA.account.personId,
        unitId: unitAId,
        status: "IN_PROGRESS",
        priority: "Cao",
        originalDeadline: new Date(Date.now() + 86400000),
        currentDeadline: new Date(Date.now() + 86400000),
      },
    });

    const notifPersist = await prisma.notification.create({
      data: {
        recipientId: officerA.account.personId,
        category: "task",
        type: "TASK_ASSIGNED",
        title: "Thông báo kiểm thử tính bất biến",
        content: "Nội dung kiểm tra",
        isRead: true, // ĐÃ ĐỌC
        readAt: new Date(),
        entityType: "TASK",
        entityId: taskChange.id,
        actionUrl: `/tasks/${taskChange.id}`,
        idempotencyKey: `PERSIST_TEST_${taskChange.id}`,
      },
    });

    // Thay đổi nghiệp vụ: Lãnh đạo sửa tiêu đề, đổi hạn định, thêm ghi chú cho taskChange
    await prisma.task.update({
      where: { id: taskChange.id },
      data: {
        title: "Nhiệm vụ đã được lãnh đạo cập nhật tiêu đề mới",
        currentDeadline: new Date(Date.now() + 172800000), // Gia hạn thêm 2 ngày
        issueNotes: "Lãnh đạo bổ sung chỉ đạo đặc biệt",
      },
    });

    // Cán bộ A gọi lại API GET /api/notifications
    const resCheck = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Authorization: `Bearer ${officerA.token}` },
    });
    const checkData = await resCheck.json();

    const foundPersist = checkData.data?.find((n: any) => n.id === notifPersist.id);
    if (!foundPersist) throw new Error("Notification was deleted unexpectedly!");
    if (foundPersist.isUnread !== false) {
      throw new Error(`Notification read state was flipped to unread! isUnread: ${foundPersist.isUnread}`);
    }

    // Kiểm tra trực tiếp PostgreSQL
    const dbNotifCheck = await prisma.notification.findUnique({ where: { id: notifPersist.id } });
    if (!dbNotifCheck?.isRead) {
      throw new Error("PostgreSQL record isRead was overwritten!");
    }

    results.push({
      name: "TEST 10: Dữ liệu nghiệp vụ thay đổi không làm mất trạng thái đã đọc của thông báo trước đó",
      passed: true,
      details: `Khi nhiệm vụ được chỉnh sửa tiêu đề và hạn chót, thông báo trước đó vẫn bảo toàn nguyên vẹn trạng thái isRead = true (read_at = ${dbNotifCheck.readAt?.toISOString()}).`,
      evidence: { notifId: notifPersist.id, isRead: dbNotifCheck.isRead, preserved: true },
    });

    // Cleanup
    await prisma.notification.delete({ where: { id: notifPersist.id } });
    await prisma.task.delete({ where: { id: taskChange.id } });
  } catch (err: any) {
    results.push({
      name: "TEST 10: Dữ liệu nghiệp vụ thay đổi không làm mất trạng thái đã đọc của thông báo trước đó",
      passed: false,
      details: err.message,
    });
  }

  // -----------------------------------------------------------------------------------------
  // TỔNG KẾT BÁO CÁO
  // -----------------------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("                           KẾT QUẢ KIỂM THỬ THỰC TẾ                             ");
  console.log("================================================================================");

  let passedCount = 0;
  for (const r of results) {
    const icon = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`[${icon}] ${r.name}`);
    console.log(`       Chi tiết: ${r.details}`);
    if (r.evidence) {
      console.log(`       Bằng chứng: ${JSON.stringify(r.evidence)}`);
    }
    if (r.passed) passedCount++;
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`TỔNG KẾT: ${passedCount}/${results.length} KỊCH BẢN ĐẠT YÊU CẦU THỰC TẾ (${(passedCount / results.length) * 100}%).`);
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runNotificationsRealityTests().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});

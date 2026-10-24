import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";
import { todayInVietnam } from "@/server/work-dates";
import { formatVnDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/[id]/remind
 * Gửi thông báo nhắc duyệt kết quả công việc tới Lãnh đạo phụ trách
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để gửi nhắc duyệt", 401);
    }

    const { id: taskId } = await params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        unit: true,
        owner: true,
      },
    });

    if (!task) {
      return jsonError("Nhiệm vụ không tồn tại", 404);
    }

    // Chống spam xuyên đơn vị: chỉ người có quyền đọc task mới được nhắc duyệt
    const taskAccess = await verifyTaskAccess(user, taskId, "READ");
    if (!taskAccess.allowed) {
      return jsonError(taskAccess.reason || "Truy cập bị từ chối", 403);
    }

    if (task.status !== "WAITING_REVIEW") {
      return jsonError("Chỉ có thể gửi nhắc duyệt đối với nhiệm vụ đang ở trạng thái 'Chờ duyệt'", 400);
    }

    // 1. Tìm lãnh đạo phụ trách đơn vị (Trưởng bộ phận, Phó trưởng bộ phận, hoặc Lãnh đạo đơn vị)
    const leaderAssignments = await prisma.personAssignment.findMany({
      where: {
        unitId: task.unitId,
        position: {
          code: {
            in: ["CHI_CUC_TRUONG", "DEPUTY_CHIEF", "TRUONG_BO_PHAN", "DEPT_DEPUTY", "DEPT_LEADER"],
          },
        },
      },
      include: {
        person: true,
      },
    });

    // Nếu không tìm thấy lãnh đạo qua position code, tìm các tài khoản có vai trò UNIT_LEADER hoặc DEPARTMENT_LEADER
    let targetPersonIds: string[] = leaderAssignments.map((a) => a.personId);

    if (targetPersonIds.length === 0) {
      const leaderAccounts = await prisma.account.findMany({
        where: {
          roleGrants: {
            some: {
              role: { code: { in: ["UNIT_LEADER", "DEPARTMENT_LEADER"] } },
            },
          },
          status: "ACTIVE",
        },
        select: { personId: true },
      });
      targetPersonIds = leaderAccounts.map((a) => a.personId);
    }

    // Loại trừ chính người gửi nhắc duyệt (nếu người gửi là lãnh đạo)
    targetPersonIds = targetPersonIds.filter((pid) => pid !== user.personId);

    if (targetPersonIds.length === 0) {
      // Fallback: Tìm bất kỳ tài khoản lãnh đạo nào
      const fallbackLeader = await prisma.account.findFirst({
        where: {
          roleGrants: {
            some: {
              role: { code: "UNIT_LEADER" },
            },
          },
          status: "ACTIVE",
        },
        select: { personId: true },
      });
      if (fallbackLeader?.personId) {
        targetPersonIds.push(fallbackLeader.personId);
      }
    }

    // 2. Tạo thông báo cho từng lãnh đạo (idempotency theo ngày: mỗi người chỉ nhắc 1 lần/ngày/task)
    const todayStr = todayInVietnam();
    const notifyPromises = targetPersonIds.map((leaderPersonId) =>
      createNotification({
        recipientId: leaderPersonId,
        type: "TASK_REVIEW_REMIND",
        title: `Nhắc duyệt: ${task.code} - ${task.title.slice(0, 45)}...`,
        content: `Cán bộ ${user.fullName} (${user.personCode || user.username}) vừa gửi nhắc duyệt kết quả hoàn thành nhiệm vụ "${task.title}". Hạn xử lý: ${formatVnDate(task.currentDeadline)}.`,
        category: "approval",
        actionUrl: "/approvals",
        actionLabel: "Xem phê duyệt",
        idempotencyKey: `EVENT_TASK_REMIND_${taskId}_${user.personId}_${todayStr}_${leaderPersonId}`,
      })
    );

    await Promise.all(notifyPromises);

    // 3. Ghi vết kiểm toán
    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_REVIEW_REMIND_SENT",
      resourceType: "Task",
      resourceId: task.id,
      newData: {
        taskCode: task.code,
        recipientCount: targetPersonIds.length,
        sentBy: user.username,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Đã gửi thông báo nhắc duyệt tới Lãnh đạo phụ trách thành công (${targetPersonIds.length} người nhận)`,
    });
  } catch (err: any) {
    console.error("[Task Remind Error]", err);
    return jsonError(err.message || "Lỗi khi gửi nhắc duyệt", 500);
  }
}

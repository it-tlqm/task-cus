import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { assertTaskStatusTransition, isTaskLeader } from "@/server/task-transitions";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) {
      return jsonError(access.reason || "Truy cập bị từ chối", 403);
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        owner: true,
        unit: true,
        assignees: {
          include: { person: true },
        },
        planLinks: {
          include: {
            planItem: {
              include: { plan: true },
            },
          },
        },
        deadlineRequests: {
          orderBy: { createdAt: "desc" },
        },
        updates: {
          orderBy: { createdAt: "desc" },
          include: { author: true },
        },
        attachments: {
          orderBy: { createdAt: "desc" },
          include: {
            uploadedBy: {
              select: { fullName: true },
            },
          },
        },
      },
    });

    if (!task) return jsonError("Không tìm thấy nhiệm vụ", 404);

    const now = new Date();
    const isFinished = task.status === "COMPLETED" || task.status === "DONE" || task.status === "CANCELED";
    const isOverdue = !isFinished && new Date(task.currentDeadline) < now;

    return NextResponse.json({
      success: true,
      data: {
        ...task,
        isOverdue,
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải chi tiết nhiệm vụ: " + error.message, 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) {
      return jsonError(access.reason || "Truy cập bị từ chối", 403);
    }

    const body = await req.json();
    const {
      status,
      title,
      description,
      priority,
      currentDeadline,
      actualResultText,
      expectedResultText,
      hasIssue,
      issueNotes,
      progressPercent,
    } = body;

    const currentTask = access.task;
    const isLeader = await isTaskLeader(user, currentTask.unitId);

    // Guard tập trung: nghiệm thu / trả lại / dời hạn trực tiếp (Slice 1)
    const deadlineChanged =
      currentDeadline !== undefined &&
      new Date(currentDeadline).getTime() !== new Date(currentTask.currentDeadline).getTime();
    try {
      assertTaskStatusTransition({
        currentStatus: currentTask.status,
        targetStatus: status ?? null,
        deadlineChanged,
        isLeader,
      });
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 403);
    }

    const updateData: any = {};

    if (status !== undefined) updateData.status = status;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (currentDeadline !== undefined) updateData.currentDeadline = new Date(currentDeadline);
    if (actualResultText !== undefined) updateData.actualResultText = actualResultText;
    if (expectedResultText !== undefined) updateData.expectedResultText = expectedResultText;
    if (hasIssue !== undefined) updateData.hasIssue = Boolean(hasIssue);
    if (issueNotes !== undefined) updateData.issueNotes = issueNotes;

    const effectiveProgress = (status === "COMPLETED" || status === "DONE")
      ? 100
      : progressPercent !== undefined
      ? Number(progressPercent)
      : undefined;

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        owner: true,
        unit: true,
        assignees: { include: { person: true } },
      },
    });

    let actionName = "TASK_UPDATE";
    let successMessage = "Đã cập nhật nhiệm vụ thành công";

    if (status === "COMPLETED" || status === "DONE") {
      actionName = "TASK_APPROVE_COMPLETED";
      successMessage = "Đã nghiệm thu và phê duyệt hoàn thành nhiệm vụ thành công";
    } else if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
      actionName = "TASK_RETURN_FOR_CLARIFICATION";
      successMessage = "Đã trả lại nhiệm vụ yêu cầu giải trình hoàn thiện";
    }

    if (effectiveProgress !== undefined || status !== undefined || deadlineChanged) {
      const deadlineNote = deadlineChanged
        ? ` Lãnh đạo điều chỉnh hạn từ ${new Date(currentTask.currentDeadline).toLocaleDateString("vi-VN")} sang ${new Date(updatedTask.currentDeadline).toLocaleDateString("vi-VN")}.`
        : "";
      await prisma.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          progressPercent: effectiveProgress !== undefined ? effectiveProgress : 100,
          statusBefore: currentTask.status,
          statusAfter: updatedTask.status,
          notes: (actualResultText || (status === "COMPLETED" ? "Lãnh đạo đơn vị nghiệm thu hoàn thành 100%" : "Cập nhật trạng thái nhiệm vụ")) + deadlineNote,
        },
      });
    }

    await recordAuditEvent({
      actorId: user.id,
      action: actionName,
      resourceType: "Task",
      resourceId: taskId,
      oldData: { status: currentTask.status },
      newData: { status: updatedTask.status, actualResultText, progressPercent: effectiveProgress },
    });

    if (status === "COMPLETED" || status === "DONE") {
      await createNotification({
        recipientId: updatedTask.ownerId,
        category: "task",
        type: "TASK_COMPLETED",
        title: `Nhiệm vụ đã được nghiệm thu: [${updatedTask.code}]`,
        content: `Lãnh đạo đã nghiệm thu và xác nhận hoàn thành nhiệm vụ '${updatedTask.title}'. Kết quả đạt chuẩn nghiệp vụ.`,
        tag: "ĐÃ NGHIỆM THU",
        tagType: "success",
        entityType: "TASK",
        entityId: updatedTask.id,
        actionUrl: `/tasks/${updatedTask.id}`,
        actionLabel: "Xem kết quả nghiệm thu",
        taskCode: updatedTask.code,
        idempotencyKey: `EVENT_TASK_CMP_${updatedTask.id}_${Date.now()}`,
      });
    } else if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
      await createNotification({
        recipientId: updatedTask.ownerId,
        category: "task",
        type: "TASK_REJECTED",
        title: `Yêu cầu hoàn thiện nhiệm vụ: [${updatedTask.code}]`,
        content: `Lãnh đạo yêu cầu bổ sung/giải trình kết quả nhiệm vụ '${updatedTask.title}'. Lý do: ${actualResultText || issueNotes || "Chưa đạt yêu cầu"}.`,
        tag: "YÊU CẦU BỔ SUNG",
        tagType: "warning",
        entityType: "TASK",
        entityId: updatedTask.id,
        actionUrl: `/tasks/${updatedTask.id}`,
        actionLabel: "Hoàn thiện nhiệm vụ",
        taskCode: updatedTask.code,
        idempotencyKey: `EVENT_TASK_RET_${updatedTask.id}_${Date.now()}`,
      });
    }

    return NextResponse.json({
      success: true,
      message: successMessage,
      data: updatedTask,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật nhiệm vụ: " + error.message, 500);
  }
}

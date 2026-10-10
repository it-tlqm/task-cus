import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, getAuthorizedUnitIds, checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

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
    const authorizedUnits = await getAuthorizedUnitIds(user);
    const isUnitAuthorized = authorizedUnits === "ALL" || authorizedUnits.includes(currentTask.unitId);
    const isLeader =
      user.role === "UNIT_LEADER" ||
      (user.role === "DEPARTMENT_LEADER" && isUnitAuthorized) ||
      checkPermission(user, "tasks.approve");

    // 1. Kiểm tra nghiệm thu hoàn thành nhiệm vụ (COMPLETED / DONE)
    if (status === "COMPLETED" || status === "DONE") {
      // Chống phê duyệt lặp lại
      if (currentTask.status === "COMPLETED" || currentTask.status === "DONE") {
        return jsonError("Nhiệm vụ này đã được nghiệm thu hoàn thành trước đó (COMPLETED), không thể phê duyệt lại", 400);
      }

      // Chỉ Lãnh đạo đơn vị hoặc Trưởng bộ phận phụ trách mới có quyền nghiệm thu
      if (!isLeader) {
        return jsonError("Chỉ Lãnh đạo đơn vị hoặc Trưởng bộ phận phụ trách mới có thẩm quyền nghiệm thu xác nhận hoàn thành nhiệm vụ", 403);
      }
    }

    // 2. Kiểm tra trả lại yêu cầu giải trình (từ WAITING_REVIEW về IN_PROGRESS)
    if (currentTask.status === "WAITING_REVIEW" && status === "IN_PROGRESS") {
      if (!isLeader) {
        return jsonError("Chỉ Lãnh đạo mới có thẩm quyền yêu cầu giải trình hoặc trả lại kết quả nhiệm vụ", 403);
      }
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

    if (effectiveProgress !== undefined || status !== undefined) {
      await prisma.taskUpdate.create({
        data: {
          taskId,
          authorId: user.personId,
          progressPercent: effectiveProgress !== undefined ? effectiveProgress : 100,
          statusBefore: currentTask.status,
          statusAfter: updatedTask.status,
          notes: actualResultText || (status === "COMPLETED" ? "Lãnh đạo đơn vị nghiệm thu hoàn thành 100%" : "Cập nhật trạng thái nhiệm vụ"),
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

    return NextResponse.json({
      success: true,
      message: successMessage,
      data: updatedTask,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật nhiệm vụ: " + error.message, 500);
  }
}

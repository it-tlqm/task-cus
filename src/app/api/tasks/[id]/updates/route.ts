import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
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

    const updates = await prisma.taskUpdate.findMany({
      where: { taskId },
      include: { author: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: updates });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch sử tiến độ: " + error.message, 500);
  }
}

export async function POST(
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
    const { progressPercent, notes, newStatus, hasIssue, issueNotes } = body;

    const currentTask = access.task;

    const createdUpdate = await prisma.taskUpdate.create({
      data: {
        taskId,
        authorId: user.personId,
        progressPercent: progressPercent !== undefined ? Number(progressPercent) : 0,
        statusBefore: currentTask.status,
        statusAfter: newStatus || currentTask.status,
        notes: notes || null,
      },
      include: { author: true },
    });

    // Cập nhật lại Task
    const taskUpdateData: any = {};
    if (newStatus) taskUpdateData.status = newStatus;
    if (hasIssue !== undefined) {
      taskUpdateData.hasIssue = Boolean(hasIssue);
      taskUpdateData.issueNotes = issueNotes || null;
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: taskUpdateData,
      include: {
        owner: true,
        unit: true,
        assignees: { include: { person: true } },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_PROGRESS_UPDATE",
      resourceType: "Task",
      resourceId: taskId,
      oldData: { status: currentTask.status },
      newData: { progressPercent, status: updatedTask.status, hasIssue: updatedTask.hasIssue },
    });

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật tiến độ nhiệm vụ thành công",
      data: {
        update: createdUpdate,
        task: updatedTask,
      },
    }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi lưu tiến độ: " + error.message, 500);
  }
}

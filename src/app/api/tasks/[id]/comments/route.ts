import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { isTaskLeader } from "@/server/task-transitions";
import { recordAuditEvent } from "@/server/audit";
import { createNotification } from "@/server/notifications";

/**
 * Trao đổi trong nhiệm vụ: bình luận phẳng (không thread/sửa), xóa của mình,
 * lãnh đạo xóa được tất cả. Có bình luận mới → báo người liên quan.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) return jsonError(access.reason || "Truy cập bị từ chối", 403);
    const rows = await prisma.taskComment.findMany({
      where: { taskId },
      include: {
        author: { select: { id: true, fullName: true } },
        attachments: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    return jsonError("Lỗi khi tải trao đổi: " + error.message, 500);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    const access = await verifyTaskAccess(user, taskId, "WRITE");
    if (!access.allowed) return jsonError(access.reason || "Truy cập bị từ chối", 403);
    const body = await req.json();
    const content = String(body.content || "").trim();
    if (!content) return jsonError("Nội dung bình luận là bắt buộc", 400);
    if (content.length > 2000) return jsonError("Bình luận tối đa 2000 ký tự", 400);

    const created = await prisma.taskComment.create({
      data: { taskId, authorId: user.personId, content: content.slice(0, 2000) },
      include: {
        author: { select: { id: true, fullName: true } },
        attachments: true,
      },
    });
    await recordAuditEvent({
      actorId: user.id, action: "TASK_COMMENT", resourceType: "TaskComment", resourceId: created.id,
      newData: { taskId, len: content.length },
    });

    // Báo người liên quan (chủ trì + phối hợp), trừ chính tác giả
    try {
      const task = access.task;
      const recipients = new Set<string>();
      if (task.ownerId && task.ownerId !== user.personId) recipients.add(task.ownerId);
      for (const a of task.assignees || []) {
        if (a.personId && a.personId !== user.personId) recipients.add(a.personId);
      }
      for (const pid of recipients) {
        await createNotification({
          recipientId: pid,
          category: "task",
          type: "TASK_COMMENT",
          title: `Trao đổi mới: [${task.code}]`,
          content: `${user.fullName}: ${content.slice(0, 140)}`,
          tag: "TRAO ĐỔI",
          tagType: "primary",
          entityType: "TASK",
          entityId: taskId,
          actionUrl: `/tasks/${taskId}`,
          actionLabel: "Xem trao đổi",
          taskCode: task.code,
          idempotencyKey: `EVENT_TASK_CMT_${created.id}_${pid}`,
        });
      }
    } catch {}
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi gửi bình luận: " + error.message, 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id: taskId } = await params;
    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) return jsonError("Thiếu ID bình luận", 400);
    const current = await prisma.taskComment.findUnique({ where: { id: commentId } });
    if (!current || current.taskId !== taskId) return jsonError("Bình luận không tồn tại", 404);
    const isOwner = current.authorId === user.personId;
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { unitId: true } });
    const isLeader = task ? await isTaskLeader(user, task.unitId) : false;
    if (!isOwner && !isLeader) return jsonError("Chỉ tác giả hoặc lãnh đạo mới được xóa bình luận này", 403);
    await prisma.taskComment.delete({ where: { id: commentId } });
    await recordAuditEvent({
      actorId: user.id, action: "TASK_COMMENT_DELETE", resourceType: "TaskComment", resourceId: commentId,
      oldData: { taskId },
    });
    return NextResponse.json({ success: true, message: "Đã xóa bình luận." });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa bình luận: " + error.message, 500);
  }
}

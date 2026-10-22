import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { isTerminalTaskStatus } from "@/server/task-transitions";
import { recordAuditEvent } from "@/server/audit";
import { getStorageProvider, ensureAttachmentStorageReady, StorageConfigError } from "@/server/storage";
import { toClientAttachments, toClientAttachment } from "@/server/attachments";

export const dynamic = "force-dynamic";

/**
 * GET /api/tasks/[id]/attachments
 * Lấy danh sách tệp đính kèm của nhiệm vụ
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập tài liệu đính kèm", 401);
    }

    const { id: taskId } = await params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, code: true, title: true, unitId: true, ownerId: true, status: true },
    });

    if (!task) {
      return jsonError("Nhiệm vụ không tồn tại", 404);
    }

    // F5/đường phụ (YC-38): nhiệm vụ đã nghiệm thu ⇒ không đính kèm thêm
    // (chưa có chính sách minh chứng bổ sung cho nhiệm vụ đã nghiệm thu ⇒ chặn, fail-closed).
    if (isTerminalTaskStatus(task.status)) {
      return jsonError(
        `Nhiệm vụ ${task.status === "CANCELED" ? "đã bị loại" : "đã được nghiệm thu hoàn thành"} — không thể đính kèm thêm tài liệu.`,
        409
      );
    }

    const readAccess = await verifyTaskAccess(user, taskId, "READ");
    if (!readAccess.allowed) {
      return jsonError(readAccess.reason || "Truy cập bị từ chối", 403);
    }

    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            code: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Luôn trả về đường dẫn có xác thực — KHÔNG phát URL công khai của kho lưu trữ.
    return NextResponse.json({
      success: true,
      data: toClientAttachments(attachments as any, taskId),
    });
  } catch (err: any) {
    console.error("[Attachments GET Error]", err);
    return jsonError(err.message || "Lỗi khi lấy danh sách tệp đính kèm", 500);
  }
}

/**
 * POST /api/tasks/[id]/attachments
 * Tải tệp đính kèm lên Supabase Storage (hoặc R2) và lưu vào database
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để tải tệp đính kèm", 401);
    }

    if (!user.personId) {
      return jsonError("Tài khoản chưa được liên kết hồ sơ cán bộ", 400);
    }

    const { id: taskId } = await params;

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, code: true, title: true, unitId: true, ownerId: true },
    });

    if (!task) {
      return jsonError("Nhiệm vụ không tồn tại", 404);
    }

    // Chống đính kèm vào task ngoài phạm vi
    const attachAccess = await verifyTaskAccess(user, taskId, "WRITE");
    if (!attachAccess.allowed) {
      return jsonError(attachAccess.reason || "Truy cập bị từ chối", 403);
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const isSigned = formData.get("isSigned") === "true";
    const signedBy = (formData.get("signedBy") as string) || (isSigned ? user.fullName : null);
    // Đính file theo bình luận (trao đổi) — file vẫn thuộc task để hiển thị tổng hợp
    const commentId = (formData.get("commentId") as string) || null;
    if (commentId) {
      const cmt = await prisma.taskComment.findUnique({ where: { id: commentId } });
      if (!cmt || cmt.taskId !== taskId) {
        return jsonError("Bình luận không thuộc nhiệm vụ này", 400);
      }
    }

    if (!file) {
      return jsonError("Vui lòng chọn tệp tin cần tải lên", 400);
    }

    // Giới hạn dung lượng: 25 MB
    const MAX_FILE_SIZE = 25 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return jsonError("Dung lượng tệp vượt quá giới hạn cho phép (Tối đa 25 MB)", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const storage = await ensureAttachmentStorageReady();
    const uploadResult = await storage.upload(
      buffer,
      file.name,
      file.type || "application/octet-stream",
      `task-${task.code}`
    );

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: task.id,
        uploadedById: user.personId,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || "application/octet-stream",
        storageKey: uploadResult.key,
        fileUrl: uploadResult.url,
        isSigned,
        signedBy,
        commentId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            fullName: true,
            code: true,
          },
        },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_ATTACHMENT_UPLOAD",
      resourceType: "TaskAttachment",
      resourceId: attachment.id,
      newData: {
        taskId: task.id,
        taskCode: task.code,
        fileName: file.name,
        fileSize: file.size,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Tải tệp đính kèm lên hệ thống thành công",
      data: toClientAttachment(attachment as any, task.id),
    });
  } catch (err: any) {
    if (err instanceof StorageConfigError) {
      console.error("[Attachments POST] cấu hình kho tệp:", err.message);
      return jsonError(err.message, 503);
    }
    console.error("[Attachments POST Error]", err);
    return jsonError(err.message || "Lỗi trong quá trình tải tệp tin lên", 500);
  }
}

/**
 * DELETE /api/tasks/[id]/attachments
 * Xóa tệp đính kèm khỏi Storage và Database
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập", 401);
    }

    const { id: taskId } = await params;
    const { searchParams } = new URL(req.url);
    const attachmentId = searchParams.get("attachmentId");

    if (!attachmentId) {
      return jsonError("Thiếu mã tệp tin cần xóa (attachmentId)", 400);
    }

    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      include: { task: true },
    });

    if (!attachment || attachment.taskId !== taskId) {
      return jsonError("Tệp đính kèm không tồn tại trong nhiệm vụ này", 404);
    }

    // Kiểm tra quyền xóa: người upload, chủ nhiệm vụ, hoặc lãnh đạo/admin
    const isUploader = attachment.uploadedById === user.personId;
    const isTaskOwner = attachment.task.ownerId === user.personId;
    const isLeaderOrAdmin =
      user.role === "UNIT_LEADER" ||
      user.role === "DEPARTMENT_LEADER" ||
      user.role === "SYSTEM_ADMIN";

    if (!isUploader && !isTaskOwner && !isLeaderOrAdmin) {
      return jsonError("Bạn không có quyền xóa tệp đính kèm này", 403);
    }

    // Xóa trên Storage
    const storage = await ensureAttachmentStorageReady();
    await storage.delete(attachment.storageKey);

    // Xóa trong DB
    await prisma.taskAttachment.delete({
      where: { id: attachmentId },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_ATTACHMENT_DELETE",
      resourceType: "TaskAttachment",
      resourceId: attachmentId,
      oldData: {
        taskId,
        fileName: attachment.fileName,
        storageKey: attachment.storageKey,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Đã xóa tệp đính kèm thành công",
    });
  } catch (err: any) {
    console.error("[Attachments DELETE Error]", err);
    return jsonError(err.message || "Lỗi khi xóa tệp đính kèm", 500);
  }
}

/**
 * GET /api/tasks/[taskId]/attachments/[attachmentId]/file
 *
 * Tải tệp đính kèm nhiệm vụ qua server SAU KHI kiểm tra quyền:
 *  1. Bắt buộc đăng nhập (401 nếu không).
 *  2. Kiểm tra quyền truy cập nhiệm vụ (verifyTaskAccess READ) — theo phạm vi
 *     đơn vị, chủ nhiệm và người được phân công (403 nếu không).
 *  3. Đọc nội dung tệp từ kho (service-role, bucket PRIVATE) và trả về.
 *
 * KHÔNG phát URL công khai; không lộ khoá/secret ra client hay log.
 * Mọi lượt tải (kể cả bị từ chối) đều ghi AuditEvent.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { verifyTaskAccess, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  ensureAttachmentStorageReady,
  StorageConfigError,
} from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Chỉ cho phép hiển thị trực tiếp các loại tệp an toàn; khác ⇒ tải về. */
const INLINE_MIME = /^(image\/|application\/pdf|text\/|video\/)/i;

function sanitizeFileName(name: string): string {
  return (name || "tep-dinh-kem")
    .replace(/[\r\n"\\]/g, "_")
    .replace(/[^\w.\-\u00C0-\u024F ]/g, "_")
    .slice(0, 120) || "tep-dinh-kem";
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập tài liệu đính kèm", 401);
    }

    const { id: taskId, attachmentId } = await params;
    if (!taskId || !attachmentId) {
      return jsonError("Thiếu mã nhiệm vụ hoặc mã tệp đính kèm", 400);
    }

    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        taskId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        storageKey: true,
      },
    });
    if (!attachment) {
      return jsonError("Tệp đính kèm không tồn tại hoặc đã bị xóa", 404);
    }
    // Chống IDOR: tệp phải thuộc đúng nhiệm vụ trong URL
    if (attachment.taskId !== taskId) {
      return jsonError("Tệp đính kèm không thuộc nhiệm vụ này", 404);
    }

    const access = await verifyTaskAccess(user, taskId, "READ");
    if (!access.allowed) {
      await recordAuditEvent({
        actorId: user.id,
        action: "TASK_ATTACHMENT_ACCESS_DENIED",
        resourceType: "TaskAttachment",
        resourceId: attachmentId,
        ipAddress:
          req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
        newData: {
          taskId,
          fileName: attachment.fileName,
          operation: "DOWNLOAD",
          reason: access.reason,
        },
      });
      return jsonError(access.reason || "Bạn không có quyền truy cập tệp đính kèm này", 403);
    }

    let storage: Awaited<ReturnType<typeof ensureAttachmentStorageReady>>;
    try {
      storage = await ensureAttachmentStorageReady();
    } catch (err: any) {
      if (err instanceof StorageConfigError) {
        console.error("[TaskAttachment] cấu hình kho tệp:", err.message);
        return jsonError(
          "Kho tệp đính kèm chưa được cấu hình đúng trên máy chủ (cần khóa service-role và bucket PRIVATE)",
          503
        );
      }
      throw err;
    }

    const buffer = await storage.download(attachment.storageKey);
    if (!buffer) {
      return jsonError("Không tìm thấy tệp trong kho lưu trữ", 404);
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "TASK_ATTACHMENT_DOWNLOAD",
      resourceType: "TaskAttachment",
      resourceId: attachmentId,
      ipAddress:
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      newData: {
        taskId,
        fileName: attachment.fileName,
        bytes: buffer.length,
      },
    });

    const mime = attachment.mimeType || "application/octet-stream";
    const disposition = INLINE_MIME.test(mime) ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${disposition}; filename="${sanitizeFileName(
          attachment.fileName
        )}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err: any) {
    if (err instanceof StorageConfigError) {
      return jsonError(err.message, 503);
    }
    console.error("[TaskAttachment] lỗi tải tệp:", err?.message || err);
    return jsonError("Lỗi khi tải tệp đính kèm", 500);
  }
}

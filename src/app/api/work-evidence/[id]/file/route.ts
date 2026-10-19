import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getEvidenceStorageProvider } from "@/server/storage";
import { checkWorkItemAccess } from "@/server/work-access";
import { contentDispositionAttachment, sanitizeEvidenceFileName } from "@/server/work-evidence";

export const runtime = "nodejs";

/**
 * GET /api/work-evidence/[id]/file
 * Tải tệp minh chứng qua server sau khi kiểm tra quyền; không phát URL công khai.
 * Mọi lượt tải (kể cả bị từ chối) đều ghi AuditEvent.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { id } = await params;
    const evidence = await prisma.workEvidence.findUnique({
      where: { id },
      select: {
        id: true,
        workItemId: true,
        fileName: true,
        mimeType: true,
        storageKey: true,
        fileSize: true,
      },
    });
    if (!evidence) return jsonError("Minh chứng không tồn tại hoặc đã bị xóa", 404);

    const access = await checkWorkItemAccess(user, evidence.workItemId);
    if (!access.allowed || !access.item) {
      await recordAuditEvent({
        actorId: user.id,
        action: "EVIDENCE_ACCESS_DENIED",
        resourceType: "WorkEvidence",
        resourceId: id,
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
        newData: { reason: access.reason, operation: "DOWNLOAD", workItemId: evidence.workItemId },
      });
      return jsonError(access.reason || "Bạn không có quyền tải minh chứng này", 403);
    }

    const storage = getEvidenceStorageProvider();
    const buffer = await storage.download(evidence.storageKey);
    if (!buffer) {
      return jsonError("Không tìm thấy tệp minh chứng trong kho lưu trữ", 404);
    }

    await recordAuditEvent({
      actorId: user.id,
      action: "EVIDENCE_DOWNLOAD",
      resourceType: "WorkEvidence",
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      newData: {
        workItemId: evidence.workItemId,
        fileName: evidence.fileName,
        bytes: buffer.length,
        scope: access.scope,
      },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": evidence.mimeType || "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": contentDispositionAttachment(
          sanitizeEvidenceFileName(evidence.fileName)
        ),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải tệp minh chứng: " + error.message, 500);
  }
}

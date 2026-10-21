import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  ensureEvidenceStorageReady,
  EvidenceStorageConfigError,
} from "@/server/storage";
import { checkWorkItemAccess, isPeriodLocked } from "@/server/work-access";
import { isWorkItemReviewLocked } from "@/server/work-item-review";

export const runtime = "nodejs";

/**
 * DELETE /api/work-evidence/[id]
 * Xóa minh chứng: người tải lên hoặc lãnh đạo trong phạm vi. Kỳ đã chốt thì khóa.
 * Ghi AuditEvent trước khi xóa tệp khỏi kho lưu trữ.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
        fileSize: true,
        storageKey: true,
        uploadedById: true,
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
        newData: { reason: access.reason, operation: "DELETE" },
      });
      return jsonError(access.reason || "Bạn không có quyền xóa minh chứng này", 403);
    }
    if (isPeriodLocked(access.item)) {
      return jsonError(
        `Kỳ "${access.item.period?.title || ""}" đã chốt số liệu — không thể xóa minh chứng`,
        423
      );
    }
    // V3.0.1 — R3-C: đã gửi lãnh đạo / đã xác nhận ⇒ khoá bộ minh chứng.
    if (isWorkItemReviewLocked(access.item)) {
      return jsonError(
        access.item.reviewState === "CONFIRMED"
          ? "Công việc đã được lãnh đạo xác nhận — không thể xóa minh chứng. Vui lòng gửi đề nghị điều chỉnh."
          : "Công việc đang chờ lãnh đạo xác nhận — không thể xóa minh chứng lúc này.",
        409
      );
    }
    const canDelete = evidence.uploadedById === user.personId || access.scope === "LEADER";
    if (!canDelete) {
      return jsonError("Chỉ người tải lên hoặc lãnh đạo trong phạm vi được xóa minh chứng này", 403);
    }

    let storage: Awaited<ReturnType<typeof ensureEvidenceStorageReady>>;
    try {
      storage = await ensureEvidenceStorageReady();
    } catch (err: any) {
      if (err instanceof EvidenceStorageConfigError) {
        console.error("[WorkEvidence] storage config:", err.message);
        return jsonError("Kho minh chứng riêng tư chưa được cấu hình đúng trên máy chủ", 503);
      }
      throw err;
    }
    const storageDeleted = await storage.delete(evidence.storageKey);

    await prisma.workEvidence.delete({ where: { id } });

    await recordAuditEvent({
      actorId: user.id,
      action: "EVIDENCE_DELETE",
      resourceType: "WorkEvidence",
      resourceId: id,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      oldData: {
        workItemId: evidence.workItemId,
        fileName: evidence.fileName,
        fileSize: evidence.fileSize,
        uploadedById: evidence.uploadedById,
        storageDeleted,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Đã xóa minh chứng",
      storageDeleted,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa minh chứng: " + error.message, 500);
  }
}

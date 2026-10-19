import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getEvidenceStorageProvider } from "@/server/storage";
import { checkWorkItemAccess, isPeriodLocked } from "@/server/work-access";
import {
  contentDispositionAttachment,
  sanitizeEvidenceFileName,
  validateEvidenceFile,
} from "@/server/work-evidence";

export const runtime = "nodejs";

/**
 * GET /api/work-evidence?workItemId=...
 * Danh sách metadata minh chứng của một đầu việc (không kèm URL công khai).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const workItemId = searchParams.get("workItemId");
    if (!workItemId) return jsonError("Thiếu mã đầu việc", 400);

    const access = await checkWorkItemAccess(user, workItemId);
    if (!access.allowed || !access.item) {
      await recordAuditEvent({
        actorId: user.id,
        action: "EVIDENCE_ACCESS_DENIED",
        resourceType: "PersonalWorkItem",
        resourceId: workItemId,
        newData: { reason: access.reason, operation: "LIST" },
      });
      return jsonError(access.reason || "Bạn không có quyền xem minh chứng này", 403);
    }

    const evidences = await prisma.workEvidence.findMany({
      where: { workItemId },
      include: { uploadedBy: { select: { id: true, fullName: true, code: true } } },
      orderBy: { createdAt: "asc" },
    });
    const locked = isPeriodLocked(access.item);

    return NextResponse.json({
      success: true,
      data: evidences.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        fileSize: e.fileSize,
        mimeType: e.mimeType,
        note: e.note,
        createdAt: e.createdAt,
        uploadedBy: e.uploadedBy,
        canDelete: !locked && (e.uploadedById === user.personId || access.scope === "LEADER"),
      })),
      meta: {
        workItemId,
        canUpload: !locked,
        periodLocked: locked,
        scope: access.scope,
        maxFileMb: Math.round((Number(process.env.WORK_EVIDENCE_MAX_MB || 20) || 20)),
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh sách minh chứng: " + error.message, 500);
  }
}

/**
 * POST /api/work-evidence (multipart)
 * fields: workItemId (bắt buộc), file (bắt buộc), note, monthlyResultId (tùy chọn)
 * Quyền: chủ sở hữu đầu việc hoặc lãnh đạo trong phạm vi; kỳ đã chốt thì khóa.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const form = await req.formData();
    const workItemId = String(form.get("workItemId") || "");
    const file = form.get("file");
    const noteRaw = String(form.get("note") || "").trim();
    const monthlyResultId = String(form.get("monthlyResultId") || "") || null;

    if (!workItemId) return jsonError("Thiếu mã đầu việc cần gắn minh chứng", 400);

    const access = await checkWorkItemAccess(user, workItemId);
    if (!access.allowed || !access.item) {
      await recordAuditEvent({
        actorId: user.id,
        action: "EVIDENCE_ACCESS_DENIED",
        resourceType: "PersonalWorkItem",
        resourceId: workItemId,
        newData: { reason: access.reason, operation: "UPLOAD" },
      });
      return jsonError(access.reason || "Bạn không có quyền gắn minh chứng cho đầu việc này", 403);
    }
    if (isPeriodLocked(access.item)) {
      return jsonError(
        `Kỳ "${access.item.period?.title || ""}" đã chốt số liệu — không thể thêm minh chứng`,
        423
      );
    }
    if (!file || typeof (file as any).arrayBuffer !== "function") {
      return jsonError("Vui lòng chọn tệp minh chứng", 400);
    }

    const upload = file as File;
    const check = validateEvidenceFile(upload.name, upload.size);
    if (!check.ok) return jsonError(check.message, 400);
    if (noteRaw.length > 500) return jsonError("Ghi chú tối đa 500 ký tự", 400);

    if (monthlyResultId) {
      const mr = await prisma.monthlyWorkResult.findUnique({
        where: { id: monthlyResultId },
        select: { id: true, personId: true, workItemId: true, title: true },
      });
      if (!mr || mr.personId !== access.item.personId) {
        return jsonError("Kết quả tháng không hợp lệ hoặc không thuộc cán bộ này", 400);
      }
      if (mr.workItemId && mr.workItemId !== workItemId) {
        return jsonError("Kết quả tháng đã gắn với đầu việc khác — kiểm tra lại", 400);
      }
    }

    const buffer = Buffer.from(await upload.arrayBuffer());
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const storage = getEvidenceStorageProvider();

    let uploaded;
    try {
      uploaded = await storage.upload(
        buffer,
        sanitizeEvidenceFileName(upload.name),
        check.mimeType,
        `evidence/${workItemId}`
      );
    } catch (err: any) {
      console.error("[WorkEvidence] upload storage error:", err?.message);
      return jsonError(
        "Không lưu được tệp minh chứng vào kho lưu trữ. Vui lòng thử lại hoặc báo quản trị hệ thống.",
        502
      );
    }

    const evidence = await prisma.workEvidence.create({
      data: {
        workItemId,
        monthlyResultId,
        fileName: sanitizeEvidenceFileName(upload.name),
        fileSize: buffer.length,
        mimeType: check.mimeType,
        storageKey: uploaded.key,
        fileUrl: null, // Không lưu/phát URL công khai
        checksum,
        note: noteRaw || null,
        uploadedById: user.personId,
      },
      include: { uploadedBy: { select: { id: true, fullName: true, code: true } } },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "EVIDENCE_UPLOAD",
      resourceType: "WorkEvidence",
      resourceId: evidence.id,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      newData: {
        workItemId,
        personId: access.item.personId,
        fileName: evidence.fileName,
        fileSize: evidence.fileSize,
        mimeType: evidence.mimeType,
        checksum,
        monthlyResultId,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Đã tải minh chứng lên hệ thống",
        data: {
          id: evidence.id,
          fileName: evidence.fileName,
          fileSize: evidence.fileSize,
          mimeType: evidence.mimeType,
          note: evidence.note,
          createdAt: evidence.createdAt,
          uploadedBy: evidence.uploadedBy,
          canDelete: true,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi tải minh chứng: " + error.message, 500);
  }
}

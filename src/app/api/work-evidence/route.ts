import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  ensureEvidenceStorageReady,
  EvidenceStorageConfigError,
} from "@/server/storage";
import { checkWorkItemAccess, isPeriodLocked } from "@/server/work-access";
import {
  contentDispositionAttachment,
  getMaxEvidenceBytes,
  sanitizeEvidenceFileName,
  validateEvidenceContent,
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
        maxFileMb: Math.round((Number(process.env.WORK_EVIDENCE_MAX_MB || 4) || 4)),
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

    // Chặn sớm theo Content-Length trước khi đọc multipart: tránh 500 khó hiểu
    // khi tệp vượt giới hạn và tránh tốn bộ nhớ. Biên 512 KB cho phần header multipart.
    const maxEvidenceBytes = getMaxEvidenceBytes();
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > maxEvidenceBytes + 512 * 1024) {
      return jsonError(
        `Tệp vượt quá giới hạn ${Math.round(maxEvidenceBytes / 1024 / 1024)} MB`,
        413
      );
    }

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError(
        "Không đọc được dữ liệu tải lên (multipart lỗi hoặc tệp vượt giới hạn xử lý)",
        413
      );
    }
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
    if (upload.size > maxEvidenceBytes) {
      return jsonError(
        `Tệp vượt quá giới hạn ${Math.round(maxEvidenceBytes / 1024 / 1024)} MB`,
        413
      );
    }
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
    if (buffer.length > maxEvidenceBytes) {
      return jsonError(
        `Tệp vượt quá giới hạn ${Math.round(maxEvidenceBytes / 1024 / 1024)} MB`,
        413
      );
    }
    // Kiểm tra nội dung thực (magic bytes), không tin Content-Type/đuôi tệp.
    const contentCheck = validateEvidenceContent(buffer, upload.name);
    if (!contentCheck.ok) return jsonError(contentCheck.message, 400);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const safeFileName = sanitizeEvidenceFileName(upload.name);

    let storage: Awaited<ReturnType<typeof ensureEvidenceStorageReady>>;
    try {
      // Fail-closed: thiếu khóa server / bucket chưa private / chưa tồn tại → 503.
      storage = await ensureEvidenceStorageReady();
    } catch (err: any) {
      if (err instanceof EvidenceStorageConfigError) {
        console.error("[WorkEvidence] storage config:", err.message);
        return jsonError(
          "Kho minh chứng riêng tư chưa được cấu hình đúng trên máy chủ. Vui lòng báo quản trị hệ thống.",
          503
        );
      }
      throw err;
    }

    let uploaded;
    try {
      uploaded = await storage.upload(
        buffer,
        safeFileName,
        contentCheck.mimeType,
        `evidence/${workItemId}`
      );
    } catch (err: any) {
      console.error("[WorkEvidence] upload storage error:", err?.message);
      return jsonError(
        "Không lưu được tệp minh chứng vào kho lưu trữ. Vui lòng thử lại hoặc báo quản trị hệ thống.",
        502
      );
    }

    const evidence = await prisma.workEvidence
      .create({
        data: {
          workItemId,
          monthlyResultId,
          fileName: safeFileName,
          fileSize: buffer.length,
          mimeType: contentCheck.mimeType,
          storageKey: uploaded.key,
          fileUrl: null, // Không lưu/phát URL công khai
          checksum,
          note: noteRaw || null,
          uploadedById: user.personId,
        },
        include: { uploadedBy: { select: { id: true, fullName: true, code: true } } },
      })
      .catch(async (err: any) => {
        // Không để tệp mồ côi khi ghi metadata thất bại.
        await storage.delete(uploaded.key).catch(() => false);
        console.error("[WorkEvidence] metadata create error:", err?.message);
        return null;
      });
    if (!evidence) {
      return jsonError("Không ghi được thông tin minh chứng — tệp chưa được lưu", 500);
    }

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

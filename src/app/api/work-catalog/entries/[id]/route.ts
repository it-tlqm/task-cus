import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

/**
 * PATCH /api/work-catalog/entries/[id]
 * Bật/tắt một đầu việc trong phiên bản ĐANG ÁP DỤNG (không sửa phiên bản cũ).
 * Quyền: catalog.manage.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền quản lý danh mục công việc", 403);
    }

    const { id } = await params;
    const body = await req.json();
    const status = String(body.status || "").toUpperCase();
    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return jsonError("Trạng thái chỉ nhận ACTIVE hoặc INACTIVE", 400);
    }

    const entry = await prisma.workCatalogEntry.findUnique({
      where: { id },
      include: { version: { select: { id: true, status: true, code: true } } },
    });
    if (!entry) return jsonError("Đầu việc không tồn tại trong danh mục", 404);
    if (entry.version.status !== "ACTIVE") {
      return jsonError(
        "Chỉ được thay đổi đầu việc trong phiên bản đang áp dụng — phiên bản cũ giữ nguyên để đối soát",
        409
      );
    }

    const updated = await prisma.workCatalogEntry.update({
      where: { id },
      data: { status },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "WORK_CATALOG_ENTRY_UPDATE",
      resourceType: "WorkCatalogEntry",
      resourceId: id,
      oldData: { status: entry.status, title: entry.title, department: entry.department },
      newData: { status: updated.status, versionCode: entry.version.code },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật đầu việc danh mục: " + error.message, 500);
  }
}

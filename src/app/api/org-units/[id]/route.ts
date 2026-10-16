import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

function canManageOrg(user: any): boolean {
  return (
    checkPermission(user, "org.manage") ||
    checkPermission(user, "users.manage") ||
    user.role === "UNIT_LEADER" ||
    user.role === "SYSTEM_ADMIN"
  );
}

/** PATCH /api/org-units/[id] — đổi tên hiển thị đơn vị (mã code bất biến để bảo toàn liên kết) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManageOrg(user)) return jsonError("Bạn không có quyền quản trị cơ cấu tổ chức", 403);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { name } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return jsonError("Tên đơn vị không được để trống", 400);
    }
    if (name.trim().length > 120) {
      return jsonError("Tên đơn vị không được vượt quá 120 ký tự", 400);
    }

    const unit = await prisma.orgUnit.findUnique({ where: { id } });
    if (!unit) return jsonError("Không tìm thấy đơn vị", 404);

    const updated = await prisma.orgUnit.update({
      where: { id },
      data: { name: name.trim() },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "ORG_UNIT_RENAME",
      resourceType: "OrgUnit",
      resourceId: id,
      oldData: { name: unit.name },
      newData: { name: updated.name },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi đổi tên đơn vị: " + error.message, 500);
  }
}

/** DELETE /api/org-units/[id] — xóa đơn vị trống (chặn khi còn dữ liệu liên quan) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManageOrg(user)) return jsonError("Bạn không có quyền quản trị cơ cấu tổ chức", 403);

    const { id } = await params;
    const unit = await prisma.orgUnit.findUnique({ where: { id } });
    if (!unit) return jsonError("Không tìm thấy đơn vị", 404);

    if (!unit.parentId) {
      return jsonError("Không được xóa đơn vị gốc của cơ cấu tổ chức", 400);
    }

    const [children, assignments, tasks, plans, snapshots] = await Promise.all([
      prisma.orgUnit.count({ where: { parentId: id } }),
      prisma.personAssignment.count({ where: { unitId: id } }),
      prisma.task.count({ where: { unitId: id } }),
      prisma.plan.count({ where: { unitId: id } }),
      prisma.reportSnapshot.count({ where: { scopeUnitId: id } }),
    ]);

    const blockers: string[] = [];
    if (children > 0) blockers.push(`${children} đơn vị trực thuộc`);
    if (assignments > 0) blockers.push(`${assignments} phân công cán bộ`);
    if (tasks > 0) blockers.push(`${tasks} nhiệm vụ`);
    if (plans > 0) blockers.push(`${plans} kế hoạch`);
    if (snapshots > 0) blockers.push(`${snapshots} bản chốt kỳ`);
    if (blockers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không thể xóa "${unit.name}" vì còn dữ liệu liên quan: ${blockers.join(", ")}. Hãy điều chuyển/xử lý xong trước.`,
        },
        { status: 409 }
      );
    }

    await prisma.orgUnit.delete({ where: { id } });

    await recordAuditEvent({
      actorId: user.id,
      action: "ORG_UNIT_DELETE",
      resourceType: "OrgUnit",
      resourceId: id,
      oldData: { code: unit.code, name: unit.name },
    });

    return NextResponse.json({ success: true, message: `Đã xóa đơn vị "${unit.name}"` });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa đơn vị: " + error.message, 500);
  }
}

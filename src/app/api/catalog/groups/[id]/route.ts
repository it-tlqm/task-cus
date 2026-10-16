import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

function canManage(user: any): boolean {
  return checkPermission(user, "catalog.manage");
}

/** PATCH /api/catalog/groups/[id] — đổi tên/mô tả nhóm (mã code bất biến) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManage(user)) return jsonError("Bạn không có quyền quản trị danh mục", 403);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { name, description } = body;

    const group = await prisma.activityGroup.findUnique({ where: { id } });
    if (!group) return jsonError("Không tìm thấy nhóm nghiệp vụ", 404);

    const updateData: any = {};
    if (name !== undefined) {
      if (!name || typeof name !== "string" || !name.trim()) {
        return jsonError("Tên nhóm không được để trống", 400);
      }
      if (name.trim().length > 120) {
        return jsonError("Tên nhóm không được vượt quá 120 ký tự", 400);
      }
      updateData.name = name.trim();
    }
    if (description !== undefined) {
      updateData.description = typeof description === "string" && description.trim() ? description.trim() : null;
    }

    const updated = await prisma.activityGroup.update({ where: { id }, data: updateData });

    await recordAuditEvent({
      actorId: user.id,
      action: "CATALOG_GROUP_RENAME",
      resourceType: "ActivityGroup",
      resourceId: id,
      oldData: { name: group.name },
      newData: { name: updated.name },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật nhóm: " + error.message, 500);
  }
}

/** DELETE /api/catalog/groups/[id] — xóa nhóm trống (chặn khi còn hoạt động mẫu) */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManage(user)) return jsonError("Bạn không có quyền quản trị danh mục", 403);

    const { id } = await params;
    const group = await prisma.activityGroup.findUnique({ where: { id } });
    if (!group) return jsonError("Không tìm thấy nhóm nghiệp vụ", 404);

    const templateCount = await prisma.activityTemplate.count({ where: { groupId: id } });
    if (templateCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không thể xóa nhóm "${group.name}" vì còn ${templateCount} hoạt động mẫu. Hãy chuyển hoặc ngừng áp dụng các mẫu trước.`,
        },
        { status: 409 }
      );
    }

    await prisma.activityGroup.delete({ where: { id } });

    await recordAuditEvent({
      actorId: user.id,
      action: "CATALOG_GROUP_DELETE",
      resourceType: "ActivityGroup",
      resourceId: id,
      oldData: { code: group.code, name: group.name },
    });

    return NextResponse.json({ success: true, message: `Đã xóa nhóm "${group.name}"` });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa nhóm: " + error.message, 500);
  }
}

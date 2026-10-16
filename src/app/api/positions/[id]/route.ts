import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

function canManage(user: any): boolean {
  return (
    checkPermission(user, "org.manage") ||
    checkPermission(user, "users.manage") ||
    user.role === "UNIT_LEADER" ||
    user.role === "SYSTEM_ADMIN"
  );
}

/** PATCH /api/positions/[id] — đổi tên/mô tả/trạng thái chức vụ */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManage(user)) return jsonError("Bạn không có quyền quản trị danh mục chức vụ", 403);

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { title, description, status } = body;

    const position = await prisma.position.findUnique({ where: { id } });
    if (!position) return jsonError("Không tìm thấy chức vụ", 404);

    const updateData: any = {};
    if (title !== undefined) {
      if (!title || typeof title !== "string" || !title.trim()) {
        return jsonError("Tên chức vụ không được để trống", 400);
      }
      if (title.trim().length > 120) {
        return jsonError("Tên chức vụ không được vượt quá 120 ký tự", 400);
      }
      updateData.title = title.trim();
    }
    if (description !== undefined) {
      updateData.description =
        typeof description === "string" && description.trim() ? description.trim() : null;
    }
    if (status !== undefined) {
      if (status !== "ACTIVE" && status !== "INACTIVE") {
        return jsonError("Trạng thái chỉ chấp nhận ACTIVE hoặc INACTIVE", 400);
      }
      if (status === "INACTIVE") {
        const inUse = await prisma.personAssignment.count({ where: { positionId: id } });
        if (inUse > 0) {
          return NextResponse.json(
            {
              success: false,
              error: `Không thể ngừng dùng chức vụ "${position.title}" vì còn ${inUse} phân công đang sử dụng. Hãy điều chuyển cán bộ sang chức vụ khác trước.`,
            },
            { status: 409 }
          );
        }
      }
      updateData.status = status;
    }

    const updated = await prisma.position.update({ where: { id }, data: updateData });

    await recordAuditEvent({
      actorId: user.id,
      action: "POSITION_UPDATE",
      resourceType: "Position",
      resourceId: id,
      oldData: { title: position.title, status: position.status },
      newData: { title: updated.title, status: updated.status },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật chức vụ: " + error.message, 500);
  }
}

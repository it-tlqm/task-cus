import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

/**
 * Xử lý phản hồi (chỉ lãnh đạo đơn vị / quản trị kỹ thuật):
 *  - action "resolve": đánh dấu đã xử lý (kèm ghi chú tùy chọn)
 *  - action "reopen": mở lại khi còn vướng
 *  - action "note": chỉ lưu ghi chú xử lý
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!(user.role === "UNIT_LEADER" || checkPermission(user, "audit.view"))) {
      return jsonError("Chỉ lãnh đạo đơn vị hoặc quản trị kỹ thuật được xử lý phản hồi", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body?.action;
    const adminNote =
      typeof body?.adminNote === "string" ? body.adminNote.trim().slice(0, 500) : undefined;

    const feedback = await prisma.feedback.findUnique({ where: { id } });
    if (!feedback) return jsonError("Không tìm thấy phản hồi", 404);

    if (action === "resolve") {
      const updated = await prisma.feedback.update({
        where: { id },
        data: {
          status: "DONE",
          resolvedAt: new Date(),
          resolvedById: user.personId,
          ...(adminNote !== undefined ? { adminNote } : {}),
        },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "FEEDBACK_RESOLVED",
        resourceType: "Feedback",
        resourceId: id,
        newData: { adminNote: adminNote ?? null },
      });
      return NextResponse.json({
        success: true,
        message: "Đã đánh dấu xử lý xong",
        data: { id: updated.id, status: updated.status },
      });
    }

    if (action === "reopen") {
      const updated = await prisma.feedback.update({
        where: { id },
        data: { status: "NEW", resolvedAt: null, resolvedById: null },
      });
      await recordAuditEvent({
        actorId: user.id,
        action: "FEEDBACK_REOPENED",
        resourceType: "Feedback",
        resourceId: id,
      });
      return NextResponse.json({
        success: true,
        message: "Đã mở lại phản hồi",
        data: { id: updated.id, status: updated.status },
      });
    }

    if (action === "note") {
      if (adminNote === undefined) return jsonError("Thiếu nội dung ghi chú", 400);
      await prisma.feedback.update({ where: { id }, data: { adminNote } });
      await recordAuditEvent({
        actorId: user.id,
        action: "FEEDBACK_NOTED",
        resourceType: "Feedback",
        resourceId: id,
      });
      return NextResponse.json({ success: true, message: "Đã lưu ghi chú" });
    }

    return jsonError("Hành động không hợp lệ", 400);
  } catch (error: any) {
    return jsonError("Lỗi khi xử lý phản hồi: " + error.message, 500);
  }
}

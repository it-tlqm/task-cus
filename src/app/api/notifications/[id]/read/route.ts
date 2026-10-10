import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập", 401);
    }

    const { id: notificationId } = await params;

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return jsonError("Thông báo không tồn tại", 404);
    }

    // IDOR Protection: Chỉ người nhận mới có quyền đánh dấu đã đọc
    if (notification.recipientId !== user.personId) {
      return jsonError("Bạn không có quyền thao tác trên thông báo này (Scope Guard Violation)", 403);
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Đã đánh dấu thông báo là đã đọc",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error in PATCH /api/notifications/[id]/read:", error);
    return jsonError("Lỗi hệ thống khi cập nhật thông báo: " + error.message, 500);
  }
}

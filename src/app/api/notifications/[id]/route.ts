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
    const body = await req.json();

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      return jsonError("Thông báo không tồn tại", 404);
    }

    // IDOR Protection: Chỉ người nhận mới có quyền cập nhật
    if (notification.recipientId !== user.personId) {
      return jsonError("Bạn không có quyền thao tác trên thông báo này (Scope Guard Violation)", 403);
    }

    const updateData: any = {};
    if (body.isRead !== undefined) {
      updateData.isRead = Boolean(body.isRead);
      if (body.isRead) {
        updateData.readAt = new Date();
      }
    }
    if (body.isDismissed !== undefined) {
      updateData.isDismissed = Boolean(body.isDismissed);
      if (body.isDismissed) {
        updateData.dismissedAt = new Date();
      }
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      message: "Đã cập nhật thông báo thành công",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error in PATCH /api/notifications/[id]:", error);
    return jsonError("Lỗi hệ thống khi cập nhật thông báo: " + error.message, 500);
  }
}

export async function DELETE(
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

    // IDOR Protection: Chỉ người nhận mới có quyền ẩn/xóa
    if (notification.recipientId !== user.personId) {
      return jsonError("Bạn không có quyền thao tác trên thông báo này (Scope Guard Violation)", 403);
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        isDismissed: true,
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Đã ẩn thông báo khỏi danh sách",
      data: updated,
    });
  } catch (error: any) {
    console.error("Error in DELETE /api/notifications/[id]:", error);
    return jsonError("Lỗi hệ thống khi xóa thông báo: " + error.message, 500);
  }
}

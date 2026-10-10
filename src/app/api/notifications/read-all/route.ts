import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập", 401);
    }

    if (!user.personId) {
      return jsonError("Tài khoản chưa được liên kết hồ sơ cán bộ", 400);
    }

    const result = await prisma.notification.updateMany({
      where: {
        recipientId: user.personId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Đã đánh dấu tất cả thông báo là đã đọc thành công",
      count: result.count,
    });
  } catch (error: any) {
    console.error("Error in POST /api/notifications/read-all:", error);
    return jsonError("Lỗi hệ thống khi cập nhật thông báo: " + error.message, 500);
  }
}

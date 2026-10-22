import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, verifyPassword, hashPassword } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { prisma } from "@/server/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getCurrentSession(req);
    if (!session) {
      return jsonError("Phiên làm việc đã hết hạn hoặc không hợp lệ", 401);
    }

    const body = await req.json();
    const { currentPassword, newPassword, confirmPassword } = body;

    if (!currentPassword || !newPassword) {
      return jsonError("Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới", 400);
    }

    if (newPassword.length < 8) {
      return jsonError("Mật khẩu mới phải có độ dài tối thiểu 8 ký tự", 400);
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return jsonError("Xác nhận mật khẩu mới không trùng khớp", 400);
    }

    const account = await prisma.account.findUnique({
      where: { id: session.id },
    });

    if (!account) {
      return jsonError("Không tìm thấy thông tin tài khoản", 404);
    }

    const isValidCurrent = await verifyPassword(currentPassword, account.passwordHash);
    if (!isValidCurrent) {
      return jsonError("Mật khẩu hiện tại không chính xác", 400);
    }

    const newHash = await hashPassword(newPassword);
    await prisma.account.update({
      where: { id: account.id },
      data: { passwordHash: newHash, mustChangePassword: false },
    });

    // Ghi vết kiểm toán
    await prisma.auditEvent.create({
      data: {
        actorId: account.id,
        action: "PASSWORD_CHANGED",
        resourceType: "Account",
        resourceId: account.id,
        newData: {
          username: account.username,
          timestamp: new Date().toISOString(),
        },
      },
    });

    const res = NextResponse.json({
      success: true,
      message: "Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.",
      reauthRequired: true,
    });
    // Vô hiệu phiên cũ (token đã kèm cờ bắt buộc đổi mật khẩu) → buộc đăng nhập lại.
    res.cookies.delete("token");
    return res;
  } catch (error: any) {
    return jsonError("Lỗi hệ thống khi đổi mật khẩu: " + error.message, 500);
  }
}

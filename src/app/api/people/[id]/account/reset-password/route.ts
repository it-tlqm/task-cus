import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest, hashPassword } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage =
      checkPermission(user, "users.manage") ||
      user.role === "UNIT_LEADER" ||
      user.role === "SYSTEM_ADMIN";

    if (!canManage) {
      return jsonError("Bạn không có quyền đặt lại mật khẩu tài khoản", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { newPassword } = body;

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
      return jsonError("Mật khẩu mới phải có ít nhất 6 ký tự", 400);
    }

    const person = await prisma.person.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!person || !person.account) {
      return jsonError("Không tìm thấy tài khoản liên kết với cán bộ này để đặt lại mật khẩu", 404);
    }

    // Băm mật khẩu bằng bcrypt
    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: person.account!.id },
        data: { passwordHash },
      });

      // Ghi nhật ký kiểm toán (KHÔNG ghi mật khẩu hoặc hash)
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "ACCOUNT_PASSWORD_RESET",
          resourceType: "Account",
          resourceId: person.account!.id,
          newData: {
            username: person.account!.username,
            reason: "Đặt lại mật khẩu quản trị",
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Đã đặt lại mật khẩu cho tài khoản "${person.account.username}" thành công`,
    });
  } catch (error: any) {
    console.error("POST /api/people/[id]/account/reset-password error:", error);
    return jsonError("Lỗi hệ thống khi đặt lại mật khẩu: " + error.message, 500);
  }
}

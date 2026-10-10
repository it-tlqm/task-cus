import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";

export async function PATCH(
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
      return jsonError("Bạn không có quyền thay đổi trạng thái tài khoản", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { status, reason } = body;

    const validStatuses = ["ACTIVE", "DISABLED", "LOCKED"];
    if (!status || !validStatuses.includes(status)) {
      return jsonError("Trạng thái tài khoản không hợp lệ (Chỉ chấp nhận: ACTIVE, DISABLED, LOCKED)", 400);
    }

    // 1. Kiểm tra tài khoản tồn tại
    const person = await prisma.person.findUnique({
      where: { id },
      include: { account: true },
    });

    if (!person || !person.account) {
      return jsonError("Không tìm thấy tài khoản liên kết với cán bộ này", 404);
    }

    // 2. Chống tự khóa tài khoản của chính mình (Anti-self Lockout)
    if (person.account.id === user.id) {
      return jsonError("Không thể tự vô hiệu hóa hoặc khóa tài khoản của chính mình", 400);
    }

    // 3. Thực thi cập nhật Transaction
    const updatedAccount = await prisma.$transaction(async (tx) => {
      const updated = await tx.account.update({
        where: { id: person.account!.id },
        data: { status },
      });

      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "ACCOUNT_STATUS_CHANGE",
          resourceType: "Account",
          resourceId: person.account!.id,
          oldData: {
            username: person.account!.username,
            status: person.account!.status,
          },
          newData: {
            username: person.account!.username,
            status,
            reason: reason || null,
          },
        },
      });

      return updated;
    });

    const statusText =
      status === "ACTIVE"
        ? "kích hoạt"
        : status === "DISABLED"
        ? "vô hiệu hóa"
        : "tạm khóa";

    return NextResponse.json({
      success: true,
      data: {
        id: updatedAccount.id,
        username: updatedAccount.username,
        status: updatedAccount.status,
      },
      message: `Đã ${statusText} tài khoản "${updatedAccount.username}" thành công. Các phiên làm việc hiện tại sẽ áp dụng trạng thái mới ngay lập tức.`,
    });
  } catch (error: any) {
    console.error("PATCH /api/people/[id]/account/status error:", error);
    return jsonError("Lỗi hệ thống khi cập nhật trạng thái tài khoản: " + error.message, 500);
  }
}

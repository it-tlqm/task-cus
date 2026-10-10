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
      return jsonError("Bạn không có quyền cấp tài khoản cho cán bộ công chức", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { username, password, roleCode, scopeType } = body;

    // 1. Kiểm tra hồ sơ cán bộ tồn tại trong CSDL
    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        account: true,
        assignments: {
          where: { isPrimary: true },
          include: { unit: true },
        },
      },
    });

    if (!person) {
      return jsonError("Không tìm thấy hồ sơ cán bộ tương ứng", 404);
    }

    if (person.account) {
      return jsonError(
        `Cán bộ này đã có tài khoản liên kết ("${person.account.username}"). Không thể tạo thêm tài khoản.`,
        409
      );
    }

    // 2. Kiểm tra tính hợp lệ của Tên đăng nhập (Username Validation)
    if (!username || typeof username !== "string" || !username.trim()) {
      return jsonError("Tên đăng nhập là bắt buộc", 400);
    }

    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      return jsonError(
        "Tên đăng nhập phải có từ 3 đến 30 ký tự, chỉ gồm chữ cái viết thường (a-z), chữ số (0-9) và dấu gạch dưới (_)",
        400
      );
    }

    // 3. Kiểm tra tính an toàn của Mật khẩu (Password Policy)
    // Tối thiểu 8 ký tự, bao gồm cả chữ cái và chữ số
    if (!password || typeof password !== "string" || password.length < 8 || !/^(?=.*[A-Za-z])(?=.*\d)/.test(password)) {
      return jsonError("Mật khẩu khởi tạo phải có ít nhất 8 ký tự, bao gồm cả chữ cái và chữ số để bảo đảm an toàn", 400);
    }

    // 4. Kiểm tra và ngăn chặn hành vi tự nâng quyền (Privilege Escalation Guard)
    const targetRoleCode = roleCode || "STAFF";
    if (user.role !== "UNIT_LEADER" && user.role !== "SYSTEM_ADMIN") {
      if (targetRoleCode === "UNIT_LEADER" || targetRoleCode === "SYSTEM_ADMIN") {
        return jsonError("Bạn không có thẩm quyền phân quyền Lãnh đạo đơn vị hoặc Quản trị hệ thống", 403);
      }
    }

    const role = await prisma.role.findUnique({
      where: { code: targetRoleCode },
    });
    if (!role) {
      return jsonError(`Vai trò "${targetRoleCode}" không tồn tại trong hệ thống`, 400);
    }

    // 5. Kiểm tra trùng username
    const existingAccount = await prisma.account.findUnique({
      where: { username: cleanUsername },
    });
    if (existingAccount) {
      return jsonError(`Tên đăng nhập "${cleanUsername}" đã được sử dụng`, 409);
    }

    // 6. Băm mật khẩu bằng bcrypt (Tuyệt đối không lưu plaintext)
    const passwordHash = await hashPassword(password);

    // Xác định phạm vi quyền (Scope)
    const primaryAssignment = person.assignments[0];
    const determinedScope =
      scopeType ||
      (targetRoleCode === "UNIT_LEADER" ? "ORGANIZATION" : targetRoleCode === "SYSTEM_ADMIN" ? "ORGANIZATION" : "DEPARTMENT");

    const determinedScopeUnitId =
      determinedScope === "ORGANIZATION" ? null : primaryAssignment?.unitId || null;

    // 7. Thực thi Transaction tạo tài khoản và phân quyền
    const newAccount = await prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          personId: person.id,
          username: cleanUsername,
          passwordHash,
          status: "ACTIVE",
          mfaEnabled: false,
        },
      });

      const grant = await tx.roleGrant.create({
        data: {
          accountId: account.id,
          roleId: role.id,
          scopeType: determinedScope,
          scopeUnitId: determinedScopeUnitId,
          validFrom: new Date(),
        },
        include: {
          role: true,
          scopeUnit: true,
        },
      });

      // Ghi nhật ký kiểm toán (KHÔNG ghi mật khẩu hoặc hash)
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "ACCOUNT_CREATE",
          resourceType: "Account",
          resourceId: account.id,
          newData: {
            personId: person.id,
            personName: person.fullName,
            username: cleanUsername,
            roleCode: targetRoleCode,
            scopeType: determinedScope,
            scopeUnitId: determinedScopeUnitId,
          },
        },
      });

      return {
        id: account.id,
        personId: account.personId,
        username: account.username,
        status: account.status,
        role: targetRoleCode,
        roleName: role.name,
        scopeType: determinedScope,
        scopeUnitName: grant.scopeUnit?.name || "Toàn đơn vị",
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: newAccount,
        message: `Đã khởi tạo tài khoản "${newAccount.username}" cho cán bộ ${person.fullName} thành công`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/people/[id]/account error:", error);
    if (error.code === "P2002") {
      return jsonError("Tên đăng nhập hoặc liên kết cán bộ đã bị trùng lặp", 409);
    }
    return jsonError("Lỗi hệ thống khi tạo tài khoản: " + error.message, 500);
  }
}

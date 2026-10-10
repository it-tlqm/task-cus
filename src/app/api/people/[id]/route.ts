import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập thông tin nhân sự", 401);
    }

    const { id } = await params;

    const person = await prisma.person.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { effectiveFrom: "desc" },
          include: {
            unit: true,
            position: true,
          },
        },
        account: {
          select: {
            id: true,
            username: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            roleGrants: {
              include: {
                role: true,
                scopeUnit: true,
              },
            },
          },
        },
      },
    });

    if (!person) {
      return jsonError("Không tìm thấy hồ sơ cán bộ công chức tương ứng", 404);
    }

    // Kiểm tra Scope Guard
    const authorizedUnits = await getAuthorizedUnitIds(user, true);
    const primaryAssignment = person.assignments.find((a) => a.isPrimary);
    if (
      authorizedUnits !== "ALL" &&
      primaryAssignment?.unitId &&
      !authorizedUnits.includes(primaryAssignment.unitId)
    ) {
      return jsonError("Bạn không có quyền xem hồ sơ cán bộ thuộc bộ phận này", 403);
    }

    return NextResponse.json({
      success: true,
      data: person,
    });
  } catch (error: any) {
    console.error("GET /api/people/[id] error:", error);
    return jsonError("Lỗi khi tải thông tin cán bộ: " + error.message, 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để thực hiện thao tác", 401);
    }

    const canManage =
      checkPermission(user, "org.manage") ||
      checkPermission(user, "users.manage") ||
      user.role === "UNIT_LEADER" ||
      user.role === "SYSTEM_ADMIN";

    if (!canManage) {
      return jsonError("Bạn không có quyền cập nhật hồ sơ cán bộ công chức", 403);
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { fullName, email, phone, notes, status } = body;

    // 1. Kiểm tra cán bộ tồn tại trong CSDL
    const existing = await prisma.person.findUnique({
      where: { id },
      include: { account: true, assignments: { where: { isPrimary: true } } },
    });
    if (!existing) {
      return jsonError("Không tìm thấy hồ sơ cán bộ để cập nhật", 404);
    }

    // 2. Kiểm tra dữ liệu đầu vào
    if (fullName !== undefined) {
      if (typeof fullName !== "string" || fullName.trim().length < 2) {
        return jsonError("Họ và tên cán bộ phải có ít nhất 2 ký tự", 400);
      }
    }

    const cleanEmail =
      email !== undefined
        ? email && typeof email === "string" && email.trim()
          ? email.trim().toLowerCase()
          : null
        : existing.email;

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return jsonError("Định dạng email không hợp lệ", 400);
    }

    // 3. Kiểm tra trùng email với cán bộ khác
    if (cleanEmail && cleanEmail !== existing.email) {
      const emailConflict = await prisma.person.findFirst({
        where: {
          email: cleanEmail,
          id: { not: id },
        },
      });
      if (emailConflict) {
        return jsonError(`Email "${cleanEmail}" đã được sử dụng bởi cán bộ khác`, 409);
      }
    }

    // 4. Kiểm tra trạng thái
    const validStatuses = ["ACTIVE", "INACTIVE"];
    if (status !== undefined && !validStatuses.includes(status)) {
      return jsonError("Trạng thái cán bộ chỉ có thể là ACTIVE hoặc INACTIVE", 400);
    }

    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName.trim();
    if (email !== undefined) updateData.email = cleanEmail;
    if (phone !== undefined) updateData.phone = phone ? String(phone).trim() : null;
    if (notes !== undefined) updateData.notes = notes ? String(notes).trim() : null;
    if (status !== undefined) updateData.status = status;

    // 5. Thực thi cập nhật Transaction
    const updatedPerson = await prisma.$transaction(async (tx) => {
      const updated = await tx.person.update({
        where: { id },
        data: updateData,
        include: {
          assignments: {
            where: { isPrimary: true },
            include: { unit: true, position: true },
          },
          account: true,
        },
      });

      // Nếu trạng thái cán bộ chuyển sang INACTIVE và cán bộ có tài khoản, vô hiệu hóa tài khoản ngay lập tức
      if (status === "INACTIVE" && existing.account && existing.account.status === "ACTIVE") {
        await tx.account.update({
          where: { id: existing.account.id },
          data: { status: "DISABLED" },
        });

        await tx.auditEvent.create({
          data: {
            actorId: user.id,
            action: "ACCOUNT_STATUS_CHANGE",
            resourceType: "Account",
            resourceId: existing.account.id,
            oldData: { status: existing.account.status },
            newData: { status: "DISABLED", reason: "Tự động khóa do cán bộ chuyển INACTIVE" },
          },
        });
      }

      // Ghi Audit Event
      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "PERSON_UPDATE",
          resourceType: "Person",
          resourceId: id,
          oldData: {
            fullName: existing.fullName,
            email: existing.email,
            phone: existing.phone,
            notes: existing.notes,
            status: existing.status,
          },
          newData: updateData,
        },
      });

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: updatedPerson,
      message: `Đã cập nhật thông tin cán bộ ${updatedPerson.fullName} thành công`,
    });
  } catch (error: any) {
    console.error("PUT /api/people/[id] error:", error);
    if (error.code === "P2002") {
      return jsonError("Trùng lặp dữ liệu duy nhất trong hệ thống", 409);
    }
    return jsonError("Lỗi khi cập nhật hồ sơ cán bộ: " + error.message, 500);
  }
}

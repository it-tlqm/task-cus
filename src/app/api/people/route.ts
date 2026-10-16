import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { unaccentSearchIds } from "@/server/search";
import { recordAuditEvent } from "@/server/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh sách nhân sự", 401);
    }

    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get("unitId");
    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

    // Scope check: Lãnh đạo hoặc Admin kỹ thuật được xem danh mục nhân sự toàn cơ quan để quản lý;
    // Cán bộ công chức thường chỉ xem đồng nghiệp trong đơn vị mình nếu lọc
    const authorizedUnits = await getAuthorizedUnitIds(user, true);

    const whereClause: any = {};

    // 1. Lọc theo đơn vị và kiểm tra Scope Guard
    if (unitId) {
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(unitId)) {
        return jsonError("Bạn không có quyền xem danh sách nhân sự của bộ phận này", 403);
      }
      whereClause.assignments = {
        some: { unitId, isPrimary: true },
      };
    } else if (authorizedUnits !== "ALL") {
      whereClause.assignments = {
        some: { unitId: { in: authorizedUnits }, isPrimary: true },
      };
    }

    // 2. Lọc theo trạng thái hồ sơ cán bộ (ACTIVE / INACTIVE)
    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    // 3. Tìm kiếm không dấu (Mã CC, Họ tên, Email, SĐT) + chức vụ giữ contains thường
    if (search) {
      const ids = await unaccentSearchIds("people", ["code", "full_name", "email", "phone"], search);
      const orClauses: any[] = [
        {
          assignments: {
            some: {
              isPrimary: true,
              position: { title: { contains: search, mode: "insensitive" } },
            },
          },
        },
      ];
      if (ids && ids.length > 0) {
        orClauses.unshift({ id: { in: ids } });
      }
      whereClause.OR = orClauses;
    }

    const [total, people] = await Promise.all([
      prisma.person.count({ where: whereClause }),
      prisma.person.findMany({
        where: whereClause,
        include: {
          assignments: {
            where: { isPrimary: true },
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
              roleGrants: {
                include: { role: true },
              },
            },
          },
        },
        orderBy: { code: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    // Chuẩn hóa DTO trả về cho giao diện
    const formattedPeople = people.map((p) => {
      const primaryAssignment = p.assignments[0];
      const primaryGrant = p.account?.roleGrants[0];

      return {
        id: p.id,
        code: p.code,
        fullName: p.fullName,
        email: p.email,
        phone: p.phone,
        status: p.status,
        isActive: p.status === "ACTIVE",
        notes: p.notes,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        unitId: primaryAssignment?.unitId || null,
        unitName: primaryAssignment?.unit?.name || "Chưa phân công",
        unitCode: primaryAssignment?.unit?.code || null,
        positionId: primaryAssignment?.positionId || null,
        position: primaryAssignment?.position?.title || "Công chức",
        orgUnit: primaryAssignment?.unit
          ? {
              id: primaryAssignment.unit.id,
              code: primaryAssignment.unit.code,
              name: primaryAssignment.unit.name,
            }
          : undefined,
        account: p.account
          ? {
              id: p.account.id,
              username: p.account.username,
              status: p.account.status,
              isActive: p.account.status === "ACTIVE",
              role: primaryGrant?.role?.code || "STAFF",
              roleName: primaryGrant?.role?.name || "Công chức",
              lastLoginAt: p.account.lastLoginAt,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedPeople,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error("GET /api/people error:", error);
    return jsonError("Lỗi khi tải danh sách nhân sự: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
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
      return jsonError("Bạn không có quyền thêm mới cán bộ công chức", 403);
    }

    const body = await req.json().catch(() => ({}));
    const { code, fullName, email, phone, unitId, positionId, notes } = body;

    // 1. Kiểm tra tính hợp lệ của dữ liệu đầu vào (Input Validation)
    if (!code || typeof code !== "string" || !code.trim()) {
      return jsonError("Mã cán bộ công chức là bắt buộc", 400);
    }
    if (!fullName || typeof fullName !== "string" || fullName.trim().length < 2) {
      return jsonError("Họ và tên cán bộ phải có ít nhất 2 ký tự", 400);
    }
    if (!unitId || typeof unitId !== "string") {
      return jsonError("Đơn vị / Bộ phận công tác là bắt buộc", 400);
    }

    const cleanCode = code.trim().toUpperCase();
    const cleanFullName = fullName.trim();
    const cleanEmail = email && typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    const cleanPhone = phone && typeof phone === "string" && phone.trim() ? phone.trim() : null;
    const cleanNotes = notes && typeof notes === "string" ? notes.trim() : null;

    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return jsonError("Định dạng email không hợp lệ", 400);
    }

    // 2. Kiểm tra đơn vị tồn tại trong CSDL
    const unit = await prisma.orgUnit.findUnique({
      where: { id: unitId },
      select: { id: true, name: true, status: true },
    });
    if (!unit) {
      return jsonError("Đơn vị trực thuộc không tồn tại trong hệ thống", 400);
    }
    if (unit.status !== "ACTIVE") {
      return jsonError("Đơn vị trực thuộc đã ngừng hoạt động, không thể phân công cán bộ", 400);
    }

    // 3. Kiểm tra chức vụ nếu có
    if (positionId) {
      const pos = await prisma.position.findUnique({
        where: { id: positionId },
        select: { id: true, status: true },
      });
      if (!pos || pos.status !== "ACTIVE") {
        return jsonError("Chức vụ được lựa chọn không tồn tại hoặc đã ngừng áp dụng", 400);
      }
    }

    // 4. Kiểm tra trùng mã cán bộ (Chống Duplicate Code)
    const existingCode = await prisma.person.findUnique({
      where: { code: cleanCode },
    });
    if (existingCode) {
      return jsonError(`Mã cán bộ "${cleanCode}" đã tồn tại trong hệ thống`, 409);
    }

    // 5. Kiểm tra trùng email nếu có
    if (cleanEmail) {
      const existingEmail = await prisma.person.findUnique({
        where: { email: cleanEmail },
      });
      if (existingEmail) {
        return jsonError(`Email "${cleanEmail}" đã được sử dụng bởi cán bộ khác`, 409);
      }
    }

    // 6. Thực thi Transaction lưu vào PostgreSQL
    const now = new Date();
    const newPerson = await prisma.$transaction(async (tx) => {
      const person = await tx.person.create({
        data: {
          code: cleanCode,
          fullName: cleanFullName,
          email: cleanEmail,
          phone: cleanPhone,
          status: "ACTIVE",
          notes: cleanNotes,
        },
      });

      const assignment = await tx.personAssignment.create({
        data: {
          personId: person.id,
          unitId,
          positionId: positionId || null,
          isPrimary: true,
          effectiveFrom: now,
        },
        include: {
          unit: true,
          position: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "PERSON_CREATE",
          resourceType: "Person",
          resourceId: person.id,
          newData: {
            code: cleanCode,
            fullName: cleanFullName,
            email: cleanEmail,
            phone: cleanPhone,
            unitId,
            unitName: unit.name,
            positionId: positionId || null,
          },
        },
      });

      return {
        ...person,
        assignments: [assignment],
      };
    });

    return NextResponse.json(
      {
        success: true,
        data: newPerson,
        message: `Đã thêm mới thành công cán bộ ${newPerson.fullName} (${newPerson.code})`,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/people error:", error);
    if (error.code === "P2002") {
      return jsonError("Trùng lặp dữ liệu duy nhất trong hệ thống (Mã cán bộ hoặc Email)", 409);
    }
    return jsonError("Lỗi hệ thống khi tạo nhân sự: " + error.message, 500);
  }
}

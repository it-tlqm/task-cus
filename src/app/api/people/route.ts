import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh sách nhân sự", 401);
    }

    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get("unitId");

    // Scope check: Lãnh đạo hoặc Admin kỹ thuật được xem danh mục nhân sự toàn cơ quan để quản lý;
    // Cán bộ công chức thường chỉ xem đồng nghiệp trong đơn vị mình nếu lọc
    const authorizedUnits = await getAuthorizedUnitIds(user, true); // Admin được xem danh sách nhân sự để cấu hình tài khoản

    const whereClause: any = {};
    if (unitId) {
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(unitId)) {
        return jsonError("Bạn không có quyền xem danh sách nhân sự của bộ phận này", 403);
      }
      whereClause.assignments = {
        some: { unitId },
      };
    } else if (authorizedUnits !== "ALL") {
      whereClause.assignments = {
        some: { unitId: { in: authorizedUnits } },
      };
    }

    const people = await prisma.person.findMany({
      where: whereClause,
      include: {
        assignments: {
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
            roleGrants: {
              include: { role: true },
            },
          },
        },
      },
      orderBy: { code: "asc" },
    });

    return NextResponse.json({ success: true, data: people });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh sách nhân sự: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user || !checkPermission(user, "org.manage")) {
      return jsonError("Không có quyền quản lý nhân sự", 403);
    }

    const body = await req.json();
    const { code, fullName, email, phone, unitId, positionId } = body;

    if (!code || !fullName || !unitId) {
      return jsonError("Mã cán bộ, Họ tên và Đơn vị trực thuộc là bắt buộc", 400);
    }

    const newPerson = await prisma.person.create({
      data: {
        code,
        fullName,
        email,
        phone,
        assignments: {
          create: {
            unitId,
            positionId: positionId || undefined,
            isPrimary: true,
          },
        },
      },
      include: {
        assignments: {
          include: { unit: true },
        },
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "PERSON_CREATE",
      resourceType: "Person",
      resourceId: newPerson.id,
      newData: { code, fullName, unitId },
    });

    return NextResponse.json({ success: true, data: newPerson });
  } catch (error: any) {
    return jsonError("Lỗi khi tạo nhân sự: " + error.message, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập tài khoản để xem Dashboard KPI", 401);
    }

    // Quản trị kỹ thuật không mặc nhiên có quyền đọc số liệu nghiệp vụ chuyên môn
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Tài khoản Quản trị kỹ thuật không có quyền truy cập số liệu nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const requestedUnitId = searchParams.get("unitId");

    // Scope check: Lấy danh sách đơn vị mà người dùng được phép xem
    const authorizedUnits = await getAuthorizedUnitIds(user);

    const where: any = {};

    if (authorizedUnits === "ALL") {
      // Lãnh đạo đơn vị: Được xem tất cả hoặc lọc theo đơn vị được yêu cầu
      if (requestedUnitId && requestedUnitId !== "ALL") {
        where.unitId = requestedUnitId;
      }
    } else {
      // Cán bộ / Trưởng bộ phận: Chỉ được xem trong phạm vi authorizedUnits
      if (requestedUnitId && requestedUnitId !== "ALL") {
        if (!authorizedUnits.includes(requestedUnitId)) {
          return jsonError("Bạn không có quyền xem dữ liệu của bộ phận này (Scope Guard Violation)", 403);
        }
        where.unitId = requestedUnitId;
      } else {
        where.unitId = { in: authorizedUnits };
      }
    }

    const now = new Date();

    const [totalTasks, inProgress, waitingReview, completed, overdue, hasIssue] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: "IN_PROGRESS" } }),
      prisma.task.count({ where: { ...where, status: "WAITING_REVIEW" } }),
      prisma.task.count({ where: { ...where, status: { in: ["DONE", "COMPLETED"] } } }),
      prisma.task.count({
        where: {
          ...where,
          status: { notIn: ["DONE", "COMPLETED", "CANCELED"] },
          currentDeadline: { lt: now },
        },
      }),
      prisma.task.count({ where: { ...where, hasIssue: true } }),
    ]);

    // Department breakdown: Chỉ trả về các đơn vị mà người dùng có quyền xem
    const deptWhere: any = { level: 2 };
    if (authorizedUnits !== "ALL") {
      deptWhere.id = { in: authorizedUnits };
    }

    const units = await prisma.orgUnit.findMany({
      where: deptWhere,
      include: {
        _count: {
          select: { tasks: true, assignments: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      kpis: {
        totalTasks,
        inProgress,
        waitingReview,
        completed,
        overdue,
        hasIssue,
      },
      departmentBreakdown: units.map((u) => ({
        id: u.id,
        name: u.name,
        code: u.code,
        taskCount: u._count.tasks,
        staffCount: u._count.assignments,
      })),
    });
  } catch (error: any) {
    return jsonError("Lỗi hệ thống khi tải dữ liệu KPI: " + error.message, 500);
  }
}

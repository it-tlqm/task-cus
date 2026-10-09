import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập kế hoạch công tác", 401);
    }

    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền truy cập kế hoạch nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const requestedUnitId = searchParams.get("unitId");
    const periodId = searchParams.get("periodId");
    const status = searchParams.get("status");

    const authorizedUnits = await getAuthorizedUnitIds(user);

    const where: any = {};
    if (periodId) where.periodId = periodId;
    if (status) where.status = status;

    if (authorizedUnits === "ALL") {
      if (requestedUnitId && requestedUnitId !== "ALL") {
        where.unitId = requestedUnitId;
      }
    } else {
      if (requestedUnitId && requestedUnitId !== "ALL") {
        if (!authorizedUnits.includes(requestedUnitId)) {
          return jsonError("Bạn không có quyền xem kế hoạch của bộ phận khác", 403);
        }
        where.unitId = requestedUnitId;
      } else {
        where.unitId = { in: authorizedUnits };
      }
    }

    const plans = await prisma.plan.findMany({
      where,
      include: {
        period: true,
        unit: true,
        items: {
          include: {
            group: true,
            workItems: {
              include: {
                person: true,
                template: true,
              },
              orderBy: { sortOrder: "asc" },
            },
            taskLinks: {
              include: {
                task: {
                  include: {
                    owner: true,
                    unit: true,
                    assignees: { include: { person: true } },
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ period: { startAt: "desc" } }, { createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: plans });
  } catch (error: any) {
    return jsonError("Lỗi khi tải kế hoạch công tác: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Vui lòng đăng nhập để lập kế hoạch", 401);
    }

    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có thẩm quyền lập kế hoạch nghiệp vụ", 403);
    }

    const body = await req.json();
    let { periodId, unitId, title, items, type, year, monthNumber, weekNumber } = body;

    // Tự động phân giải hoặc tạo ReportingPeriod nếu chưa có periodId
    if (!periodId && type) {
      const typeStr = type === "MONTHLY" || type === "MONTH" ? "MONTH" : type === "WEEKLY" || type === "WEEK" ? "WEEK" : "DAY";
      const planYear = year || 2026;
      const titleStr = typeStr === "MONTH" 
        ? `Tháng ${monthNumber || 10}/${planYear}`
        : `Tuần ${weekNumber || 41}/${planYear}`;

      let period = await prisma.reportingPeriod.findFirst({
        where: { type: typeStr, title: titleStr },
      });

      if (!period) {
        const start = typeStr === "MONTH" 
          ? new Date(planYear, (monthNumber || 10) - 1, 1)
          : new Date(planYear, 0, 1 + ((weekNumber || 41) - 1) * 7);
        const end = typeStr === "MONTH"
          ? new Date(planYear, monthNumber || 10, 0)
          : new Date(start.getTime() + 6 * 86400000);

        period = await prisma.reportingPeriod.create({
          data: {
            type: typeStr,
            title: titleStr,
            startAt: start,
            endAt: end,
          },
        });
      }
      periodId = period.id;
    }

    const targetUnitId = unitId || user.unitId;
    if (!periodId || !targetUnitId || !title?.trim()) {
      return jsonError("Kỳ công tác, Đơn vị và Tiêu đề kế hoạch là bắt buộc", 400);
    }

    // Cán bộ công chức hoặc Trưởng bộ phận chỉ được lập cho bộ phận mình
    const authorizedUnits = await getAuthorizedUnitIds(user);
    if (authorizedUnits !== "ALL" && !authorizedUnits.includes(targetUnitId)) {
      return jsonError("Bạn không có quyền lập kế hoạch cho bộ phận khác", 403);
    }

    const newPlan = await prisma.plan.create({
      data: {
        periodId,
        unitId: targetUnitId,
        creatorId: user.personId,
        title: title.trim(),
        status: "DRAFT",
        items: items && items.length > 0 ? {
          create: items.map((it: any, idx: number) => ({
            groupId: it.groupId || null,
            title: it.title || `Hạng mục ${idx + 1}`,
            sortOrder: it.sortOrder || idx + 1,
          })),
        } : undefined,
      },
      include: {
        period: true,
        unit: true,
        items: true,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "PLAN_CREATE",
      resourceType: "Plan",
      resourceId: newPlan.id,
      newData: { title: newPlan.title, unitId: newPlan.unitId, periodId: newPlan.periodId },
    });

    return NextResponse.json({ success: true, data: newPlan }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi tạo kế hoạch công tác: " + error.message, 500);
  }
}

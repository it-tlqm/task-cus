import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { assertPeriodWritable } from "@/server/period-guard";
import {
  ReportingPeriodError,
  resolveReportingPeriod,
} from "@/server/reporting-period";

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
                group: true,
                // YC-23/YC-25: nhãn "BỘ PHẦN:" và "SP:" trên bảng kế hoạch
                deptWorkItem: true,
                product: true,
                // Danh mục TX độc lập với QĐ1277; cần mã/tên/nhóm/hệ số để hiển thị,
                // tuyệt đối không dùng hệ số để tự tính điểm.
                catalogEntry: {
                  include: {
                    version: { select: { id: true, code: true, status: true } },
                  },
                },
                // V3.0.2: một đầu việc có thể gắn nhiều sản phẩm QĐ1277.
                linkedProducts: {
                  include: {
                    productItem: {
                      include: {
                        group: true,
                        version: { select: { id: true, code: true, status: true } },
                      },
                    },
                  },
                  orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
                },
                template: {
                  include: { group: true },
                },
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

    if (!checkPermission(user, "plans.create")) {
      return jsonError("Bạn không có quyền lập kế hoạch công tác", 403);
    }

    const body = await req.json();
    let {
      periodId,
      unitId,
      title,
      items,
      type,
      year,
      monthNumber,
      weekNumber,
      date,
    } = body;

    // Tự động phân giải hoặc tạo ReportingPeriod nếu chưa có periodId.
    // Dùng chung helper Ngày/Tuần/Tháng, không tự đoán tuần bằng phép cộng 7 ngày.
    if (!periodId) {
      if (!type) {
        return jsonError("Kỳ công tác là bắt buộc", 400);
      }
      try {
        const period = await resolveReportingPeriod({
          type,
          date,
          year,
          monthNumber,
          weekNumber,
        });
        periodId = period.id;
      } catch (err: any) {
        if (err instanceof ReportingPeriodError) {
          return jsonError(err.message, err.statusCode);
        }
        throw err;
      }
    } else {
      const period = await prisma.reportingPeriod.findUnique({
        where: { id: periodId },
        select: { id: true },
      });
      if (!period) return jsonError("Kỳ công tác không tồn tại", 400);
    }

    const targetUnitId = unitId || user.unitId;
    if (!periodId || !targetUnitId || !String(title || "").trim()) {
      return jsonError("Kỳ công tác, Đơn vị và Tiêu đề kế hoạch là bắt buộc", 400);
    }
    if (String(title).trim().length > 300) {
      return jsonError("Tiêu đề kế hoạch không được vượt quá 300 ký tự", 400);
    }

    // E1: kỳ đã chốt thì không lập kế hoạch mới trong kỳ đó
    try {
      await assertPeriodWritable(periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    // Chỉ lập kế hoạch trong phạm vi đơn vị được cấp quyền.
    const authorizedUnits = await getAuthorizedUnitIds(user);
    if (authorizedUnits !== "ALL" && !authorizedUnits.includes(targetUnitId)) {
      return jsonError("Bạn không có quyền lập kế hoạch cho bộ phận khác", 403);
    }
    const targetUnit = await prisma.orgUnit.findUnique({
      where: { id: targetUnitId },
      select: { id: true },
    });
    if (!targetUnit) return jsonError("Đơn vị lập kế hoạch không tồn tại", 400);

    if (items !== undefined && !Array.isArray(items)) {
      return jsonError("Danh sách hạng mục không hợp lệ", 400);
    }
    const rawItems = Array.isArray(items) ? items : [];
    const sanitizedItems: Array<{ title: string; groupId: string | null; sortOrder: number }> = [];
    for (let index = 0; index < rawItems.length; index++) {
      const item = rawItems[index] || {};
      const itemTitle = String(item.title || "").trim();
      if (!itemTitle) {
        return jsonError(`Hạng mục ${index + 1}: tên hạng mục là bắt buộc`, 400);
      }
      if (itemTitle.length > 300) {
        return jsonError(`Hạng mục ${index + 1}: tên không được vượt quá 300 ký tự`, 400);
      }
      sanitizedItems.push({
        title: itemTitle,
        groupId: item.groupId || null,
        sortOrder: Number(item.sortOrder) || index + 1,
      });
    }
    const groupIds = [...new Set(sanitizedItems.map((it) => it.groupId).filter(Boolean))] as string[];
    if (groupIds.length > 0) {
      const validGroups = await prisma.activityGroup.findMany({
        where: { id: { in: groupIds } },
        select: { id: true },
      });
      if (validGroups.length !== groupIds.length) {
        return jsonError("Nhóm nghiệp vụ của hạng mục không tồn tại", 400);
      }
    }

    const newPlan = await prisma.plan.create({
      data: {
        periodId,
        unitId: targetUnitId,
        creatorId: user.personId,
        title: String(title).trim(),
        status: "DRAFT",
        items:
          sanitizedItems.length > 0
            ? {
                create: sanitizedItems,
              }
            : undefined,
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

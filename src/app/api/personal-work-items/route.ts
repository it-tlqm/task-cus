import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để truy cập danh mục đầu việc", 401);
    }

    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền truy cập đầu việc nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const requestedPersonId = searchParams.get("personId");
    let periodId = searchParams.get("periodId");
    const periodType = searchParams.get("periodType");
    const periodYear = searchParams.get("periodYear");
    const periodNumber = searchParams.get("periodNumber");
    const status = searchParams.get("status");

    // Nếu tìm theo periodType, periodYear, periodNumber
    if (!periodId && periodType && periodNumber) {
      const typeStr = periodType === "WEEKLY" ? "WEEK" : periodType === "MONTHLY" ? "MONTH" : "DAY";
      const titlePattern = periodType === "WEEKLY" ? `Tuần ${periodNumber}/${periodYear || 2026}` : `Tháng ${periodNumber}/${periodYear || 2026}`;
      const foundPeriod = await prisma.reportingPeriod.findFirst({
        where: {
          type: typeStr,
          title: { contains: titlePattern },
        },
      });
      if (foundPeriod) {
        periodId = foundPeriod.id;
      }
    }

    const authorizedUnits = await getAuthorizedUnitIds(user);

    const where: any = {};
    if (periodId) where.periodId = periodId;
    if (status) where.status = status;

    if (user.role === "UNIT_LEADER" || authorizedUnits === "ALL") {
      // Lãnh đạo đơn vị: Được xem theo người yêu cầu hoặc toàn bộ
      if (requestedPersonId) where.personId = requestedPersonId;
    } else if (user.role === "DEPARTMENT_LEADER") {
      // Trưởng bộ phận: Được xem của mình hoặc các cán bộ trong bộ phận
      if (requestedPersonId) {
        // Kiểm tra xem personId có thuộc bộ phận không
        const targetPerson = await prisma.person.findUnique({
          where: { id: requestedPersonId },
          include: { assignments: true },
        });
        const isBelong = targetPerson?.assignments.some((a) => authorizedUnits.includes(a.unitId));
        if (!isBelong) {
          return jsonError("Cán bộ này không thuộc bộ phận quản lý của bạn", 403);
        }
        where.personId = requestedPersonId;
      } else {
        // Mặc định lấy các cán bộ thuộc bộ phận của mình
        where.person = {
          assignments: {
            some: { unitId: { in: authorizedUnits } },
          },
        };
      }
    } else {
      // Cán bộ công chức (STAFF): Chỉ được xem đầu việc của chính mình
      where.personId = user.personId;
    }

    const items = await prisma.personalWorkItem.findMany({
      where,
      include: {
        person: true,
        period: true,
        group: true,
        template: {
          include: { group: true },
        },
        planItem: {
          include: { plan: true },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const enrichedItems = items.map((it) => ({
      ...it,
      isCustom: !it.templateId,
      customTitle: it.title,
    }));

    return NextResponse.json({ success: true, data: enrichedItems });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục đầu việc cá nhân: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để tạo đầu việc", 401);
    }

    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không được tạo đầu việc nghiệp vụ", 403);
    }

    const body = await req.json();
    let {
      personId,
      periodId,
      planItemId,
      templateId,
      groupId,
      title,
      customTitle,
      workDate,
      dateText,
      coordinationUnit,
      priority,
      expectedResult,
      status,
      periodType,
      periodYear,
      periodNumber,
    } = body;

    const targetPersonId = personId || user.personId;

    // Tự động phân giải title, groupId, priority nếu truyền templateId
    let resolvedTitle = title || customTitle;
    let resolvedGroupId = groupId || null;
    let resolvedPriority = priority || "Trung bình";

    if (templateId) {
      const template = await prisma.activityTemplate.findUnique({
        where: { id: templateId },
        include: { group: true },
      });
      if (!template) {
        return jsonError("Hoạt động mẫu không tồn tại trong danh mục", 400);
      }
      if (template.reviewStatus === "RETIRED") {
        return jsonError("Hoạt động mẫu này đã ngừng áp dụng, không thể chọn để tạo mới đầu việc", 400);
      }
      if (!resolvedTitle?.trim()) {
        resolvedTitle = template.title;
      }
      if (!resolvedGroupId) {
        resolvedGroupId = template.groupId;
      }
      if (!priority) {
        resolvedPriority = template.defaultPriority || "Cao";
      }
    }

    // Tự động phân giải hoặc tạo ReportingPeriod nếu truyền periodType, periodYear, periodNumber
    if (!periodId && periodType && periodNumber) {
      const typeStr = periodType === "WEEKLY" ? "WEEK" : periodType === "MONTHLY" ? "MONTH" : "DAY";
      const year = periodYear || new Date().getFullYear();
      const titleStr = periodType === "WEEKLY" ? `Tuần ${periodNumber}/${year}` : `Tháng ${periodNumber}/${year}`;

      let period = await prisma.reportingPeriod.findFirst({
        where: {
          type: typeStr,
          title: titleStr,
        },
      });

      if (!period) {
        const start = new Date(year, 0, 1 + (Number(periodNumber) - 1) * 7);
        const end = new Date(start.getTime() + 6 * 86400000);
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

    if (!targetPersonId || !periodId || !resolvedTitle?.trim()) {
      return jsonError("Cán bộ phụ trách, Kỳ công tác và Tiêu đề đầu việc là bắt buộc", 400);
    }

    // Phân quyền: Cán bộ chỉ được tạo cho mình; Trưởng bộ phận được tạo cho cán bộ trong tổ
    if (user.role === "STAFF" && targetPersonId !== user.personId) {
      return jsonError("Cán bộ chỉ được tạo danh mục đầu việc cho chính mình", 403);
    }

    if (user.role === "DEPARTMENT_LEADER" && targetPersonId !== user.personId) {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      const targetPerson = await prisma.person.findUnique({
        where: { id: targetPersonId },
        include: { assignments: true },
      });
      const isBelong = targetPerson?.assignments.some((a) => authorizedUnits === "ALL" || authorizedUnits.includes(a.unitId));
      if (!isBelong) {
        return jsonError("Bạn chỉ được tạo đầu việc cho cán bộ thuộc bộ phận của mình", 403);
      }
    }

    // Tính thứ tự sắp xếp tiếp theo
    const maxSort = await prisma.personalWorkItem.aggregate({
      where: { personId: targetPersonId, periodId },
      _max: { sortOrder: true },
    });

    const newItem = await prisma.personalWorkItem.create({
      data: {
        personId: targetPersonId,
        periodId,
        planItemId: planItemId || null,
        templateId: templateId || null, // null nếu là đầu việc tự thêm ngoài danh mục 48 mẫu
        groupId: resolvedGroupId,
        title: resolvedTitle.trim(),
        workDate: workDate ? new Date(workDate) : null,
        dateText: dateText?.trim() || null,
        coordinationUnit: coordinationUnit?.trim() || null,
        priority: resolvedPriority,
        expectedResult: expectedResult?.trim() || null,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
        status: status || "ACTIVE",
      },
      include: {
        person: true,
        template: { include: { group: true } },
        group: true,
        period: true,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "PERSONAL_WORK_ITEM_CREATE",
      resourceType: "PersonalWorkItem",
      resourceId: newItem.id,
      newData: {
        personId: newItem.personId,
        periodId: newItem.periodId,
        title: newItem.title,
        groupId: newItem.groupId,
        priority: newItem.priority,
        coordinationUnit: newItem.coordinationUnit,
        expectedResult: newItem.expectedResult,
        isCustom: !newItem.templateId,
      },
    });

    return NextResponse.json({ success: true, data: newItem }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi thêm đầu việc cá nhân: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập để chỉnh sửa đầu việc", 401);
    }

    const body = await req.json();
    const {
      id,
      title,
      groupId,
      workDate,
      dateText,
      coordinationUnit,
      priority,
      expectedResult,
      sortOrder,
      status,
      planItemId,
    } = body;

    if (!id) {
      return jsonError("Thiếu ID đầu việc cần cập nhật", 400);
    }

    const currentItem = await prisma.personalWorkItem.findUnique({
      where: { id },
      include: {
        person: { include: { assignments: true } },
      },
    });

    if (!currentItem) {
      return jsonError("Đầu việc không tồn tại", 404);
    }

    // Kiểm tra quyền chỉnh sửa
    const isOwner = currentItem.personId === user.personId;
    const isLeader = user.role === "UNIT_LEADER";
    let isDeptLeader = false;

    if (user.role === "DEPARTMENT_LEADER") {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      isDeptLeader = currentItem.person.assignments.some((a) => authorizedUnits === "ALL" || authorizedUnits.includes(a.unitId));
    }

    if (!isOwner && !isDeptLeader && !isLeader) {
      return jsonError("Bạn không có quyền chỉnh sửa đầu việc của cán bộ khác", 403);
    }

    const updateData: any = {};
    if (title && title.trim()) updateData.title = title.trim();
    if (groupId !== undefined) updateData.groupId = groupId || null;
    if (workDate !== undefined) updateData.workDate = workDate ? new Date(workDate) : null;
    if (dateText !== undefined) updateData.dateText = dateText?.trim() || null;
    if (coordinationUnit !== undefined) updateData.coordinationUnit = coordinationUnit?.trim() || null;
    if (priority !== undefined) updateData.priority = priority;
    if (expectedResult !== undefined) updateData.expectedResult = expectedResult?.trim() || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (status) updateData.status = status; // ACTIVE, NOT_STARTED, IN_PROGRESS, COMPLETED, DISCONTINUED
    if (planItemId !== undefined) updateData.planItemId = planItemId;

    const updated = await prisma.personalWorkItem.update({
      where: { id },
      data: updateData,
      include: {
        person: true,
        template: { include: { group: true } },
        group: true,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "PERSONAL_WORK_ITEM_UPDATE",
      resourceType: "PersonalWorkItem",
      resourceId: updated.id,
      oldData: { title: currentItem.title, status: currentItem.status },
      newData: updateData,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật đầu việc cá nhân: " + error.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return jsonError("Yêu cầu đăng nhập", 401);
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return jsonError("Thiếu ID đầu việc", 400);
    }

    const currentItem = await prisma.personalWorkItem.findUnique({
      where: { id },
      include: {
        person: { include: { assignments: true } },
        routines: true,
      },
    });

    if (!currentItem) {
      return jsonError("Đầu việc không tồn tại", 404);
    }

    const isOwner = currentItem.personId === user.personId;
    const isLeader = user.role === "UNIT_LEADER";
    let isDeptLeader = false;
    if (user.role === "DEPARTMENT_LEADER") {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      isDeptLeader = currentItem.person.assignments.some((a) => authorizedUnits === "ALL" || authorizedUnits.includes(a.unitId));
    }

    if (!isOwner && !isDeptLeader && !isLeader) {
      return jsonError("Bạn không có quyền xóa đầu việc này", 403);
    }

    // Nếu đầu việc đã có nhật ký hoặc liên kết ràng buộc, chuyển sang DISCONTINUED để bảo toàn dữ liệu
    if (currentItem.routines.length > 0) {
      const discontinued = await prisma.personalWorkItem.update({
        where: { id },
        data: { status: "DISCONTINUED" },
      });
      return NextResponse.json({
        success: true,
        message: "Đầu việc đã có dữ liệu tác nghiệp nên được chuyển sang trạng thái NGỪNG ÁP DỤNG",
        data: discontinued,
      });
    }

    // Ngược lại nếu chưa có ràng buộc, xóa bản ghi
    await prisma.personalWorkItem.delete({ where: { id } });

    await recordAuditEvent({
      actorId: user.id,
      action: "PERSONAL_WORK_ITEM_DELETE",
      resourceType: "PersonalWorkItem",
      resourceId: id,
      oldData: { title: currentItem.title, personId: currentItem.personId },
    });

    return NextResponse.json({ success: true, message: "Đã xóa đầu việc cá nhân thành công" });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa đầu việc: " + error.message, 500);
  }
}

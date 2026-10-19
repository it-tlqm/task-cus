import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import { isLegacyTemplateSelectable } from "@/server/work-catalog";
import { parseDateOnly } from "@/server/work-dates";
import { getEvidenceStorageProvider } from "@/server/storage";

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
    const yearFilter = searchParams.get("year");
    const monthFilter = searchParams.get("month");

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

    // YC-23: lọc đầu việc theo tháng (phục vụ liên kết khi ghi nhận kết quả tháng)
    if (yearFilter && monthFilter) {
      const y = parseInt(yearFilter, 10);
      const m = parseInt(monthFilter, 10);
      if (!Number.isNaN(y) && m >= 1 && m <= 12) {
        const monthStart = new Date(Date.UTC(y, m - 1, 1));
        const monthEnd = new Date(Date.UTC(y, m, 1));
        where.OR = [
          { period: { startAt: { lt: monthEnd }, endAt: { gte: monthStart } } },
          { workDate: { gte: monthStart, lt: monthEnd } },
          { dueDate: { gte: monthStart, lt: monthEnd } },
        ];
      }
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
        deptWorkItem: {
          include: { unit: { select: { id: true, code: true, name: true } } },
        },
        product: true,
        catalogEntry: {
          include: { version: { select: { id: true, code: true, status: true } } },
        },
        task: {
          select: { id: true, code: true, title: true, status: true, currentDeadline: true },
        },
        _count: { select: { evidences: true } },
        planItem: {
          include: { plan: true },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const enrichedItems = items.map((it) => ({
      ...it,
      isCustom: !it.templateId && !it.deptWorkItemId && !it.catalogEntryId,
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
      deptWorkItemId,
      productItemId,
      catalogEntryId,
      dueDate,
      completedDate,
      taskId,
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
      if (!(await isLegacyTemplateSelectable())) {
        return jsonError(
          "Mẫu công việc cũ đã ngừng cho chọn khi tạo mới — hãy chọn từ Danh mục công việc thường xuyên",
          403
        );
      }
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

    // YC-25: chọn từ danh mục đầu việc riêng của bộ phận (tách biệt 48 mẫu và danh mục sản phẩm)
    let resolvedDeptWorkItemId: string | null = null;
    if (deptWorkItemId) {
      if (templateId) {
        return jsonError("Chỉ chọn một nguồn đầu việc: mẫu thường xuyên hoặc danh mục của bộ phận", 400);
      }
      const deptItem = await prisma.departmentWorkItem.findUnique({ where: { id: deptWorkItemId } });
      if (!deptItem) {
        return jsonError("Đầu việc không tồn tại trong danh mục của bộ phận", 400);
      }
      if (deptItem.status !== "ACTIVE") {
        return jsonError("Đầu việc này đã ngừng sử dụng, không thể chọn để tạo mới", 400);
      }
      const scopeUnits = await getAuthorizedUnitIds(user);
      if (scopeUnits !== "ALL" && !scopeUnits.includes(deptItem.unitId)) {
        return jsonError("Bạn chỉ được chọn đầu việc thuộc bộ phận của mình", 403);
      }
      resolvedDeptWorkItemId = deptItem.id;
      if (!resolvedTitle?.trim()) {
        resolvedTitle = deptItem.title;
      }
    }

    // YC-23: liên kết sản phẩm đầu ra theo QĐ1277 (tuỳ chọn — một công việc có thể gắn sản phẩm)
    let resolvedProductItemId: string | null = null;
    if (productItemId) {
      const product = await prisma.productItem.findUnique({
        where: { id: productItemId },
        include: { version: { select: { status: true } } },
      });
      if (!product) {
        return jsonError("Sản phẩm không tồn tại trong danh mục QĐ1277", 400);
      }
      if (product.status !== "ACTIVE" || product.version?.status !== "ACTIVE") {
        return jsonError("Sản phẩm này đã ngừng áp dụng, không thể chọn", 400);
      }
      resolvedProductItemId = product.id;
      if (!resolvedTitle?.trim()) {
        resolvedTitle = product.taskName;
      }
    }

    // YC-31: chọn từ Danh mục công việc thường xuyên (phiên bản đang áp dụng)
    let resolvedCatalogEntryId: string | null = null;
    if (catalogEntryId) {
      if (templateId || deptWorkItemId) {
        return jsonError(
          "Chỉ chọn một nguồn đầu việc: Danh mục TX, mẫu thường xuyên hoặc danh mục của bộ phận",
          400
        );
      }
      const entry = await prisma.workCatalogEntry.findUnique({
        where: { id: catalogEntryId },
        include: { version: { select: { status: true, code: true } } },
      });
      if (!entry) return jsonError("Đầu việc không tồn tại trong Danh mục TX", 400);
      if (entry.status !== "ACTIVE" || entry.version.status !== "ACTIVE") {
        return jsonError(
          "Đầu việc này đã ngừng áp dụng hoặc thuộc phiên bản cũ — không thể chọn để tạo mới",
          400
        );
      }
      resolvedCatalogEntryId = entry.id;
      if (!resolvedTitle?.trim()) resolvedTitle = entry.title;
    }

    // YC-32: hạn xử lý và ngày hoàn thành thực tế (tách biệt nhau)
    const dueParsed = parseDateOnly(dueDate);
    if (!dueParsed.ok) return jsonError(`Hạn xử lý: ${dueParsed.message}`, 400);
    const completedParsed = parseDateOnly(completedDate);
    if (!completedParsed.ok) return jsonError(`Ngày hoàn thành: ${completedParsed.message}`, 400);

    // YC-32: liên kết nhiệm vụ (nếu có) — kiểm tra tồn tại + quyền
    let resolvedTaskId: string | null = null;
    if (taskId) {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: { assignees: { select: { personId: true } } },
      });
      if (!task) return jsonError("Nhiệm vụ liên kết không tồn tại", 400);
      const authorizedUnits = await getAuthorizedUnitIds(user);
      const canLink =
        task.ownerId === user.personId ||
        task.assignees.some((a) => a.personId === user.personId) ||
        user.role === "UNIT_LEADER" ||
        authorizedUnits === "ALL" ||
        authorizedUnits.includes(task.unitId);
      if (!canLink) return jsonError("Bạn không có quyền liên kết nhiệm vụ này", 403);
      resolvedTaskId = task.id;
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
        // Upsert theo unique (type, title): 2 request đồng thời không tạo trùng kỳ
        period = await prisma.reportingPeriod.upsert({
          where: { type_title: { type: typeStr, title: titleStr } },
          update: {},
          create: {
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

    // E1: kỳ đã chốt thì khóa mọi ghi mới
    try {
      await assertPeriodWritable(periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
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

    // E1: đầu việc gắn vào kế hoạch đã duyệt/có hiệu lực thì khóa (đi luồng bổ sung)
    if (planItemId) {
      const parentItem = await prisma.planItem.findUnique({
        where: { id: planItemId },
        include: { plan: { select: { id: true, status: true, title: true } } },
      });
      if (parentItem && (parentItem.plan.status === "APPROVED" || parentItem.plan.status === "IN_EFFECT")) {
        return jsonError(
          `Kế hoạch "${parentItem.plan.title}" đã phê duyệt — hãy dùng “Trình duyệt bổ sung” thay vì thêm trực tiếp`,
          403
        );
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
        deptWorkItemId: resolvedDeptWorkItemId, // YC-25: nguồn danh mục đầu việc riêng của bộ phận
        productItemId: resolvedProductItemId, // YC-23: sản phẩm đầu ra theo QĐ1277 (tuỳ chọn)
        catalogEntryId: resolvedCatalogEntryId, // YC-31: đầu việc TX (tuỳ chọn)
        dueDate: dueParsed.value ?? null, // YC-32
        completedDate: completedParsed.value ?? null, // YC-32
        taskId: resolvedTaskId, // YC-32
        groupId: resolvedGroupId,
        title: resolvedTitle.trim(),
        workDate: workDate ? new Date(workDate) : null,
        dateText: dateText?.trim() || null,
        coordinationUnit: coordinationUnit?.trim() || null,
        priority: resolvedPriority,
        expectedResult: expectedResult?.trim() || null,
        sortOrder: (maxSort._max.sortOrder || 0) + 1,
        status: completedParsed.value ? "COMPLETED" : status || "ACTIVE",
      },
      include: {
        person: true,
        template: { include: { group: true } },
        deptWorkItem: { include: { unit: { select: { id: true, code: true, name: true } } } },
        product: true,
        catalogEntry: { include: { version: { select: { id: true, code: true, status: true } } } },
        task: { select: { id: true, code: true, title: true, status: true, currentDeadline: true } },
        _count: { select: { evidences: true } },
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
        isCustom: !newItem.templateId && !newItem.deptWorkItemId && !newItem.catalogEntryId,
        deptWorkItemId: newItem.deptWorkItemId,
        productItemId: newItem.productItemId,
        catalogEntryId: newItem.catalogEntryId,
        dueDate: newItem.dueDate,
        completedDate: newItem.completedDate,
        taskId: newItem.taskId,
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
      templateId,
      deptWorkItemId,
      productItemId,
      catalogEntryId,
      dueDate,
      completedDate,
      taskId,
    } = body;

    if (!id) {
      return jsonError("Thiếu ID đầu việc cần cập nhật", 400);
    }

    const currentItem = await prisma.personalWorkItem.findUnique({
      where: { id },
      include: {
        person: { include: { assignments: true } },
        planItem: { include: { plan: { select: { id: true, status: true, title: true } } } },
      },
    });

    if (!currentItem) {
      return jsonError("Đầu việc không tồn tại", 404);
    }

    // E1: kỳ đã chốt thì khóa chỉnh sửa
    try {
      await assertPeriodWritable(currentItem.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    // E1: đầu việc thuộc kế hoạch đã duyệt/có hiệu lực thì khóa phần nội dung.
    // YC-32: vẫn cho cập nhật ngày hoàn thành, trạng thái thực hiện và liên kết nhiệm vụ
    // (đây là dữ liệu thực hiện, không phải thay đổi cam kết của kế hoạch).
    if (currentItem.planItem?.plan && (currentItem.planItem.plan.status === "APPROVED" || currentItem.planItem.plan.status === "IN_EFFECT")) {
      const contentFields = [
        ["title", title],
        ["groupId", groupId],
        ["workDate", workDate],
        ["dateText", dateText],
        ["coordinationUnit", coordinationUnit],
        ["priority", priority],
        ["expectedResult", expectedResult],
        ["sortOrder", sortOrder],
        ["planItemId", planItemId],
        ["templateId", templateId],
        ["deptWorkItemId", deptWorkItemId],
        ["productItemId", productItemId],
        ["catalogEntryId", catalogEntryId],
      ].filter(([, value]) => value !== undefined);
      if (contentFields.length > 0) {
        return jsonError(
          `Kế hoạch "${currentItem.planItem.plan.title}" đã phê duyệt — chỉ được cập nhật ngày hoàn thành/trạng thái thực hiện; hãy dùng “Trình duyệt bổ sung” để sửa nội dung`,
          403
        );
      }
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

    // YC-25: đổi/thiết lập nguồn đầu việc bộ phận (đổi nguồn sẽ bỏ liên kết mẫu thường xuyên)
    const linkUpdate: any = {};
    if (deptWorkItemId !== undefined) {
      if (deptWorkItemId) {
        const deptItem = await prisma.departmentWorkItem.findUnique({ where: { id: deptWorkItemId } });
        if (!deptItem) return jsonError("Đầu việc không tồn tại trong danh mục của bộ phận", 400);
        if (deptItem.status !== "ACTIVE") return jsonError("Đầu việc này đã ngừng sử dụng, không thể chọn mới", 400);
        const scopeUnits = await getAuthorizedUnitIds(user);
        if (scopeUnits !== "ALL" && !scopeUnits.includes(deptItem.unitId)) {
          return jsonError("Bạn chỉ được chọn đầu việc thuộc bộ phận của mình", 403);
        }
        linkUpdate.deptWorkItemId = deptItem.id;
        linkUpdate.templateId = null;
        linkUpdate.catalogEntryId = null;
      } else {
        linkUpdate.deptWorkItemId = null;
      }
    }
    if (templateId !== undefined && templateId) {
      const template = await prisma.activityTemplate.findUnique({ where: { id: templateId } });
      if (!template) return jsonError("Hoạt động mẫu không tồn tại trong danh mục", 400);
      if (template.reviewStatus === "RETIRED") {
        return jsonError("Hoạt động mẫu này đã ngừng áp dụng, không thể chọn", 400);
      }
      linkUpdate.templateId = templateId;
      linkUpdate.deptWorkItemId = null;
      linkUpdate.catalogEntryId = null;
    }
    // YC-31: đổi/thiết lập đầu việc TX (nguồn độc quyền với mẫu cũ và danh mục bộ phận)
    if (catalogEntryId !== undefined) {
      if (catalogEntryId) {
        const entry = await prisma.workCatalogEntry.findUnique({
          where: { id: catalogEntryId },
          include: { version: { select: { status: true } } },
        });
        if (!entry) return jsonError("Đầu việc không tồn tại trong Danh mục TX", 400);
        if (entry.status !== "ACTIVE" || entry.version.status !== "ACTIVE") {
          return jsonError(
            "Đầu việc này đã ngừng áp dụng hoặc thuộc phiên bản cũ — không thể chọn",
            400
          );
        }
        linkUpdate.catalogEntryId = entry.id;
        linkUpdate.templateId = null;
        linkUpdate.deptWorkItemId = null;
      } else {
        linkUpdate.catalogEntryId = null;
      }
    }
    // YC-23: đổi/thiết lập sản phẩm đầu ra theo QĐ1277 (tuỳ chọn, độc lập với nguồn đầu việc)
    if (productItemId !== undefined) {
      if (productItemId) {
        const product = await prisma.productItem.findUnique({
          where: { id: productItemId },
          include: { version: { select: { status: true } } },
        });
        if (!product) return jsonError("Sản phẩm không tồn tại trong danh mục QĐ1277", 400);
        if (product.status !== "ACTIVE" || product.version?.status !== "ACTIVE") {
          return jsonError("Sản phẩm này đã ngừng áp dụng, không thể chọn", 400);
        }
        linkUpdate.productItemId = product.id;
      } else {
        linkUpdate.productItemId = null;
      }
    }

    const updateData: any = {};
    if (title && title.trim()) updateData.title = title.trim();    if (groupId !== undefined) updateData.groupId = groupId || null;
    if (workDate !== undefined) updateData.workDate = workDate ? new Date(workDate) : null;
    if (dateText !== undefined) updateData.dateText = dateText?.trim() || null;
    if (coordinationUnit !== undefined) updateData.coordinationUnit = coordinationUnit?.trim() || null;
    if (priority !== undefined) updateData.priority = priority;
    if (expectedResult !== undefined) updateData.expectedResult = expectedResult?.trim() || null;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (status) updateData.status = status; // ACTIVE, NOT_STARTED, IN_PROGRESS, COMPLETED, DISCONTINUED
    if (planItemId !== undefined) updateData.planItemId = planItemId;

    // YC-32: hạn xử lý (độc lập với ngày hoàn thành)
    if (dueDate !== undefined) {
      const parsed = parseDateOnly(dueDate);
      if (!parsed.ok) return jsonError(`Hạn xử lý: ${parsed.message}`, 400);
      updateData.dueDate = parsed.value ?? null;
    }
    // YC-32: ngày hoàn thành thực tế quyết định trạng thái; xóa ngày → trả về đang thực hiện
    if (completedDate !== undefined) {
      const parsed = parseDateOnly(completedDate);
      if (!parsed.ok) return jsonError(`Ngày hoàn thành: ${parsed.message}`, 400);
      updateData.completedDate = parsed.value ?? null;
      if (parsed.value) {
        updateData.status = "COMPLETED";
      } else if (status === undefined) {
        updateData.status = "IN_PROGRESS";
      }
    }
    // YC-32: liên kết nhiệm vụ (kiểm tra tồn tại + quyền)
    if (taskId !== undefined) {
      if (taskId) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { assignees: { select: { personId: true } } },
        });
        if (!task) return jsonError("Nhiệm vụ liên kết không tồn tại", 400);
        const authorizedUnits = await getAuthorizedUnitIds(user);
        const canLink =
          task.ownerId === user.personId ||
          task.assignees.some((a) => a.personId === user.personId) ||
          user.role === "UNIT_LEADER" ||
          authorizedUnits === "ALL" ||
          authorizedUnits.includes(task.unitId);
        if (!canLink) return jsonError("Bạn không có quyền liên kết nhiệm vụ này", 403);
        updateData.taskId = task.id;
      } else {
        updateData.taskId = null;
      }
    }

    Object.assign(updateData, linkUpdate);

    const updated = await prisma.personalWorkItem.update({
      where: { id },
      data: updateData,
      include: {
        person: true,
        template: { include: { group: true } },
        deptWorkItem: { include: { unit: { select: { id: true, code: true, name: true } } } },
        product: true,
        catalogEntry: { include: { version: { select: { id: true, code: true, status: true } } } },
        task: { select: { id: true, code: true, title: true, status: true, currentDeadline: true } },
        _count: { select: { evidences: true } },
        group: true,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "PERSONAL_WORK_ITEM_UPDATE",
      resourceType: "PersonalWorkItem",
      resourceId: updated.id,
      oldData: {
        title: currentItem.title,
        status: currentItem.status,
        deptWorkItemId: currentItem.deptWorkItemId,
        productItemId: currentItem.productItemId,
        catalogEntryId: currentItem.catalogEntryId,
        dueDate: currentItem.dueDate,
        completedDate: currentItem.completedDate,
        taskId: currentItem.taskId,
      },
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
        planItem: { include: { plan: { select: { id: true, status: true, title: true } } } },
        routines: true,
        evidences: { select: { id: true, storageKey: true } },
      },
    });

    if (!currentItem) {
      return jsonError("Đầu việc không tồn tại", 404);
    }

    // E1: kỳ đã chốt thì khóa xóa
    try {
      await assertPeriodWritable(currentItem.periodId);
    } catch (err: any) {
      return jsonError(err.message, err.statusCode || 423);
    }

    // E1: đầu việc thuộc kế hoạch đã duyệt/có hiệu lực thì khóa (đi luồng bổ sung)
    if (currentItem.planItem?.plan && (currentItem.planItem.plan.status === "APPROVED" || currentItem.planItem.plan.status === "IN_EFFECT")) {
      return jsonError(
        `Kế hoạch "${currentItem.planItem.plan.title}" đã phê duyệt — hãy dùng “Trình duyệt bổ sung” thay vì xóa trực tiếp`,
        403
      );
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

    // YC-32: xóa tệp minh chứng khỏi kho lưu trữ trước khi xóa bản ghi (best-effort)
    if (currentItem.evidences.length > 0) {
      const storage = getEvidenceStorageProvider();
      for (const e of currentItem.evidences) {
        await storage.delete(e.storageKey).catch(() => false);
      }
    }

    // Ngược lại nếu chưa có ràng buộc, xóa bản ghi
    await prisma.personalWorkItem.delete({ where: { id } });

    await recordAuditEvent({
      actorId: user.id,
      action: "PERSONAL_WORK_ITEM_DELETE",
      resourceType: "PersonalWorkItem",
      resourceId: id,
      oldData: {
        title: currentItem.title,
        personId: currentItem.personId,
        evidenceCount: currentItem.evidences.length,
      },
    });

    return NextResponse.json({ success: true, message: "Đã xóa đầu việc cá nhân thành công" });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa đầu việc: " + error.message, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { assertWorkItemNotLinkedToClosedTask } from "@/server/work-item-linkage";
import { isTerminalTaskStatus } from "@/server/task-transitions";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import { isWorkItemReviewLocked } from "@/server/work-item-review";
import {
  getCatalogEntrySelectionError,
  isLegacyTemplateSelectableForPerson,
} from "@/server/work-catalog";
import { parseDateOnly } from "@/server/work-dates";
import { getEvidenceStorageProvider } from "@/server/storage";
import {
  planContentLockMessage,
  validatePlanItemLink,
} from "@/server/planning";
import { ReportingPeriodError, resolveReportingPeriod } from "@/server/reporting-period";

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
        // Liên thông YC-32 → kết quả đánh giá: công việc đã đưa vào bảng kết quả tháng hay chưa.
        monthlyResults: {
          select: { id: true, periodYear: true, periodMonth: true, needsReview: true },
          orderBy: { periodYear: "desc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    const enrichedItems = items.map((it) => ({
      ...it,
      isCustom: !it.templateId && !it.deptWorkItemId && !it.catalogEntryId,
      customTitle: it.title,
      // Đã đưa vào kết quả đánh giá chưa (hiển thị trạng thái trong Nhật ký công việc).
      inEvaluation: it.monthlyResults.length > 0,
      evaluationPeriods: it.monthlyResults.map((m) => ({
        year: m.periodYear,
        month: m.periodMonth,
        needsReview: m.needsReview,
      })),
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
      assignedQty,
      quantityUnit,
      factorSnapshot,
      status,
      periodType,
      periodYear,
      periodNumber,
      idempotencyKey, // YC-38C: khoá idempotency cap request (token do client sinh)
    } = body;

    const targetPersonId = personId || user.personId;

    const parseQty = (raw: unknown): number | null => {
      if (raw === undefined || raw === null || raw === "") return null;
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : NaN;
    };
    const parsedAssignedQty = parseQty(assignedQty);
    const parsedFactor = parseQty(factorSnapshot);
    if (Number.isNaN(parsedAssignedQty) || Number.isNaN(parsedFactor)) {
      return jsonError("Số lượng hoặc hệ số quy đổi không hợp lệ", 400);
    }

    // Tự động phân giải title, groupId, priority nếu truyền templateId
    let resolvedTitle = title || customTitle;
    let resolvedGroupId = groupId || null;
    let resolvedPriority = priority || "Trung bình";

    if (templateId) {
      // YC-31: chỉ chặn mẫu cũ khi BỘ PHẬN CỦA CÁN BỘ ĐƯỢC TẠO đã chuyển sang TX.
      // Bộ phận chưa kích hoạt vẫn dùng mẫu cũ bình thường.
      if (!(await isLegacyTemplateSelectableForPerson(targetPersonId))) {
        return jsonError(
          "Bộ phận của cán bộ đã chuyển sang Danh mục công việc thường xuyên — không chọn mẫu cũ khi tạo mới",
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
      // Chỉ cho gắn đầu việc TX thuộc nhóm đã kích hoạt cho đúng bộ phận của cán bộ.
      const selectionError = await getCatalogEntrySelectionError(targetPersonId, entry);
      if (selectionError) return jsonError(selectionError, 403);
      resolvedCatalogEntryId = entry.id;
      if (!resolvedTitle?.trim()) resolvedTitle = entry.title;
    }


    // YC-32: hạn xử lý và ngày hoàn thành thực tế (tách biệt nhau).
    // A4: không cho TẠO đầu việc ở trạng thái hoàn thành hoặc kèm ngày hoàn thành.
    // Việc hoàn thành phải đi qua luồng "Báo hoàn thành & gửi lãnh đạo".
    const dueParsed = parseDateOnly(dueDate);
    if (!dueParsed.ok) return jsonError(`Hạn xử lý: ${dueParsed.message}`, 400);
    const hasCompletedDateInput =
      completedDate !== undefined &&
      completedDate !== null &&
      String(completedDate).trim() !== "";
    if (hasCompletedDateInput || status === "COMPLETED") {
      return jsonError(
        "Không được tạo đầu việc ở trạng thái hoàn thành. Hãy tạo ở trạng thái đang thực hiện, sau đó báo hoàn thành để lãnh đạo xác nhận.",
        409
      );
    }
    const allowedCreateStatuses = ["ACTIVE", "NOT_STARTED", "IN_PROGRESS"];
    if (status !== undefined && status !== null && status !== "" && !allowedCreateStatuses.includes(status)) {
      return jsonError("Trạng thái đầu việc khi tạo mới không hợp lệ", 400);
    }

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

    // --- YC-38C: provenance bất biến (nguồn + mã tham chiếu + mã danh mục tại thời điểm tạo) ---
    // TX (danh mục công việc) và QĐ1277 (danh mục sản phẩm) là HAI trục ĐỘC LẬP:
    // một việc có thể có cả đầu việc TX lẫn sản phẩm QĐ1277; nguồn chính ghi 1 trục.
    let resolvedSourceKind: string | null = null;
    let resolvedSourceRefId: string | null = null;
    let resolvedSourceCodeSnapshot: string | null = null;
    if (resolvedCatalogEntryId) {
      const entry = await prisma.workCatalogEntry.findUnique({
        where: { id: resolvedCatalogEntryId },
        select: { code: true },
      });
      resolvedSourceKind = "TX_CATALOG";
      resolvedSourceRefId = resolvedCatalogEntryId;
      resolvedSourceCodeSnapshot = entry?.code ?? null;
    } else if (resolvedProductItemId) {
      const prod = await prisma.productItem.findUnique({
        where: { id: resolvedProductItemId },
        select: { code: true },
      });
      resolvedSourceKind = "QD1277_PRODUCT";
      resolvedSourceRefId = resolvedProductItemId;
      resolvedSourceCodeSnapshot = prod?.code ?? null;
    } else if (templateId) {
      const tpl = await prisma.activityTemplate.findUnique({
        where: { id: templateId },
        select: { code: true },
      });
      resolvedSourceKind = "LEGACY_TEMPLATE";
      resolvedSourceRefId = templateId;
      resolvedSourceCodeSnapshot = tpl?.code ?? null;
    } else if (resolvedDeptWorkItemId) {
      resolvedSourceKind = "DEPT";
      resolvedSourceRefId = resolvedDeptWorkItemId;
    } else if (planItemId) {
      resolvedSourceKind = "PLAN";
      resolvedSourceRefId = planItemId;
    } else if (resolvedTaskId) {
      resolvedSourceKind = "TASK";
      resolvedSourceRefId = resolvedTaskId;
    } else {
      resolvedSourceKind = "CUSTOM";
    }

    // Tự động phân giải hoặc tạo ReportingPeriod nếu truyền periodType, periodYear, periodNumber.
    // Helper dùng chung với lập kế hoạch, hỗ trợ Ngày/Tuần/Tháng và không tạo kỳ trùng.
    if (!periodId && periodType) {
      try {
        const period = await resolveReportingPeriod({
          type: periodType,
          date: periodType === "DAY" && workDate ? workDate : undefined,
          year: periodYear,
          monthNumber: periodType === "MONTH" || periodType === "MONTHLY" ? periodNumber : undefined,
          weekNumber: periodType === "WEEK" || periodType === "WEEKLY" ? periodNumber : undefined,
        });
        periodId = period.id;
      } catch (err: any) {
        if (err instanceof ReportingPeriodError) {
          return jsonError(err.message, err.statusCode);
        }
        throw err;
      }
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

    // Phân quyền theo phạm vi đơn vị: cán bộ chỉ tạo cho mình; lãnh đạo chỉ tạo cho
    // cán bộ thuộc đơn vị trong phạm vi được cấp.
    const targetPerson = await prisma.person.findUnique({
      where: { id: targetPersonId },
      select: {
        id: true,
        status: true,
        fullName: true,
        assignments: { select: { unitId: true } },
      },
    });
    if (!targetPerson || targetPerson.status !== "ACTIVE") {
      return jsonError("Cán bộ phụ trách không tồn tại hoặc đã ngừng hoạt động", 400);
    }
    if (targetPersonId !== user.personId) {
      if (user.role === "STAFF") {
        return jsonError("Cán bộ chỉ được tạo danh mục đầu việc cho chính mình", 403);
      }
      const authorizedUnits = await getAuthorizedUnitIds(user);
      const isBelong = targetPerson.assignments.some(
        (a) => authorizedUnits === "ALL" || authorizedUnits.includes(a.unitId)
      );
      if (!isBelong) {
        return jsonError("Bạn chỉ được tạo đầu việc cho cán bộ thuộc bộ phận của mình", 403);
      }
    }

    // Q-B4/A-1: không ghi con trỏ sản phẩm QĐ1277 khi lãnh đạo tạo hộ.
    // Người thực hiện phải tự đề xuất sản phẩm để có bản ghi WorkItemProduct
    // và trạng thái xác nhận tương ứng; tránh liên kết mồ côi.
    if (resolvedProductItemId && targetPersonId !== user.personId) {
      return jsonError(
        "Chỉ người thực hiện công việc mới được gắn sản phẩm QĐ1277 khi tạo đầu việc.",
        403
      );
    }

    // A2: hạng mục kế hoạch phải tồn tại, đúng kỳ, đúng đơn vị và kế hoạch còn được sửa.
    // Không để lỗi khóa ngoại (500) hoặc âm thầm lưu planItemId sai.
    if (planItemId) {
      const link = await validatePlanItemLink({
        planItemId,
        personId: targetPersonId,
        periodId,
        user,
      });
      if (!link.ok) {
        return jsonError(link.message || "Liên kết hạng mục kế hoạch không hợp lệ", link.status || 400);
      }
    }

    const normalizedIdempotencyKey =
      idempotencyKey !== undefined && idempotencyKey !== null
        ? String(idempotencyKey).trim()
        : "";
    if (normalizedIdempotencyKey.length > 120) {
      return jsonError("Mã chống gửi trùng không được vượt quá 120 ký tự", 400);
    }
    if (normalizedIdempotencyKey) {
      const replay = await prisma.personalWorkItem.findFirst({
        where: { personId: targetPersonId, idempotencyKey: normalizedIdempotencyKey },
        include: {
          person: true,
          group: true,
          period: true,
          planItem: { include: { plan: true } },
        },
      });
      if (replay) {
        return NextResponse.json({
          success: true,
          data: replay,
          deduplicated: true,
          message: "Yêu cầu đã được xử lý trước đó (chặn gửi trùng)",
        });
      }
    }

    // Tính thứ tự sắp xếp tiếp theo
    const maxSort = await prisma.personalWorkItem.aggregate({
      where: { personId: targetPersonId, periodId },
      _max: { sortOrder: true },
    });

    let resolvedFactor = parsedFactor;
    if (resolvedFactor === null) {
      if (resolvedProductItemId) {
        const product = await prisma.productItem.findUnique({
          where: { id: resolvedProductItemId },
          select: { convertFactor: true },
        });
        resolvedFactor = product?.convertFactor ?? null;
      } else if (resolvedCatalogEntryId) {
        const entry = await prisma.workCatalogEntry.findUnique({
          where: { id: resolvedCatalogEntryId },
          select: { convertFactor: true },
        });
        resolvedFactor = entry?.convertFactor == null ? null : Number(entry.convertFactor);
      }
    }

    let newItem: any;
    try {
      newItem = await prisma.personalWorkItem.create({
        data: {
          personId: targetPersonId,
          periodId,
          planItemId: planItemId || null,
          templateId: templateId || null, // null nếu là đầu việc tự thêm ngoài danh mục 48 mẫu
          deptWorkItemId: resolvedDeptWorkItemId, // YC-25: nguồn danh mục đầu việc riêng của bộ phận
          productItemId: resolvedProductItemId, // YC-23: sản phẩm đầu ra theo QĐ1277 (tuỳ chọn)
          catalogEntryId: resolvedCatalogEntryId, // YC-31: đầu việc TX (tuỳ chọn)
          dueDate: dueParsed.value ?? null, // YC-32
          completedDate: null, // A4: chỉ đặt qua luồng báo hoàn thành
          taskId: resolvedTaskId, // YC-32
          groupId: resolvedGroupId,
          title: resolvedTitle.trim(),
          workDate: workDate ? new Date(workDate) : null,
          dateText: dateText?.trim() || null,
          coordinationUnit: coordinationUnit?.trim() || null,
          priority: resolvedPriority,
          expectedResult: expectedResult?.trim() || null,
          assignedQty: parsedAssignedQty,
          quantityUnit: quantityUnit?.trim() || null,
          factorSnapshot: resolvedFactor,
          sortOrder: (maxSort._max.sortOrder || 0) + 1,
          status: status || "ACTIVE",
          // --- YC-38C: provenance bất biến + đầu mối chủ trì ---
          sourceKind: resolvedSourceKind,
          sourceRefId: resolvedSourceRefId,
          sourceCodeSnapshot: resolvedSourceCodeSnapshot,
          primaryOwnerPersonId: targetPersonId,
          idempotencyKey: normalizedIdempotencyKey || null,
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
    } catch (error: any) {
      if (error?.code === "P2002" && normalizedIdempotencyKey) {
        const replay = await prisma.personalWorkItem.findFirst({
          where: { personId: targetPersonId, idempotencyKey: normalizedIdempotencyKey },
          include: {
            person: true,
            group: true,
            period: true,
            planItem: { include: { plan: true } },
          },
        });
        if (replay) {
          return NextResponse.json({
            success: true,
            data: replay,
            deduplicated: true,
            message: "Yêu cầu đã được xử lý trước đó (chặn gửi trùng)",
          });
        }
      }
      throw error;
    }

    // --- YC-38C: bảng phân công (1 việc gốc, nhiều người) + liên kết sản phẩm QĐ1277 ---
    await prisma.workItemAssignment.createMany({
      data: [
        {
          workItemId: newItem.id,
          personId: targetPersonId,
          periodId,
          role: "PRIMARY_OWNER",
          status: "ASSIGNED",
          assignedById: user.personId,
        },
      ],
      skipDuplicates: true,
    });
    if (resolvedProductItemId) {
      await prisma.workItemProduct.createMany({
        data: [{ workItemId: newItem.id, productItemId: resolvedProductItemId, isPrimary: true }],
        skipDuplicates: true,
      });
    }
    // --- YC-38C: liên kết NGƯỢC hạng mục kế hoạch → đúng công việc (không trỏ items[0]) ---
    if (planItemId) {
      await prisma.planItem.updateMany({
        where: { id: planItemId, workItemId: null },
        data: { workItemId: newItem.id },
      });
    }

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
      assignedQty,
      quantityUnit,
      factorSnapshot,
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

    // A4: kế hoạch đang trình duyệt thì khóa toàn bộ nội dung/đầu việc;
    // chờ trả lại hoặc phê duyệt xong mới thao tác tiếp.
    if (currentItem.planItem?.plan?.status === "SUBMITTED") {
      return jsonError(
        planContentLockMessage(currentItem.planItem.plan) ||
          "Kế hoạch đang chờ phê duyệt — nội dung đã khóa.",
        409
      );
    }

    // V3-F01 (P0): công việc TỰ GHI NHẬN chỉ hoàn thành được qua luồng
    // "Báo hoàn thành & gửi lãnh đạo". Không cho gán/xoá ngày hoàn thành hay trạng thái
    // COMPLETED bằng cách khác (tránh tự xác nhận nghiệp vụ & tạo dữ liệu đủ điều kiện
    // tính điểm mà không qua lãnh đạo). Công việc đã gắn NHIỆM VỤ giữ nguyên luồng V1/V2.
    const hasCompletedDateValue =
      completedDate !== undefined &&
      completedDate !== null &&
      String(completedDate).trim() !== "";
    const attemptsCompletion =
      status === "COMPLETED" ||
      hasCompletedDateValue ||
      (completedDate !== undefined && currentItem.completedDate !== null);
    if (!currentItem.taskId && attemptsCompletion) {
      return jsonError(
        "Công việc tự ghi nhận chỉ được hoàn thành qua luồng \"Báo hoàn thành & gửi lãnh đạo\" (có nội dung kết quả và ngày hoàn thành thực tế).",
        409
      );
    }

    const allowedUpdateStatuses = [
      "ACTIVE",
      "NOT_STARTED",
      "IN_PROGRESS",
      "COMPLETED",
      "DISCONTINUED",
    ];
    if (status !== undefined && status !== null && !allowedUpdateStatuses.includes(status)) {
      return jsonError("Trạng thái đầu việc không hợp lệ", 400);
    }

    // V3.0.1 — D1-A + R3-C: hồ sơ đang chờ xác nhận hoặc đã xác nhận ⇒ KHOÁ chỉnh sửa.
    if (isWorkItemReviewLocked(currentItem)) {
      return jsonError(
        currentItem.reviewState === "CONFIRMED"
          ? "Công việc đã được lãnh đạo xác nhận — không thể chỉnh sửa. Nếu cần điều chỉnh, vui lòng gửi đề nghị điều chỉnh."
          : "Công việc đang chờ lãnh đạo xác nhận — không thể chỉnh sửa. Khi lãnh đạo trả lại, bạn sẽ sửa và gửi lại được.",
        409
      );
    }

    // E1: đầu việc thuộc kế hoạch đã duyệt/có hiệu lực thì khóa phần nội dung.
    // YC-32: vẫn cho cập nhật ngày hoàn thành, trạng thái thực hiện và liên kết nhiệm vụ
    // (đây là dữ liệu thực hiện, không phải thay đổi cam kết của kế hoạch).
    const planLocked =
      !!currentItem.planItem?.plan &&
      (currentItem.planItem.plan.status === "APPROVED" ||
        currentItem.planItem.plan.status === "IN_EFFECT");

    // YC-32 (chốt 20/10/2026): hạn xử lý gốc KHÔNG được tự sửa sau khi kế hoạch đã duyệt.
    // Chưa có quy trình gia hạn được phê duyệt → khóa hẳn, trả 403 và ghi nhật ký truy cập bị từ chối.
    if (planLocked && dueDate !== undefined) {
      await recordAuditEvent({
        actorId: user.id,
        action: "PERSONAL_WORK_ITEM_DUE_DATE_DENIED",
        resourceType: "PersonalWorkItem",
        resourceId: currentItem.id,
        oldData: {
          dueDate: currentItem.dueDate,
          planId: currentItem.planItem?.plan?.id || null,
          planStatus: currentItem.planItem?.plan?.status || null,
        },
        newData: { requestedDueDate: dueDate },
      });
      return jsonError(
        `Kế hoạch "${currentItem.planItem?.plan?.title}" đã phê duyệt — hạn xử lý đã khóa. Chưa có quy trình gia hạn được duyệt nên không thể tự chỉnh hạn gốc; vẫn có thể cập nhật tiến độ/ngày hoàn thành thực tế.`,
        403
      );
    }

    if (planLocked) {
      const contentFields = [
        ["title", title],
        ["groupId", groupId],
        ["workDate", workDate],
        ["dateText", dateText],
        ["coordinationUnit", coordinationUnit],
        ["priority", priority],
        ["expectedResult", expectedResult],
        ["assignedQty", assignedQty],
        ["quantityUnit", quantityUnit],
        ["factorSnapshot", factorSnapshot],
        ["sortOrder", sortOrder],
        ["planItemId", planItemId],
        ["templateId", templateId],
        ["deptWorkItemId", deptWorkItemId],
        ["productItemId", productItemId],
        ["catalogEntryId", catalogEntryId],
      ].filter(([, value]) => value !== undefined);
      if (contentFields.length > 0) {
        return jsonError(
          `Kế hoạch "${currentItem.planItem?.plan?.title}" đã phê duyệt — chỉ được cập nhật ngày hoàn thành/trạng thái thực hiện; hãy dùng “Trình duyệt bổ sung” để sửa nội dung`,
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
      // Chỉ chặn khi ĐỔI SANG mẫu cũ. Giữ nguyên liên kết lịch sử thì vẫn cho phép.
      if (
        templateId !== currentItem.templateId &&
        !(await isLegacyTemplateSelectableForPerson(currentItem.personId))
      ) {
        return jsonError(
          "Bộ phận của cán bộ đã chuyển sang Danh mục công việc thường xuyên — không chọn mẫu cũ",
          403
        );
      }
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
      if (catalogEntryId && catalogEntryId !== currentItem.catalogEntryId) {
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
        const selectionError = await getCatalogEntrySelectionError(currentItem.personId, entry);
        if (selectionError) return jsonError(selectionError, 403);
        linkUpdate.catalogEntryId = entry.id;
        linkUpdate.templateId = null;
        linkUpdate.deptWorkItemId = null;
      } else if (!catalogEntryId) {
        linkUpdate.catalogEntryId = null;
      }
      // catalogEntryId === currentItem.catalogEntryId: giữ nguyên liên kết lịch sử,
      // kể cả khi nhóm đã bị ngừng kích hoạt hoặc phiên bản đã bị thay thế.
    }
    // YC-23: đổi/thiết lập sản phẩm đầu ra theo QĐ1277 (tuỳ chọn, độc lập với nguồn đầu việc)
    // Q-B4/A-1: chỉ người thực hiện được thay đổi con trỏ sản phẩm chính.
    // Lãnh đạo sửa nội dung/giao việc nhưng không thay cán bộ đề xuất sản phẩm.
    if (productItemId !== undefined && currentItem.personId !== user.personId) {
      return jsonError(
        "Chỉ người thực hiện công việc mới được gắn/bỏ sản phẩm QĐ1277.",
        403
      );
    }
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
    if (title && title.trim()) updateData.title = title.trim();
    if (groupId !== undefined) updateData.groupId = groupId || null;
    if (workDate !== undefined) {
      const parsed = parseDateOnly(workDate);
      if (!parsed.ok) return jsonError(`Ngày thực hiện: ${parsed.message}`, 400);
      updateData.workDate = parsed.value ?? null;
    }
    if (dateText !== undefined) updateData.dateText = dateText?.trim() || null;
    if (coordinationUnit !== undefined) updateData.coordinationUnit = coordinationUnit?.trim() || null;
    if (priority !== undefined) updateData.priority = priority;
    if (expectedResult !== undefined) updateData.expectedResult = expectedResult?.trim() || null;
    if (assignedQty !== undefined) updateData.assignedQty = assignedQty === null || assignedQty === "" ? null : Number(assignedQty);
    if (quantityUnit !== undefined) updateData.quantityUnit = quantityUnit?.trim() || null;
    if (factorSnapshot !== undefined) updateData.factorSnapshot = factorSnapshot === null || factorSnapshot === "" ? null : Number(factorSnapshot);
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (status) updateData.status = status; // ACTIVE, NOT_STARTED, IN_PROGRESS, COMPLETED, DISCONTINUED

    // A2: đổi hạng mục phải kiểm tra tồn tại/đúng kỳ/đúng phạm vi/kế hoạch còn sửa.
    if (planItemId !== undefined) {
      if (!planItemId) {
        updateData.planItemId = null;
      } else {
        const link = await validatePlanItemLink({
          planItemId,
          personId: currentItem.personId,
          periodId: currentItem.periodId,
          user,
        });
        if (!link.ok) {
          return jsonError(link.message || "Liên kết hạng mục kế hoạch không hợp lệ", link.status || 400);
        }
        updateData.planItemId = link.planItem!.id;
      }
    }

    // YC-32: hạn xử lý (độc lập với ngày hoàn thành)
    if (dueDate !== undefined) {
      const parsed = parseDateOnly(dueDate);
      if (!parsed.ok) return jsonError(`Hạn xử lý: ${parsed.message}`, 400);
      updateData.dueDate = parsed.value ?? null;
    }
    // YC-32: ngày hoàn thành thực tế quyết định trạng thái; xóa ngày → trả về đang thực hiện.
    // A2: client cũ gửi completedDate=null trên mọi lần sửa — coi là KHÔNG thay đổi nếu
    // đầu việc chưa có ngày hoàn thành, tránh 409 giả và tránh tự đổi trạng thái.
    if (completedDate !== undefined) {
      const parsed = parseDateOnly(completedDate);
      if (!parsed.ok) return jsonError(`Ngày hoàn thành: ${parsed.message}`, 400);
      if (parsed.value) {
        updateData.completedDate = parsed.value;
        updateData.status = "COMPLETED";
      } else if (currentItem.completedDate) {
        updateData.completedDate = null;
        if (status === undefined) updateData.status = "IN_PROGRESS";
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
        // V1 (YC-38 UAT-D5.1): không cho liên kết đầu việc vào nhiệm vụ đã nghiệm thu/kết thúc
        if (isTerminalTaskStatus(task.status)) {
          return jsonError(
            `Nhiệm vụ ${task.code} đã được nghiệm thu/kết thúc — không thể liên kết đầu việc vào nhiệm vụ đã đóng.`,
            409
          );
        }
        updateData.taskId = task.id;
      } else {
        updateData.taskId = null;
      }
    }

    Object.assign(updateData, linkUpdate);

    // V1 (YC-38 UAT-D5.1): khoá đầu việc gắn với nhiệm vụ đã nghiệm thu.
    // Kiểm tra trong transaction, đọc lại liên kết từ SERVER (không tin client gửi) và
    // khoá dòng task (FOR UPDATE) để không tranh chấp với luồng nghiệm thu.
    let updated: any;
    try {
      updated = await prisma.$transaction(async (tx) => {
        await assertWorkItemNotLinkedToClosedTask(id, tx);
        // Giữ nhất quán giữa con trỏ sản phẩm chính và các liên kết QĐ1277.
        // PATCH cũ chỉ đổi productItemId, có thể tạo liên kết mồ côi.
        if (linkUpdate.productItemId !== undefined) {
          const targetProductId: string | null = linkUpdate.productItemId;
          await tx.workItemProduct.updateMany({
            where: { workItemId: id },
            data: { isPrimary: false },
          });
          if (targetProductId) {
            const existingLink = await tx.workItemProduct.findFirst({
              where: { workItemId: id, productItemId: targetProductId },
              select: { id: true },
            });
            if (existingLink) {
              await tx.workItemProduct.update({
                where: { id: existingLink.id },
                data: { isPrimary: true },
              });
            } else {
              await tx.workItemProduct.create({
                data: {
                  workItemId: id,
                  productItemId: targetProductId,
                  isPrimary: true,
                  reviewState: "PROPOSED",
                  proposedById: user.personId,
                  proposedAt: new Date(),
                },
              });
            }
          }
        }
        return tx.personalWorkItem.update({
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
      });
    } catch (err: any) {
      // V1: lỗi khoá nghiệp vụ trả đúng mã (409) thay vì 500
      if (err?.statusCode) return jsonError(err.message, err.statusCode);
      throw err;
    }

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

    // A4 + E1: kế hoạch đang trình duyệt/đã duyệt/có hiệu lực thì khóa xóa.
    if (
      currentItem.planItem?.plan &&
      (currentItem.planItem.plan.status === "SUBMITTED" ||
        currentItem.planItem.plan.status === "APPROVED" ||
        currentItem.planItem.plan.status === "IN_EFFECT")
    ) {
      return jsonError(
        currentItem.planItem.plan.status === "SUBMITTED"
          ? `Kế hoạch "${currentItem.planItem.plan.title}" đang chờ phê duyệt — không thể xóa đầu việc. Hãy yêu cầu trả lại nếu cần sửa.`
          : `Kế hoạch "${currentItem.planItem.plan.title}" đã phê duyệt — hãy dùng “Trình duyệt bổ sung” thay vì xóa trực tiếp`,
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

    // V1 (YC-38 UAT-D5.1): đầu việc gắn với nhiệm vụ đã nghiệm thu ⇒ không cho xoá/đổi trạng thái.
    // Đọc lại liên kết từ SERVER + khoá dòng task trong transaction.
    try {
      await assertWorkItemNotLinkedToClosedTask(id);
    } catch (err: any) {
      if (err?.statusCode) return jsonError(err.message, err.statusCode);
      throw err;
    }

    // Nếu đầu việc đã có nhật ký hoặc liên kết ràng buộc, chuyển sang DISCONTINUED để bảo toàn dữ liệu
    if (currentItem.routines.length > 0) {
      let discontinued: any;
      try {
        discontinued = await prisma.$transaction(async (tx) => {
          await assertWorkItemNotLinkedToClosedTask(id, tx);
          return tx.personalWorkItem.update({
            where: { id },
            data: { status: "DISCONTINUED" },
          });
        });
      } catch (err: any) {
        if (err?.statusCode) return jsonError(err.message, err.statusCode);
        throw err;
      }
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

    // Ngược lại nếu chưa có ràng buộc, xóa bản ghi (trong transaction + khoá theo nhiệm vụ)
    try {
      await prisma.$transaction(async (tx) => {
        await assertWorkItemNotLinkedToClosedTask(id, tx);
        await tx.personalWorkItem.delete({ where: { id } });
      });
    } catch (err: any) {
      if (err?.statusCode) return jsonError(err.message, err.statusCode);
      throw err;
    }

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

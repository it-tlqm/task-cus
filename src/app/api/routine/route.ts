import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { assertPeriodWritable } from "@/server/period-guard";
import { recordAuditEvent } from "@/server/audit";
import { getIsoWeekFromDate } from "@/lib/period-helper";
import { parseDateOnly, todayInVietnam } from "@/server/work-dates";
import { getCatalogEntrySelectionError } from "@/server/work-catalog";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    // F18: loc du lieu mau (nguon [DEMO]) khi hien thi — KHONG xoa du lieu
    const hideDemo = searchParams.get("hideDemo") === "1";
    const periodId = searchParams.get("periodId");
    const personId = searchParams.get("personId");
    const unitId = searchParams.get("unitId");
    const occurrenceStatus = searchParams.get("occurrenceStatus");
    const id = searchParams.get("id");
    // V3 UX 2B1: loc theo ngay lam viec (DATE-ONLY, khong quy doi mui gio)
    const workDateParam = searchParams.get("workDate");
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const parsedWorkDate = workDateParam ? parseDateOnly(workDateParam) : null;
    if (parsedWorkDate && !parsedWorkDate.ok) {
      return jsonError(parsedWorkDate.message, 400);
    }
    const parsedFrom = fromParam ? parseDateOnly(fromParam) : null;
    if (parsedFrom && !parsedFrom.ok) {
      return jsonError(parsedFrom.message, 400);
    }
    const parsedTo = toParam ? parseDateOnly(toParam) : null;
    if (parsedTo && !parsedTo.ok) {
      return jsonError(parsedTo.message, 400);
    }
    const workDateExact = parsedWorkDate?.value ?? null;
    const workDateFrom = parsedFrom?.value ?? null;
    const workDateTo = parsedTo?.value ?? null;
    if (workDateFrom && workDateTo && workDateFrom > workDateTo) {
      return jsonError("Khoảng ngày không hợp lệ: 'from' phải trước hoặc bằng 'to'", 400);
    }

    const authorizedUnits = await getAuthorizedUnitIds(user);
    if (unitId && authorizedUnits !== "ALL" && !authorizedUnits.includes(unitId)) {
      return NextResponse.json(
        { error: "Không có quyền truy cập dữ liệu của bộ phận này" },
        { status: 403 }
      );
    }

    // Nếu cán bộ có scopeType là OWN, chỉ được xem bản ghi của chính mình
    if (user.scopeType === "OWN") {
      if (personId && personId !== user.personId) {
        return NextResponse.json(
          { error: "Bạn chỉ có quyền xem nhật ký tác nghiệp của chính mình" },
          { status: 403 }
        );
      }
    }

    const unitFilter = unitId
      ? { unitId }
      : authorizedUnits === "ALL"
      ? {}
      : { unitId: { in: authorizedUnits } };

    const targetPersonId = user.scopeType === "OWN" ? user.personId : (personId || undefined);

    const entries = await prisma.routineEntry.findMany({
      where: {
        ...unitFilter,
        ...(id ? { id } : {}),
        ...(periodId ? { periodId } : {}),
        ...(targetPersonId ? { personId: targetPersonId } : {}),
        ...(occurrenceStatus ? { occurrenceStatus } : {}),
        // V3 UX 2B1: workDate chinh xac uu tien; neu khong co thi loc theo khoang from/to.
        ...(workDateExact
          ? { workDate: workDateExact }
          : workDateFrom || workDateTo
          ? {
              workDate: {
                ...(workDateFrom ? { gte: workDateFrom } : {}),
                ...(workDateTo ? { lte: workDateTo } : {}),
              },
            }
          : {}),
        // F18: an du lieu mau (nguon [DEMO]) khi yeu cau - khong xoa, chi loc khi hien thi
        ...(hideDemo
          ? {
              AND: [
                { NOT: { workItem: { title: { startsWith: "[DEMO]" } } } },
                { NOT: { notes: { startsWith: "[DEMO]" } } },
              ],
            }
          : {}),
      } as any,
      include: {
        person: true,
        unit: true,
        template: {
          include: {
            group: true,
          },
        },
        workItem: true,
        catalogEntry: { select: { id: true, code: true, title: true, convertFactor: true } },
        catalogTags: {
          include: {
            catalogEntry: { select: { id: true, code: true, title: true, department: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        },
        productItem: { select: { id: true, code: true, taskName: true, convertFactor: true } },
        submissions: {
          include: {
            values: true,
            formVersion: {
              include: {
                formTemplate: true,
              },
            },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Lấy phiên bản biểu mẫu động đang hoạt động (ACTIVE / PUBLISHED)
    const activeFormVersion =
      (await prisma.formTemplateVersion.findFirst({
        where: { status: "ACTIVE" },
        include: { formTemplate: true },
        orderBy: { createdAt: "desc" },
      })) ||
      (await prisma.formTemplateVersion.findFirst({
        where: { status: "PUBLISHED" },
        include: { formTemplate: true },
        orderBy: { createdAt: "desc" },
      }));

    // Chuẩn hóa dữ liệu trả về cho Frontend, bóc tách chính xác từ SubmissionValue
    const formattedEntries = entries.map((entry) => {
      const firstSub = entry.submissions[0];
      const subValues = firstSub?.values || [];
      const formValues: Record<string, any> = {};

      for (const val of subValues) {
        if (val.valueNumber !== null && val.valueNumber !== undefined) {
          formValues[val.fieldKey] = val.valueNumber;
        } else if (val.valueJson !== null && val.valueJson !== undefined) {
          formValues[val.fieldKey] = val.valueJson;
        } else {
          formValues[val.fieldKey] = val.valueText;
        }
      }

      const isNotOccurred = entry.occurrenceStatus === "NOT_OCCURRED";

      // Nếu không phát sinh, không gán giá trị giả lập
      const companyName = isNotOccurred
        ? null
        : formValues["company_name"] || formValues["f2"] || null;

      const containerCount = isNotOccurred
        ? null
        : formValues["container_count"] !== undefined
        ? Number(formValues["container_count"])
        : formValues["f1"] !== undefined && typeof formValues["f1"] === "number"
        ? formValues["f1"]
        : null;

      const timeSpent = formValues["time_spent"] || (isNotOccurred ? "0 giờ" : "Theo ca trực");
      const progressPercent =
        formValues["progress_percent"] !== undefined
          ? Number(formValues["progress_percent"])
          : 100;

      return {
        id: entry.id,
        periodId: entry.periodId,
        personId: entry.personId,
        unitId: entry.unitId,
        templateId: entry.templateId,
        workItemId: entry.workItemId,
        occurrenceStatus: entry.occurrenceStatus,
        notes: entry.notes,
        catalogEntryId: entry.catalogEntryId,
        catalogTags: entry.catalogTags.map((tag) => ({
          id: tag.id,
          catalogEntryId: tag.catalogEntryId,
          code: tag.catalogEntry.code,
          title: tag.catalogEntry.title,
          department: tag.catalogEntry.department,
          sortOrder: tag.sortOrder,
        })),
        workDate: entry.workDate ? entry.workDate.toISOString().slice(0, 10) : null,
        shift: entry.shift,
        productItemId: entry.productItemId,
        proposedProducts: entry.proposedProducts ? JSON.parse(entry.proposedProducts) : [],
        sourceKind: entry.sourceKind,
        sourceCodeSnapshot: entry.sourceCodeSnapshot,
        reviewState: entry.reviewState || (entry.workItemId ? entry.workItem?.reviewState : null) || "DRAFT",
        dataOrigin: entry.dataOrigin,
        catalogEntry: entry.catalogEntry
          ? { id: entry.catalogEntry.id, code: entry.catalogEntry.code, title: entry.catalogEntry.title }
          : null,
        productItem: entry.productItem
          ? { id: entry.productItem.id, code: entry.productItem.code, taskName: entry.productItem.taskName }
          : null,
        createdAt: entry.createdAt.toISOString(),
        person: entry.person,
        unit: entry.unit,
        template: entry.template,
        workItem: entry.workItem,
        // Dữ liệu nghiệp vụ thực tế
        companyName,
        containerCount,
        timeSpent,
        progressPercent,
        formValues,
        formVersion: firstSub?.formVersion || null,
        submissionId: firstSub?.id || null,
      };
    });

    return NextResponse.json({
      success: true,
      entries: formattedEntries,
      activeFormVersion: activeFormVersion
        ? {
            id: activeFormVersion.id,
            formTemplateId: activeFormVersion.formTemplateId,
            templateCode: activeFormVersion.formTemplate?.code,
            templateName: activeFormVersion.formTemplate?.name,
            version: activeFormVersion.version,
            status: activeFormVersion.status,
            schemaJson: activeFormVersion.schemaJson,
          }
        : null,
    });
  } catch (err: any) {
    console.error("Error in GET /api/routine:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      periodId: inputPeriodId,
      templateId,
      workItemId,
      occurrenceStatus = "OCCURRED",
      notes,
      title,
      companyName,
      containerCount,
      progressPercent = 100,
      timeSpent = "Theo ca trực",
      formVersionId,
      formValues = {},
      // --- F18: danh muc TX + san pham QD1277 ---
      catalogEntryId: legacyCatalogEntryId = null,
      catalogEntryIds: inputCatalogEntryIds = null,
      workDate: inputWorkDate,
      shift: inputShift,
      productItemId = null,
      proposedProducts = [],
      notOccurredKind = null, // NO_VIOLATION | NO_ACTIVITY
      dataOrigin = null,     // REAL | DEMO
    } = body;

    // V3 UX 2B1 — xác thực N tag TX ở phía máy chủ.
    // `catalogEntryId` cũ vẫn được nhận. UI gửi cả hai (tag đầu trùng với tag cũ)
    // nên chỉ bổ sung tag cũ khi nó chưa có trong danh sách; trùng lặp TRONG danh
    // sách vẫn bị từ chối.
    const inputTagIds: string[] = [];
    if (inputCatalogEntryIds !== null && inputCatalogEntryIds !== undefined) {
      if (!Array.isArray(inputCatalogEntryIds)) {
        return jsonError("Danh sách công việc thường xuyên phải là một mảng mã đầu việc", 400);
      }
      const seenInputIds = new Set<string>();
      for (const rawId of inputCatalogEntryIds) {
        const id = String(rawId ?? "").trim();
        if (!id) continue;
        if (seenInputIds.has(id)) {
          return jsonError(
            "Danh sách công việc thường xuyên có mã trùng lặp — vui lòng chọn mỗi đầu việc một lần.",
            400
          );
        }
        seenInputIds.add(id);
        inputTagIds.push(id);
      }
    }
    const legacyTagId =
      legacyCatalogEntryId !== null &&
      legacyCatalogEntryId !== undefined &&
      String(legacyCatalogEntryId).trim()
        ? String(legacyCatalogEntryId).trim()
        : null;
    const requestedTagIds =
      legacyTagId && !inputTagIds.includes(legacyTagId)
        ? [legacyTagId, ...inputTagIds]
        : inputTagIds;
    if (requestedTagIds.length > 30) {
      return jsonError("Một bản ghi nhật ký chỉ được gắn tối đa 30 đầu việc thường xuyên", 400);
    }
    const seenTagIds = new Set<string>(requestedTagIds);

    let txEntries: Array<{
      id: string;
      code: string;
      title: string;
      convertFactor: unknown;
      status: string;
      department: string;
      version: { status: string };
    }> = [];
    if (seenTagIds.size > 0) {
      const foundEntries = await prisma.workCatalogEntry.findMany({
        where: { id: { in: [...seenTagIds] } },
        select: {
          id: true,
          code: true,
          title: true,
          convertFactor: true,
          status: true,
          department: true,
          version: { select: { status: true } },
        },
      });
      const byId = new Map(foundEntries.map((entry) => [entry.id, entry]));
      for (const id of requestedTagIds) {
        const entry = byId.get(id);
        if (!entry) {
          return jsonError("Công việc thường xuyên không tồn tại trong danh mục TX", 400);
        }
        const selectionError = await getCatalogEntrySelectionError(user.personId, entry);
        if (selectionError) return jsonError(selectionError, 400);
        txEntries.push(entry);
      }
    }
    const txEntry = txEntries[0] || null;

    // Ngày/ca làm việc: mặc định ngày VN hôm nay + CA_NGAY; không suy đoán ca thực tế.
    const parsedWorkDate = parseDateOnly(inputWorkDate);
    if (!parsedWorkDate.ok) return jsonError(parsedWorkDate.message, 400);
    const workDate =
      parsedWorkDate.value ?? new Date(`${todayInVietnam()}T00:00:00.000Z`);
    const normalizedShift =
      inputShift === null || inputShift === undefined || String(inputShift).trim() === ""
        ? "CA_NGAY"
        : String(inputShift).trim().toUpperCase();
    if (!["SANG", "CHIEU", "CA_NGAY"].includes(normalizedShift)) {
      return jsonError("Ca làm việc phải là SANG, CHIEU hoặc CA_NGAY", 400);
    }

    // Sản phẩm QĐ1277: chuẩn hoá danh sách, lấy hệ số từ danh mục, chặn trùng
    const proposed: Array<{
      productItemId: string; code: string; taskName: string; outputProduct: string | null;
      factor: number | null; quantity: number | null; unit: string | null; reviewState: string;
    }> = [];
    const seenProduct = new Set<string>();
    if (Array.isArray(proposedProducts)) {
      for (const raw of proposedProducts) {
        const pid = String(raw?.productItemId || "").trim();
        if (!pid) continue;
        if (seenProduct.has(pid)) {
          return jsonError("Danh sách sản phẩm có mã trùng lặp — vui lòng chọn mỗi mã một lần.", 400);
        }
        seenProduct.add(pid);
        const pi = await prisma.productItem.findUnique({
          where: { id: pid },
          select: { id: true, code: true, taskName: true, outputProduct: true, convertFactor: true, status: true },
        });
        if (!pi) return jsonError("Mã sản phẩm QĐ1277 không tồn tại trong danh mục", 400);
        proposed.push({
          productItemId: pi.id,
          code: pi.code,
          taskName: pi.taskName,
          outputProduct: pi.outputProduct ?? null,
          factor: pi.convertFactor === null || pi.convertFactor === undefined ? null : Number(pi.convertFactor),
          quantity: raw?.quantity === null || raw?.quantity === undefined || raw?.quantity === "" ? null : Number(raw.quantity),
          unit: raw?.unit ? String(raw.unit).trim() : null,
          reviewState: "PROPOSED", // đề xuất ≠ đã xác nhận
        });
      }
    }
    let mainProductId: string | null = productItemId ? String(productItemId) : null;
    if (mainProductId) {
      const pi = await prisma.productItem.findUnique({
        where: { id: mainProductId },
        select: { id: true, code: true, status: true },
      });
      if (!pi) return jsonError("Mã sản phẩm QĐ1277 không tồn tại trong danh mục", 400);
    }

    // F18 (E): phân biệt 2 loại "không phát sinh" — KHÔNG gán mã nghiệp vụ giả
    let finalTitle = title;
    let finalNotes = notes;
    if (occurrenceStatus === "NOT_OCCURRED" && notOccurredKind) {
      const isNoActivity = notOccurredKind === "NO_ACTIVITY";
      if (!finalTitle || !String(finalTitle).trim()) {
        finalTitle = isNoActivity
          ? "Xác nhận: ca trực không có hoạt động tác nghiệp"
          : "Xác nhận: ca trực không phát sinh vụ việc vi phạm hoặc tồn đọng";
      }
      if (!finalNotes || !String(finalNotes).trim()) {
        finalNotes = isNoActivity
          ? "Xác nhận 1-chạm: ca trực không có hoạt động tác nghiệp nào để ghi nhận."
          : "Xác nhận 1-chạm: ca trực không phát sinh vụ việc vi phạm hoặc tồn đọng.";
      }
    }

    // 1. Kiểm tra validation cơ bản
    if (!finalTitle || typeof finalTitle !== "string" || !String(finalTitle).trim()) {
      return NextResponse.json(
        { error: "Nội dung công việc tác nghiệp là bắt buộc" },
        { status: 400 }
      );
    }

    if (
      containerCount !== undefined &&
      containerCount !== null &&
      containerCount !== "" &&
      (isNaN(Number(containerCount)) || Number(containerCount) < 0)
    ) {
      return NextResponse.json(
        { error: "Số lượng container / phương tiện phải là số không âm" },
        { status: 400 }
      );
    }

    // 1b. Chặn hoạt động mẫu đã ngừng áp dụng (nhất quán với personal-work-items)
    if (templateId) {
      const routineTemplate = await prisma.activityTemplate.findUnique({
        where: { id: templateId },
        select: { id: true, reviewStatus: true },
      });
      if (!routineTemplate) {
        return NextResponse.json(
          { error: "Hoạt động mẫu không tồn tại trong danh mục" },
          { status: 400 }
        );
      }
      if (routineTemplate.reviewStatus === "RETIRED") {
        return NextResponse.json(
          { error: "Hoạt động mẫu này đã ngừng áp dụng, không thể ghi nhật ký mới" },
          { status: 400 }
        );
      }
    }

    // 2. Xác định kỳ báo cáo
    let periodId = inputPeriodId;
    if (!periodId) {
      const activePeriod = await prisma.reportingPeriod.findFirst({
        where: { type: "WEEK" },
        orderBy: { startAt: "desc" },
      });
      if (activePeriod) {
        periodId = activePeriod.id;
      } else {
        const currentIsoWeek = getIsoWeekFromDate(new Date());
        // Upsert theo unique (type, title): 2 request đồng thời không tạo trùng kỳ
        const newPeriod = await prisma.reportingPeriod.upsert({
          where: { type_title: { type: "WEEK", title: currentIsoWeek.standardTitle } },
          update: {},
          create: {
            type: "WEEK",
            title: currentIsoWeek.standardTitle,
            startAt: currentIsoWeek.startAt,
            endAt: currentIsoWeek.endInclusive,
            dueAt: new Date(currentIsoWeek.endInclusive.getTime() - 4 * 3600000),
          },
        });
        periodId = newPeriod.id;
      }
    }

    const targetPersonId = user.personId;
    const targetUnitId = user.unitId;

    if (!targetUnitId) {
      return NextResponse.json(
        { error: "Tài khoản chưa được gán bộ phận công tác" },
        { status: 400 }
      );
    }

    // E1: kỳ đã chốt thì khóa ghi nhật ký mới
    try {
      await assertPeriodWritable(periodId);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode || 423 });
    }

    // 3. Xác định phiên bản biểu mẫu áp dụng và kiểm tra tính hợp lệ của schema
    let targetFormVersion: any = null;
    if (occurrenceStatus === "OCCURRED") {
      if (formVersionId) {
        targetFormVersion = await prisma.formTemplateVersion.findUnique({
          where: { id: formVersionId },
          include: { formTemplate: true },
        });
      } else {
        targetFormVersion =
          (await prisma.formTemplateVersion.findFirst({
            where: { status: "ACTIVE" },
            include: { formTemplate: true },
            orderBy: { createdAt: "desc" },
          })) ||
          (await prisma.formTemplateVersion.findFirst({
            where: { status: "PUBLISHED" },
            include: { formTemplate: true },
            orderBy: { createdAt: "desc" },
          }));
      }

      // Kiểm tra schema validation nếu có fields được cấu hình
      if (targetFormVersion?.schemaJson) {
        const schema = targetFormVersion.schemaJson as any;
        const fields = Array.isArray(schema.fields) ? schema.fields : [];

        for (const field of fields) {
          const val = formValues[field.key];

          // Kiểm tra trường bắt buộc
          if (field.required && (val === undefined || val === null || val === "")) {
            return NextResponse.json(
              { error: `Trường bắt buộc '${field.label || field.key}' chưa được nhập` },
              { status: 400 }
            );
          }

          // Kiểm tra kiểu số
          if (
            (field.type === "number" || field.type === "INTEGER" || field.type === "FLOAT") &&
            val !== undefined &&
            val !== null &&
            val !== ""
          ) {
            const num = Number(val);
            if (isNaN(num)) {
              return NextResponse.json(
                { error: `Trường '${field.label || field.key}' phải có giá trị là số hợp lệ` },
                { status: 400 }
              );
            }
            if (field.min !== undefined && num < field.min) {
              return NextResponse.json(
                { error: `Trường '${field.label || field.key}' không được nhỏ hơn ${field.min}` },
                { status: 400 }
              );
            }
            if (field.max !== undefined && num > field.max) {
              return NextResponse.json(
                { error: `Trường '${field.label || field.key}' không được lớn hơn ${field.max}` },
                { status: 400 }
              );
            }
          }
        }
      }
    }

    // 4. Thực thi Prisma Transaction nguyên tử
    const result = await prisma.$transaction(async (tx) => {
      // 4.1 Chống trùng lặp gửi liên tục cho CÙNG một nội dung công việc (title)
      const duplicateRecent = await tx.routineEntry.findFirst({
        where: {
          personId: targetPersonId,
          periodId,
          occurrenceStatus,
          workItem: {
            title: String(finalTitle || "").trim(),
          },
          createdAt: {
            gte: new Date(Date.now() - 3000), // trong vòng 3 giây
          },
        },
      });

      if (duplicateRecent) {
        throw new Error(
          "DUPLICATE_SUBMISSION: Thao tác đang được xử lý, vui lòng không nhấn gửi liên tiếp"
        );
      }

      // 4.2 Chống trùng lặp xác nhận KHÔNG PHÁT SINH cho cùng nghiệp vụ trong kỳ
      if (occurrenceStatus === "NOT_OCCURRED") {
        const existingNotOccurred = await tx.routineEntry.findFirst({
          where: {
            personId: targetPersonId,
            periodId,
            occurrenceStatus: "NOT_OCCURRED",
            workItem: {
              title: title.trim(),
            },
          },
        });

        if (existingNotOccurred) {
          throw new Error(
            `NOT_OCCURRED_EXISTS: Nghiệp vụ '${title.trim()}' đã được xác nhận không phát sinh trong kỳ này`
          );
        }
      }

      // 4.3 Tạo PersonalWorkItem tương ứng nếu chưa có
      let createdWorkItemId = workItemId;
      if (!workItemId) {
        const newWorkItem = await tx.personalWorkItem.create({
          data: {
            personId: targetPersonId,
            periodId,
            templateId: templateId || null,
            catalogEntryId: txEntry?.id || null,
            productItemId: mainProductId,
            sourceKind: txEntry ? "TX_CATALOG" : mainProductId ? "QD1277_PRODUCT" : templateId ? "LEGACY_TEMPLATE" : "ADHOC",
            sourceRefId: txEntry?.id || mainProductId || null,
            sourceCodeSnapshot: txEntry?.code || null,
            // F18: nhật ký tác nghiệp KHÔNG tự động là công việc đã được lãnh đạo nghiệm thu
            reviewState: "DRAFT",
            title: title.trim(),
            status:
              occurrenceStatus === "NOT_OCCURRED"
                ? "NOT_OCCURRED"
                : Number(progressPercent) === 100
                ? "COMPLETED"
                : "IN_PROGRESS",
            sortOrder: 1,
          },
        });
        createdWorkItemId = newWorkItem.id;
      }

      // F18: SP đề xuất từ nhật ký tác nghiệp được gắn vào công việc ở trạng thái PROPOSED
      // => lãnh đạo xác nhận TỪNG SP trong luồng V3; SP chưa xác nhận không tham gia điểm chính thức.
      if (createdWorkItemId) {
        for (const pp of proposed) {
          await tx.workItemProduct.upsert({
            where: {
              workItemId_productItemId: {
                workItemId: createdWorkItemId,
                productItemId: pp.productItemId,
              },
            },
            create: {
              workItemId: createdWorkItemId,
              productItemId: pp.productItemId,
              quantity: pp.quantity,
              quantityUnit: pp.unit,
              reviewState: "PROPOSED",
              proposedById: targetPersonId,
              proposedAt: new Date(),
              factorSnapshot: pp.factor,
              factorSource: "QD1277_PRODUCT",
            },
            update: {
              quantity: pp.quantity,
              quantityUnit: pp.unit,
              reviewState: "PROPOSED",
            },
          });
        }
      }

      // 4.4 Tạo RoutineEntry
      const routineEntry = await tx.routineEntry.create({
        data: {
          periodId,
          personId: targetPersonId,
          unitId: targetUnitId,
          templateId: templateId || null,
          workItemId: createdWorkItemId || null,
          catalogEntryId: txEntry?.id || null,
          workDate,
          shift: normalizedShift,
          catalogTags:
            txEntries.length > 0
              ? {
                  create: txEntries.map((entry, index) => ({
                    catalogEntryId: entry.id,
                    sortOrder: index,
                  })),
                }
              : undefined,
          productItemId: mainProductId,
          proposedProducts: proposed.length ? JSON.stringify(proposed) : null,
          sourceKind: txEntry ? "TX_CATALOG" : mainProductId ? "QD1277_PRODUCT" : templateId ? "LEGACY_TEMPLATE" : "ADHOC",
          sourceRefId: txEntry?.id || mainProductId || null,
          sourceCodeSnapshot: txEntry?.code || null,
          reviewState: "DRAFT",
          dataOrigin: dataOrigin || "REAL",
          occurrenceStatus: occurrenceStatus === "NOT_OCCURRED" ? "NOT_OCCURRED" : "OCCURRED",
          notes: finalNotes ? String(finalNotes).trim() : null,
        },
        include: {
          person: true,
          unit: true,
          template: {
            include: { group: true },
          },
          workItem: true,
          catalogTags: {
            include: {
              catalogEntry: { select: { id: true, code: true, title: true, department: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });

      // 4.5 Nếu là OCCURRED và có FormVersion, tạo ResultSubmission và SubmissionValues
      let createdSubmission: any = null;
      if (occurrenceStatus === "OCCURRED" && targetFormVersion) {
        createdSubmission = await tx.resultSubmission.create({
          data: {
            routineEntryId: routineEntry.id,
            formVersionId: targetFormVersion.id,
            submittedBy: targetPersonId,
            status: "SUBMITTED",
          },
        });

        const valuesToInsert: Array<{
          submissionId: string;
          fieldKey: string;
          valueText: string | null;
          valueNumber: number | null;
          valueJson: any;
        }> = [];

        // Lưu company_name
        if (companyName && String(companyName).trim()) {
          valuesToInsert.push({
            submissionId: createdSubmission.id,
            fieldKey: "company_name",
            valueText: String(companyName).trim(),
            valueNumber: null,
            valueJson: null,
          });
        }

        // Lưu container_count
        if (containerCount !== undefined && containerCount !== null && containerCount !== "") {
          const cNum = Number(containerCount);
          valuesToInsert.push({
            submissionId: createdSubmission.id,
            fieldKey: "container_count",
            valueText: String(cNum),
            valueNumber: isNaN(cNum) ? null : cNum,
            valueJson: null,
          });
        }

        // Lưu time_spent
        if (timeSpent) {
          valuesToInsert.push({
            submissionId: createdSubmission.id,
            fieldKey: "time_spent",
            valueText: String(timeSpent),
            valueNumber: null,
            valueJson: null,
          });
        }

        // Lưu progress_percent
        if (progressPercent !== undefined) {
          const pNum = Number(progressPercent);
          valuesToInsert.push({
            submissionId: createdSubmission.id,
            fieldKey: "progress_percent",
            valueText: String(pNum),
            valueNumber: isNaN(pNum) ? null : pNum,
            valueJson: null,
          });
        }

        // Lưu các trường formValues động
        if (formValues && typeof formValues === "object") {
          for (const [key, val] of Object.entries(formValues)) {
            // Tránh duplicate các trường chuẩn nếu đã lưu
            if (["company_name", "container_count", "time_spent", "progress_percent"].includes(key)) {
              continue;
            }

            const isNum =
              typeof val === "number" ||
              (!isNaN(Number(val)) && val !== "" && typeof val !== "boolean");
            const isObj = typeof val === "object" && val !== null;

            valuesToInsert.push({
              submissionId: createdSubmission.id,
              fieldKey: key,
              valueText: isObj ? JSON.stringify(val) : String(val ?? ""),
              valueNumber: isNum ? Number(val) : null,
              valueJson: isObj ? (val as any) : null,
            });
          }
        }

        if (valuesToInsert.length > 0) {
          await tx.submissionValue.createMany({
            data: valuesToInsert,
          });
        }
      }

      return {
        routineEntry,
        submission: createdSubmission,
      };
    });

    // 5. Ghi Audit Trail sau giao dịch thành công
    await recordAuditEvent({
      actorId: user.id,
      action:
        occurrenceStatus === "NOT_OCCURRED"
          ? "ROUTINE_ENTRY_NOT_OCCURRED"
          : "ROUTINE_ENTRY_CREATED",
      resourceType: "RoutineEntry",
      resourceId: result.routineEntry.id,
      newData: {
        title: title.trim(),
        occurrenceStatus,
        companyName: occurrenceStatus === "OCCURRED" ? companyName : null,
        containerCount: occurrenceStatus === "OCCURRED" ? containerCount : null,
        templateId,
        periodId,
        formVersionId: targetFormVersion?.id || null,
        catalogEntryIds: txEntries.map((entry) => entry.id),
        workDate: workDate.toISOString().slice(0, 10),
        shift: normalizedShift,
      },
    });

    return NextResponse.json(
      {
        success: true,
        routineEntry: {
          ...result.routineEntry,
          companyName: occurrenceStatus === "OCCURRED" ? companyName : null,
          containerCount:
            occurrenceStatus === "OCCURRED" && containerCount !== undefined && containerCount !== null
              ? Number(containerCount)
              : null,
          formValues,
        },
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error in POST /api/routine:", err);
    if (err.message?.startsWith("DUPLICATE_SUBMISSION:")) {
      return NextResponse.json(
        { error: "Thao tác đang được xử lý, vui lòng không nhấn gửi liên tiếp" },
        { status: 409 }
      );
    }
    if (err.message?.startsWith("NOT_OCCURRED_EXISTS:")) {
      return NextResponse.json(
        { error: err.message.replace("NOT_OCCURRED_EXISTS: ", "") },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

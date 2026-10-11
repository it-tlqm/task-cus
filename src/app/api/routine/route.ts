import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { getAuthorizedUnitIds } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getIsoWeekFromDate } from "@/lib/period-helper";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const periodId = searchParams.get("periodId");
    const personId = searchParams.get("personId");
    const unitId = searchParams.get("unitId");
    const occurrenceStatus = searchParams.get("occurrenceStatus");
    const id = searchParams.get("id");

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
      },
      include: {
        person: true,
        unit: true,
        template: {
          include: {
            group: true,
          },
        },
        workItem: true,
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
    } = body;

    // 1. Kiểm tra validation cơ bản
    if (!title || typeof title !== "string" || !title.trim()) {
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
        const newPeriod = await prisma.reportingPeriod.create({
          data: {
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
            title: title.trim(),
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

      // 4.4 Tạo RoutineEntry
      const routineEntry = await tx.routineEntry.create({
        data: {
          periodId,
          personId: targetPersonId,
          unitId: targetUnitId,
          templateId: templateId || null,
          workItemId: createdWorkItemId || null,
          occurrenceStatus: occurrenceStatus === "NOT_OCCURRED" ? "NOT_OCCURRED" : "OCCURRED",
          notes: notes ? notes.trim() : null,
        },
        include: {
          person: true,
          unit: true,
          template: {
            include: { group: true },
          },
          workItem: true,
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

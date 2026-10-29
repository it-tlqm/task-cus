import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { advisoryLock } from "@/server/idempotency";
import { buildMonthlyScorePreview } from "@/server/scoring/monthly-preview";
import { syncMonthlyResultsFromTasks, syncMonthlyResultsFromWorkItems } from "@/server/monthly-results-sync";
import { recordAuditEvent } from "@/server/audit";

// YC-12: kết quả sản phẩm thực tế theo tháng. Chưa chấm điểm (YC-14) — chỉ số liệu thô.

async function resolveTargetPerson(user: any, requestedPersonId?: string | null) {
  if (!requestedPersonId || requestedPersonId === user.personId) return { personId: user.personId, ok: true as const };
  if (user.role === "UNIT_LEADER") return { personId: requestedPersonId, ok: true as const };
  const authorizedUnits = await getAuthorizedUnitIds(user);
  if (authorizedUnits === "ALL") return { personId: requestedPersonId, ok: true as const };
  const target = await prisma.person.findUnique({
    where: { id: requestedPersonId },
    include: { assignments: { where: { isPrimary: true }, select: { unitId: true } } },
  });
  const belong = target?.assignments.some((a) => authorizedUnits.includes(a.unitId));
  if (!belong) return { personId: requestedPersonId, ok: false as const };
  return { personId: requestedPersonId, ok: true as const };
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xem dữ liệu đánh giá", 403);
    }
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);
    if (month < 1 || month > 12) return jsonError("Tháng không hợp lệ", 400);

    const target = await resolveTargetPerson(user, searchParams.get("personId"));
    if (!target.ok) return jsonError("Bạn không có quyền xem kết quả của cán bộ này", 403);

    // Đồng bộ nhiệm vụ và đầu việc kế hoạch vào KQ tháng trước khi đọc.
    await syncMonthlyResultsFromTasks(target.personId, year, month);
    await syncMonthlyResultsFromWorkItems(target.personId, year, month);

    const items = await prisma.monthlyWorkResult.findMany({
      where: { personId: target.personId, periodYear: year, periodMonth: month },
      include: {
        productItem: { select: { id: true, code: true, sourceStt: true, taskName: true, outputProduct: true, convertFactor: true, version: { select: { status: true } } } },
        person: { select: { id: true, fullName: true } },
        workItem: {
          select: {
            id: true,
            title: true,
            deptWorkItemId: true,
            templateId: true,
            catalogEntryId: true,
            dueDate: true,
            completedDate: true,
            reviewState: true,
            catalogEntry: { select: { id: true, code: true, title: true, department: true, convertFactor: true, version: { select: { status: true } } } },
            _count: { select: { evidences: true } },
            linkedProducts: {
              select: {
                id: true,
                productItemId: true,
                reviewState: true,
                quantity: true,
                quantityUnit: true,
                factorSnapshot: true,
                productItem: { select: { id: true, code: true, taskName: true, convertFactor: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    // Tổng hợp thô (không chấm điểm): quy đổi dùng hệ số đã niêm tại thời điểm ghi
    let assignedRaw = 0, completedRaw = 0, assignedConv = 0, completedConv = 0;
    let unmapped = 0, missingFields = 0, lateTotal = 0, reworkTotal = 0;
    for (const it of items) {
      const f = it.factorSnapshot ?? it.productItem?.convertFactor ?? null;
      assignedRaw += it.assignedQty || 0;
      completedRaw += it.completedQty || 0;
      if (f !== null) {
        assignedConv += (it.assignedQty || 0) * f;
        completedConv += (it.completedQty || 0) * f;
      }
      if (!it.productItemId) unmapped++;
      if (it.completedQty === null || it.completedQty === undefined || !it.completedDate) missingFields++;
      lateTotal += it.lateCount || 0;
      reworkTotal += it.reworkCount || 0;
    }

    // --- V3.0.2/0.3: phan biet DU THAO (chua du dieu kien) va DIEM CHINH THUC ---
    // Khong sua bo may tinh diem (bang1.ts) — chi gan nhan tren lop ket qua thang.
    const itemsWithState = items.map((it: any) => {
      const sps = it.workItem?.linkedProducts || [];
      const spsPending = sps.filter((p: any) => p.reviewState !== "CONFIRMED");
      const reviewState = it.workItem?.reviewState || "DRAFT";
      let officialState: string;
      if (!it.workItem) officialState = "NO_WORKITEM";
      else if (reviewState === "CONFIRMED" && spsPending.length > 0) officialState = "SP_PENDING";
      else if (reviewState === "CONFIRMED") officialState = "OFFICIAL";
      else if (reviewState === "SUBMITTED") officialState = "WAITING";
      else if (reviewState === "RETURNED") officialState = "RETURNED";
      else officialState = "DRAFT";
      const missingData = it.completedQty === null || it.completedQty === undefined || !it.completedDate;
      // Đủ điều kiện chính thức = công việc đã xác nhận + mọi SP đã xác nhận + CÓ hệ số + đủ số liệu.
      // SP thiếu hệ số / chưa xác minh đủ dữ liệu KHÔNG tham gia điểm chính thức.
      const factor = it.factorSnapshot ?? it.productItem?.convertFactor ?? null;
      const hasFactor = factor !== null && factor !== undefined;
      return {
        ...it,
        officialState,
        officialReady: officialState === "OFFICIAL" && !missingData && hasFactor,
        reviewState,
        spTotal: sps.length,
        spConfirmed: sps.length - spsPending.length,
      };
    });

    // Ban nhap: cong viec trong ky CHUA co ket qua thang (khong tao ban ghi trung)
    const period = await prisma.reportingPeriod.findFirst({
      where: { type: "MONTH", title: { contains: `Tháng ${month}/${year}` } },
    });
    const draftItems = period
      ? await prisma.personalWorkItem.findMany({
          where: {
            personId: target.personId,
            periodId: period.id,
            // F11/F12: chỉ công việc ĐÃ được lãnh đạo xác nhận mới sẵn sàng ghi nhận
            // kết quả tháng. Công việc còn đang thực hiện / đang chờ duyệt chưa đủ điều kiện.
            reviewState: "CONFIRMED",
            monthlyResults: { none: { periodYear: year, periodMonth: month } },
          },
          include: {
            product: { select: { id: true, code: true, taskName: true, convertFactor: true } },
            catalogEntry: { select: { id: true, code: true, title: true, convertFactor: true } },
            linkedProducts: {
              select: {
                id: true,
                reviewState: true,
                quantity: true,
                quantityUnit: true,
                productItem: { select: { code: true, taskName: true, convertFactor: true } },
              },
            },
            _count: { select: { evidences: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const drafts = draftItems.map((d: any) => {
      const sps = d.linkedProducts || [];
      const spsPending = sps.filter((p: any) => p.reviewState !== "CONFIRMED");
      const reviewState = d.reviewState || "DRAFT";
      let officialState: string;
      if (reviewState === "CONFIRMED" && spsPending.length > 0) officialState = "SP_PENDING";
      else if (reviewState === "CONFIRMED") officialState = "OFFICIAL";
      else if (reviewState === "SUBMITTED") officialState = "WAITING";
      else if (reviewState === "RETURNED") officialState = "RETURNED";
      else officialState = "DRAFT";
      return {
        id: d.id,
        title: d.title,
        reviewState,
        officialState,
        dueDate: d.dueDate,
        completedDate: d.completedDate,
        resultText: d.resultText,
        evidenceCount: d._count?.evidences ?? 0,
        spTotal: sps.length,
        spConfirmed: sps.length - spsPending.length,
        product: d.product,
        catalogEntry: d.catalogEntry,
      };
    });

    return NextResponse.json({
      success: true,
      data: itemsWithState,
      drafts,
      summary: {
        year, month, totalItems: items.length,
        officialCount: itemsWithState.filter((i: any) => i.officialReady).length,
        draftCount: drafts.length,
        assignedRaw, completedRaw,
        assignedConverted: Math.round(assignedConv * 100) / 100,
        completedConverted: Math.round(completedConv * 100) / 100,
        unmappedCount: unmapped,
        missingFieldsCount: missingFields,
        lateTotal, reworkTotal,
      },
      // YC-33 — tính điểm BẢNG 1 bằng bộ máy tính thuần (decimal-safe, có trạng thái).
      // Hệ số lấy đúng nguồn: sản phẩm QĐ1277 → productItem; đầu việc TX → catalogEntry;
      // đã chốt → factorSnapshot. Thiếu căn cứ → KHÔNG ra điểm (INSUFFICIENT_DATA).
      scorePreview: (await buildMonthlyScorePreview(items as any, target.personId, year, month)),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải kết quả tháng: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không được ghi kết quả nghiệp vụ", 403);
    }
    const body = await req.json();
    const {
      personId, periodYear, periodMonth, productItemId, workItemId,
      taskId, title, outputText, assignedQty, completedQty,
      dueDate, completedDate, evidenceRef, lateCount, reworkCount, notes,
    } = body;

    const now = new Date();
    const year = Number(periodYear) || now.getFullYear();
    const month = Number(periodMonth) || now.getMonth() + 1;
    if (month < 1 || month > 12) return jsonError("Tháng không hợp lệ", 400);

    const target = await resolveTargetPerson(user, personId);
    if (!target.ok) return jsonError("Bạn không có quyền ghi kết quả cho cán bộ này", 403);
    if (user.role === "STAFF" && target.personId !== user.personId) {
      return jsonError("Cán bộ chỉ được ghi kết quả cho chính mình", 403);
    }

    // YC-23/YC-32: liên kết đầu việc thực tế trong kế hoạch cá nhân (chống ghi nhận trùng theo đầu việc)
    let linkedWorkItem: {
      id: string;
      title: string;
      productItemId: string | null;
      taskId: string | null;
      dueDate: Date | null;
      completedDate: Date | null;
      reviewState: string | null; // V3-F01
    } | null = null;
    if (workItemId) {
      const wi = await prisma.personalWorkItem.findUnique({
        where: { id: workItemId },
        select: {
          id: true,
          personId: true,
          title: true,
          productItemId: true,
          taskId: true,
          dueDate: true,
          completedDate: true,
          reviewState: true, // V3-F01: biết công việc đã được lãnh đạo xác nhận chưa
        },
      });
      if (!wi) return jsonError("Đầu việc kế hoạch không tồn tại — hãy chọn lại", 400);
      if (wi.personId !== target.personId) {
        return jsonError("Chỉ liên kết được đầu việc thuộc kế hoạch của chính cán bộ được ghi kết quả", 400);
      }
      linkedWorkItem = {
        id: wi.id,
        title: wi.title,
        productItemId: wi.productItemId,
        taskId: wi.taskId,
        dueDate: wi.dueDate,
        completedDate: wi.completedDate,
        reviewState: wi.reviewState,
      };
    }

    // YC-32: kế thừa tên/hạn/ngày hoàn thành từ đầu việc khi để trống
    const resolvedTitle = title?.trim() || linkedWorkItem?.title?.trim() || "";
    if (!resolvedTitle) return jsonError("Tên nhiệm vụ/công việc là bắt buộc", 400);

    // Kế thừa sản phẩm đã gắn ở kế hoạch nếu khi ghi nhận không chọn lại sản phẩm
    const effectiveProductItemId = productItemId || linkedWorkItem?.productItemId || null;

    // YC-12: có mã SP → niêm hệ số tại thời điểm ghi; không có → chờ đối chiếu, không tự gán
    let factorSnapshot: number | null = null;
    if (effectiveProductItemId) {
      const item = await prisma.productItem.findUnique({ where: { id: effectiveProductItemId } });
      if (!item) return jsonError("Sản phẩm không tồn tại trong danh mục", 400);
      factorSnapshot = item.convertFactor ?? null;
    }

    // YC-04 mở rộng: chống ghi trùng (cùng người + tiêu đề + tháng trong 120s)
    const lockKey = `monthly:${target.personId}:${year}:${month}:${resolvedTitle.toLowerCase()}`;
    let saved;
    try {
      saved = await prisma.$transaction(async (tx) => {
        await advisoryLock(tx, lockKey);
        // YC-32: mỗi đầu việc chỉ có MỘT kết quả tháng (ràng buộc unique toàn cục theo person + workItem).
        // Không phụ thuộc sản phẩm — đầu việc xuất hiện ở nhiều nơi vẫn không sinh bản ghi trùng.
        if (linkedWorkItem) {
          const dupWork = await tx.monthlyWorkResult.findFirst({
            where: { personId: target.personId, workItemId: linkedWorkItem.id },
            include: { productItem: true },
          });
          if (dupWork) return { row: dupWork, deduplicated: true as const };
        }
        const recent = await tx.monthlyWorkResult.findFirst({
          where: {
            personId: target.personId, periodYear: year, periodMonth: month,
            title: resolvedTitle,
            createdAt: { gte: new Date(Date.now() - 120_000) },
          },
          include: { productItem: true },
        });
        if (recent) return { row: recent, deduplicated: true as const };
        const created = await tx.monthlyWorkResult.create({
          data: {
            personId: target.personId,
            periodYear: year,
            periodMonth: month,
            productItemId: effectiveProductItemId,
            workItemId: linkedWorkItem?.id || null,
            // V3-F01: bản ghi gắn công việc CHƯA được lãnh đạo xác nhận ⇒ đánh dấu
            // "chờ đối chiếu" (không tính vào điểm chính thức; bộ máy tính điểm không đổi).
            needsReview:
              !effectiveProductItemId ||
              (linkedWorkItem ? linkedWorkItem.reviewState !== "CONFIRMED" : false),
            taskId: taskId || linkedWorkItem?.taskId || null,
            title: resolvedTitle,
            outputText: outputText?.trim() || null,
            assignedQty: assignedQty === "" || assignedQty === undefined ? null : Number(assignedQty),
            completedQty: completedQty === "" || completedQty === undefined ? null : Number(completedQty),
            dueDate:
              dueDate === undefined
                ? linkedWorkItem?.dueDate ?? null
                : dueDate
                  ? new Date(dueDate)
                  : null,
            completedDate:
              completedDate === undefined
                ? linkedWorkItem?.completedDate ?? null
                : completedDate
                  ? new Date(completedDate)
                  : null,
            evidenceRef: evidenceRef?.trim() || null,
            factorSnapshot,
            lateCount: Number(lateCount) || 0,
            reworkCount: Number(reworkCount) || 0,
            notes: notes?.trim() || null,
            createdById: user.personId,
          },
          include: { productItem: true },
        });
        return { row: created, deduplicated: false as const };
      });
    } catch (err: any) {
      // Hai request đồng thời cùng đầu việc: unique index chặn ở tầng DB → trả bản ghi hiện có
      if (err?.code === "P2002" && linkedWorkItem) {
        const existing = await prisma.monthlyWorkResult.findFirst({
          where: { personId: target.personId, workItemId: linkedWorkItem.id },
          include: { productItem: true },
        });
        if (existing) {
          return NextResponse.json({
            success: true,
            data: existing,
            deduplicated: true,
            message: "Đầu việc này đã có kết quả tháng — đang mở bản ghi hiện có",
          });
        }
      }
      throw err;
    }

    if (!saved.deduplicated) {
      await recordAuditEvent({
        actorId: user.id,
        action: "MONTHLY_RESULT_CREATE",
        resourceType: "MonthlyWorkResult",
        resourceId: saved.row.id,
        newData: {
          personId: target.personId,
          year,
          month,
          title: saved.row.title,
          productItemId: effectiveProductItemId,
          workItemId: linkedWorkItem?.id || null,
        },
      });
    }

    return NextResponse.json(
      {
        success: true,
        data: saved.row,
        deduplicated: saved.deduplicated || undefined,
        message: saved.deduplicated
          ? "Đầu việc này đã có kết quả tháng — đang mở bản ghi hiện có (không ghi trùng)"
          : undefined,
      },
      { status: saved.deduplicated ? 200 : 201 }
    );
  } catch (error: any) {
    return jsonError("Lỗi khi ghi kết quả tháng: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const body = await req.json();
    const { id, productItemId, title, outputText, assignedQty, completedQty, dueDate, completedDate, evidenceRef, lateCount, reworkCount, notes, taskId, workItemId } = body;
    if (!id) return jsonError("Thiếu ID bản ghi", 400);

    const current = await prisma.monthlyWorkResult.findUnique({ where: { id } });
    if (!current) return jsonError("Bản ghi không tồn tại", 404);
    const target = await resolveTargetPerson(user, current.personId);
    if (!target.ok) return jsonError("Bạn không có quyền sửa bản ghi này", 403);
    if (user.role === "STAFF" && current.personId !== user.personId) {
      return jsonError("Cán bộ chỉ được sửa kết quả của chính mình", 403);
    }

    const updateData: any = {};
    // YC-32: gắn/đổi đầu việc thực tế — chặn trùng theo đầu việc (duy nhất toàn cục, không phụ thuộc sản phẩm)
    if (workItemId !== undefined) {
      if (workItemId) {
        const wi = await prisma.personalWorkItem.findUnique({
          where: { id: workItemId },
          select: {
            id: true,
            personId: true,
            title: true,
            productItemId: true,
            dueDate: true,
            completedDate: true,
          },
        });
        if (!wi) return jsonError("Đầu việc kế hoạch không tồn tại — hãy chọn lại", 400);
        if (wi.personId !== current.personId) {
          return jsonError("Chỉ liên kết được đầu việc thuộc kế hoạch của chính cán bộ này", 400);
        }
        const dupWork = await prisma.monthlyWorkResult.findFirst({
          where: {
            personId: current.personId,
            workItemId: wi.id,
            NOT: { id },
          },
        });
        if (dupWork) {
          return jsonError(
            "Đầu việc này đã được ghi nhận kết quả tháng — hãy sửa bản ghi hiện có thay vì ghi thêm",
            409
          );
        }
        updateData.workItemId = wi.id;
        // Kế thừa hạn/ngày hoàn thành khi bản ghi chưa có
        if (dueDate === undefined && !current.dueDate && wi.dueDate) updateData.dueDate = wi.dueDate;
        if (completedDate === undefined && !current.completedDate && wi.completedDate) {
          updateData.completedDate = wi.completedDate;
        }
      } else {
        updateData.workItemId = null;
      }
    }
    if (title !== undefined && title.trim()) updateData.title = title.trim();
    if (outputText !== undefined) updateData.outputText = outputText?.trim() || null;
    if (assignedQty !== undefined) updateData.assignedQty = assignedQty === "" || assignedQty === null ? null : Number(assignedQty);
    if (completedQty !== undefined) updateData.completedQty = completedQty === "" || completedQty === null ? null : Number(completedQty);
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (completedDate !== undefined) updateData.completedDate = completedDate ? new Date(completedDate) : null;
    if (evidenceRef !== undefined) updateData.evidenceRef = evidenceRef?.trim() || null;
    if (lateCount !== undefined) updateData.lateCount = Number(lateCount) || 0;
    if (reworkCount !== undefined) updateData.reworkCount = Number(reworkCount) || 0;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;
    if (taskId !== undefined) updateData.taskId = taskId || null;
    if (productItemId !== undefined) {
      if (productItemId) {
        const item = await prisma.productItem.findUnique({ where: { id: productItemId } });
        if (!item) return jsonError("Sản phẩm không tồn tại trong danh mục", 400);
        updateData.productItemId = productItemId;
        updateData.factorSnapshot = item.convertFactor ?? null;
        updateData.needsReview = false;
      } else {
        updateData.productItemId = null;
        updateData.factorSnapshot = null;
        updateData.needsReview = true;
      }
    }

    let updated;
    try {
      updated = await prisma.monthlyWorkResult.update({
        where: { id }, data: updateData, include: { productItem: true },
      });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return jsonError(
          "Đầu việc này đã được ghi nhận kết quả tháng — hãy sửa bản ghi hiện có thay vì ghi thêm",
          409
        );
      }
      throw err;
    }
    await recordAuditEvent({
      actorId: user.id,
      action: "MONTHLY_RESULT_UPDATE",
      resourceType: "MonthlyWorkResult",
      resourceId: id,
      oldData: {
        title: current.title,
        completedQty: current.completedQty,
        workItemId: current.workItemId,
        dueDate: current.dueDate,
        completedDate: current.completedDate,
      },
      newData: updateData,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật kết quả tháng: " + error.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Thiếu ID bản ghi", 400);
    const current = await prisma.monthlyWorkResult.findUnique({ where: { id } });
    if (!current) return jsonError("Bản ghi không tồn tại", 404);
    const isOwner = current.personId === user.personId;
    const isLeader = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!isOwner && !isLeader) return jsonError("Bạn không có quyền xóa bản ghi này", 403);
    await prisma.monthlyWorkResult.delete({ where: { id } });
    await recordAuditEvent({
      actorId: user.id, action: "MONTHLY_RESULT_DELETE",
      resourceType: "MonthlyWorkResult", resourceId: id,
      oldData: { title: current.title, personId: current.personId },
    });
    return NextResponse.json({ success: true, message: "Đã xóa bản ghi kết quả tháng" });
  } catch (error: any) {
    return jsonError("Lỗi khi xóa bản ghi: " + error.message, 500);
  }
}

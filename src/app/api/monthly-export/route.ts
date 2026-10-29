import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { buildMonthlyWorkbook } from "@/server/monthly-export";
import { buildMonthlyPlan02C } from "@/server/monthly-plan-02c";
import { pickPrimaryAssignment } from "@/server/person-assignment";
import { syncMonthlyResultsFromTasks } from "@/server/monthly-results-sync";
import { recordAuditEvent } from "@/server/audit";

/**
 * GĐ3 — Xuất Bảng 1 + Biểu 01A theo đúng mẫu công chức (giữ công thức gốc).
 * Không chấm điểm/xếp loại tự động (YC-14): chỉ điền số liệu thực tế, ô trống để trống.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xuất dữ liệu đánh giá", 403);
    }
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const year = Number(body.year) || now.getFullYear();
    const month = Number(body.month) || now.getMonth() + 1;
    if (month < 1 || month > 12) return jsonError("Tháng không hợp lệ", 400);

    // Phạm vi: công chức chỉ xuất của mình; lãnh đạo theo phạm vi được cấp
    let targetPersonId: string = body.personId || user.personId;
    if (targetPersonId !== user.personId && user.role !== "UNIT_LEADER") {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      if (authorizedUnits !== "ALL") {
        const target = await prisma.person.findUnique({
          where: { id: targetPersonId },
          include: { assignments: { where: { isPrimary: true }, select: { unitId: true } } },
        });
        const belong = target?.assignments.some((a) => authorizedUnits.includes(a.unitId));
        if (!belong) return jsonError("Bạn không có quyền xuất báo cáo của cán bộ này", 403);
      }
    }

    const person = await prisma.person.findUnique({
      where: { id: targetPersonId },
      include: {
        assignments: {
          where: { isPrimary: true },
          include: { unit: { select: { name: true } }, position: { select: { title: true } } },
        },
        account: { select: { username: true } },
      },
    });
    if (!person) return jsonError("Cán bộ không tồn tại", 404);

    await syncMonthlyResultsFromTasks(targetPersonId, year, month);

    const rows = await prisma.monthlyWorkResult.findMany({
      where: { personId: targetPersonId, periodYear: year, periodMonth: month },
      include: { productItem: { select: { convertFactor: true } } },
      orderBy: { createdAt: "asc" },
    });

    const template = body.template === "02c" ? "02c" : "bang1";
    const primaryAssignment = pickPrimaryAssignment(person.assignments);
    const personInfo = {
      fullName: person.fullName,
      positionTitle: primaryAssignment?.position?.title || null,
      unitName: primaryAssignment?.unit?.name || null,
      // Chưa có danh mục "vị trí việc làm" riêng ⇒ 02C không lặp lại chức vụ.
      jobPositionTitle: null,
    };
    const buf =
      template === "02c"
        ? await buildMonthlyPlan02C(
            rows.map((r) => ({
              title: r.title,
              outputText: r.outputText,
              evidenceRef: r.evidenceRef,
              dueDate: r.dueDate,
              completedDate: r.completedDate,
              notes: r.notes,
            })),
            personInfo,
            year,
            month
          )
        : await buildMonthlyWorkbook(
      rows.map((r) => ({
        title: r.title,
        outputText: r.outputText,
        evidenceRef: r.evidenceRef,
        factor: r.factorSnapshot ?? r.productItem?.convertFactor ?? null,
        assignedQty: r.assignedQty,
        completedQty: r.completedQty,
        dueDate: r.dueDate,
        completedDate: r.completedDate,
        lateCount: r.lateCount || 0,
        reworkCount: r.reworkCount || 0,
      })),
      personInfo,
      year,
      month
    );

    await recordAuditEvent({
      actorId: user.id,
      action: template === "02c" ? "MONTHLY_EXPORT_PLAN02C" : "MONTHLY_EXPORT_BANG1_01A",
      resourceType: "MonthlyWorkResult",
      newData: { personId: targetPersonId, year, month, rows: rows.length, by: user.username },
    });

    const filename =
      template === "02c"
        ? `KeHoachThang02C-${person.account?.username || "cc"}-T${month}-${year}.xlsx`
        : `Bang1-01A-${person.account?.username || "cc"}-T${month}-${year}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi xuất báo cáo tháng: " + error.message, 500);
  }
}

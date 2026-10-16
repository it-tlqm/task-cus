import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { buildMonthlyWorkbook } from "@/server/monthly-export";
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

    const rows = await prisma.monthlyWorkResult.findMany({
      where: { personId: targetPersonId, periodYear: year, periodMonth: month },
      include: { productItem: { select: { convertFactor: true } } },
      orderBy: { createdAt: "asc" },
    });

    const buf = await buildMonthlyWorkbook(
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
      {
        fullName: person.fullName,
        positionTitle: person.assignments[0]?.position?.title || null,
        unitName: person.assignments[0]?.unit?.name || null,
      },
      year,
      month
    );

    await recordAuditEvent({
      actorId: user.id,
      action: "MONTHLY_EXPORT_BANG1_01A",
      resourceType: "MonthlyWorkResult",
      newData: { personId: targetPersonId, year, month, rows: rows.length, by: user.username },
    });

    const filename = `Bang1-01A-${person.account?.username || "cc"}-T${month}-${year}.xlsx`;
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

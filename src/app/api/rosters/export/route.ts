import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { parseSlots } from "@/server/duty-catalog";
import { scopeUnitsOf } from "@/server/duty-scope";
import { buildDutyRosterWorkbook, DutyExportAssignment } from "@/server/duty-export";

function parseDay(raw: string | null, endOfDay = false): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  d.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return d;
}

/**
 * GET /api/rosters/export?from=YYYY-MM-DD&to=YYYY-MM-DD&unitId=...[&skipEmpty=1][&cover=0]
 * Xuất "Sổ phân công nhiệm vụ" (.xlsx) CỦA ĐÚNG MỘT BỘ PHẬN — mỗi ngày 1 khối, 4 khối/trang in.
 * - Bắt buộc có unitId khi tài khoản có nhiều bộ phận trong phạm vi; một bộ phận thì mặc định chính bộ phận đó.
 * - Tiêu đề biểu/trang bìa/tên tệp thể hiện ĐÚNG bộ phận được xuất — không hardcode "Bộ phận Nghiệp vụ".
 * - Không trộn dữ liệu giữa các bộ phận (mọi truy vấn lọc theo unitId + phạm vi quyền).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canExport =
      user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER" || checkPermission(user, "reports.export");
    if (!canExport) return jsonError("Bạn không có quyền xuất bảng phân công", 403);

    const { searchParams } = new URL(req.url);
    const from = parseDay(searchParams.get("from"));
    const to = parseDay(searchParams.get("to"), true);
    if (!from || !to) return jsonError("Thiếu khoảng ngày (from/to)", 400);
    if (to.getTime() < from.getTime()) return jsonError("Khoảng ngày không hợp lệ", 400);
    if (to.getTime() - from.getTime() > 31 * 86400000) {
      return jsonError("Mỗi lần xuất tối đa 31 ngày — hãy tách thành nhiều kỳ", 400);
    }
    const skipEmpty = searchParams.get("skipEmpty") === "1";
    const includeCover = searchParams.get("cover") !== "0";

    // Xác định bộ phận xuất: ưu tiên tham số, đối chiếu phạm vi thực tế của tài khoản.
    const requested = searchParams.get("unitId") || "";
    const { units } = await scopeUnitsOf(user);
    let unitId = "";
    if (requested) {
      if (!units.some((u) => u.id === requested)) {
        return jsonError("Bạn không có quyền xuất bảng phân công của bộ phận này", 403);
      }
      unitId = requested;
    } else if (units.length === 1) {
      unitId = units[0].id;
    } else {
      return jsonError("Vui lòng chọn bộ phận cần xuất", 400);
    }
    const unit = units.find((u) => u.id === unitId)!;

    const [rows, positions, dayInfos] = await Promise.all([
      prisma.dutyRoster.findMany({
        where: { unitId, date: { gte: from, lte: to } },
        include: { person: { select: { fullName: true } } },
        orderBy: [{ date: "asc" }, { positionOrder: "asc" }, { slotOrder: "asc" }],
        take: 3000,
      }),
      prisma.dutyPosition.findMany({ where: { unitId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
      prisma.dutyDayInfo.findMany({ where: { unitId, date: { gte: from, lte: to } } }),
    ]);

    const assignments: DutyExportAssignment[] = rows.map((r) => ({
      date: r.date,
      personName: r.person.fullName,
      positionId: r.positionId,
      positionTitle: r.positionTitle,
      positionDetail: r.positionDetail,
      slotLabel: r.slotLabel,
      slotOrder: r.slotOrder,
      post: r.post,
      shift: r.shift,
    }));

    const buf = await buildDutyRosterWorkbook({
      from,
      to,
      unitName: unit.name,
      unitCode: unit.code,
      assignments,
      catalog: positions.map((p) => ({
        id: p.id,
        code: p.code,
        title: p.title,
        detail: p.detail,
        slots: parseSlots(p.slots),
        sortOrder: p.sortOrder,
        status: p.status,
      })),
      dayInfos: dayInfos.map((d) => ({
        date: d.date,
        totalStaff: d.totalStaff,
        presentStaff: d.presentStaff,
        absentCount: d.absentCount,
        absentReason: d.absentReason,
      })),
      skipEmpty,
      includeCover,
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "ROSTER_EXPORT",
      resourceType: "DutyRoster",
      newData: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        unitId,
        unitCode: unit.code,
        rows: rows.length,
        skipEmpty,
        by: user.username,
      },
    });

    const filename = `so-phan-cong_${unit.code}_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.length),
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi xuất bảng phân công: " + error.message, 500);
  }
}

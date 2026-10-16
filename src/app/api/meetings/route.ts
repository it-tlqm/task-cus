import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";

function canManage(user: any): boolean {
  return user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem biên bản", 403);
    const { searchParams } = new URL(req.url);
    const unitId = searchParams.get("unitId") || "";
    const authorizedUnits = await getAuthorizedUnitIds(user);
    const where: any = {};
    if (unitId) {
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(unitId)) {
        return jsonError("Bạn không có quyền xem biên bản đơn vị này", 403);
      }
      where.unitId = unitId;
    } else if (authorizedUnits !== "ALL") {
      where.unitId = { in: authorizedUnits };
    }
    const rows = await prisma.meeting.findMany({
      where,
      include: {
        _count: { select: { conclusions: true } },
        conclusions: { where: { taskId: { not: null } }, select: { id: true } },
      },
      orderBy: { meetingAt: "desc" },
      take: 100,
    });
    return NextResponse.json({
      success: true,
      data: rows.map((m) => ({
        ...m,
        convertedCount: m.conclusions.length,
      })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải biên bản: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!canManage(user)) return jsonError("Chỉ lãnh đạo mới được lập biên bản giao ban", 403);
    const body = await req.json();
    const { title, meetingAt, chair, unitId, notes } = body;
    if (!title?.trim() || !meetingAt) return jsonError("Tiêu đề và ngày họp là bắt buộc", 400);
    const targetUnitId = unitId || user.unitId || null;
    if (targetUnitId) {
      const authorizedUnits = await getAuthorizedUnitIds(user);
      if (authorizedUnits !== "ALL" && !authorizedUnits.includes(targetUnitId)) {
        return jsonError("Bạn không có quyền lập biên bản cho đơn vị này", 403);
      }
    }
    const created = await prisma.meeting.create({
      data: {
        title: title.trim(),
        meetingAt: new Date(meetingAt),
        chair: chair?.trim() || null,
        unitId: targetUnitId,
        notes: notes?.trim() || null,
        createdById: user.personId,
      },
    });
    await recordAuditEvent({
      actorId: user.id, action: "MEETING_CREATE", resourceType: "Meeting", resourceId: created.id,
      newData: { title: created.title },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi lập biên bản: " + error.message, 500);
  }
}

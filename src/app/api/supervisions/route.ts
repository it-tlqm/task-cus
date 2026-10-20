import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { getAuthorizedUnitIds, jsonError, checkPermission } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { wouldCreateCycle } from "@/server/scoring/leader-average";

export const runtime = "nodejs";

/**
 * YC-35 — Quan hệ phụ trách theo kỳ.
 *
 * GET    /api/supervisions?personId=&at=YYYY-MM-DD  → danh sách quan hệ
 * POST   /api/supervisions                            → thêm quan hệ (đã xác nhận)
 * DELETE /api/supervisions?id=...                     → gỡ quan hệ (REVOKED)
 *
 * Quyền: org.manage (quản trị) hoặc lãnh đạo đơn vị.
 * KHÔNG tự suy diễn quan hệ từ role kỹ thuật.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xem quan hệ phụ trách", 403);
    }

    const { searchParams } = new URL(req.url);
    const personId = searchParams.get("personId") || user.personId || "";
    const at = searchParams.get("at");
    const atDate = at ? new Date(at) : new Date();
    if (!personId) return jsonError("Thiếu mã cán bộ", 400);

    const canViewAll =
      user.role === "UNIT_LEADER" || checkPermission(user, "org.manage");
    if (personId !== user.personId && !canViewAll) {
      const units = await getAuthorizedUnitIds(user);
      const target = await prisma.person.findUnique({
        where: { id: personId },
        select: { assignments: { select: { unitId: true } } },
      });
      const inScope =
        units === "ALL" ||
        (target?.assignments || []).some((a) => units.includes(a.unitId));
      if (!inScope) {
        return jsonError("Bạn không có quyền xem quan hệ phụ trách của cán bộ này", 403);
      }
    }

    const [asManager, asSubordinate] = await Promise.all([
      prisma.personSupervision.findMany({
        where: { managerPersonId: personId },
        orderBy: [{ effectiveFrom: "desc" }],
      }),
      prisma.personSupervision.findMany({
        where: { subordinatePersonId: personId },
        orderBy: [{ effectiveFrom: "desc" }],
      }),
    ]);

    const isActive = (s: { effectiveFrom: Date; effectiveTo: Date | null; status: string }) =>
      s.status === "CONFIRMED" &&
      s.effectiveFrom <= atDate &&
      (!s.effectiveTo || s.effectiveTo >= atDate);

    return NextResponse.json({
      success: true,
      data: {
        asManager: asManager.map((s) => ({
          id: s.id,
          subordinate: { id: s.subordinatePersonId },
          scopeType: s.scopeType,
          scopeNote: s.scopeNote,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
          status: s.status,
          activeNow: isActive(s),
        })),
        asSubordinate: asSubordinate.map((s) => ({
          id: s.id,
          manager: { id: s.managerPersonId },
          scopeType: s.scopeType,
          scopeNote: s.scopeNote,
          effectiveFrom: s.effectiveFrom,
          effectiveTo: s.effectiveTo,
          status: s.status,
          activeNow: isActive(s),
        })),
      },
    });
  } catch (error: any) {
    console.error("[Supervisions GET Error]", error);
    return jsonError("Lỗi khi tải quan hệ phụ trách: " + error.message, 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền thiết lập quan hệ phụ trách", 403);
    }
    const canManage =
      checkPermission(user, "org.manage") ||
      user.role === "UNIT_LEADER" ||
      user.role === "DEPARTMENT_LEADER";
    if (!canManage) {
      return jsonError("Bạn không có quyền thiết lập quan hệ phụ trách", 403);
    }

    const body = await req.json().catch(() => ({}));
    const managerPersonId = String(body.managerPersonId || "").trim();
    const subordinatePersonId = String(body.subordinatePersonId || "").trim();
    if (!managerPersonId || !subordinatePersonId) {
      return jsonError("Thiếu người phụ trách hoặc cán bộ được phụ trách", 400);
    }
    if (managerPersonId === subordinatePersonId) {
      return jsonError("Một người không thể phụ trách chính mình", 400);
    }

    const [manager, subordinate] = await Promise.all([
      prisma.person.findUnique({
        where: { id: managerPersonId },
        select: { id: true, fullName: true },
      }),
      prisma.person.findUnique({
        where: { id: subordinatePersonId },
        select: { id: true, fullName: true },
      }),
    ]);
    if (!manager || !subordinate) {
      return jsonError("Không tìm thấy người phụ trách hoặc cán bộ được phụ trách", 404);
    }

    if (await wouldCreateCycle(managerPersonId, subordinatePersonId)) {
      return jsonError(
        "Quan hệ này tạo vòng quản lý — không được thiết lập.",
        400
      );
    }

    const effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : new Date();
    const effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      return jsonError("Ngày kết thúc phải sau ngày bắt đầu", 400);
    }

    const created = await prisma.personSupervision.create({
      data: {
        managerPersonId,
        subordinatePersonId,
        scopeType: body.scopeType || "UNIT",
        scopeNote: body.scopeNote || null,
        effectiveFrom,
        effectiveTo,
        status: "CONFIRMED",
        confirmedById: user.personId ?? null,
        confirmedAt: new Date(),
        note: body.note || null,
      },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "SUPERVISION_CREATE",
      resourceType: "PersonSupervision",
      resourceId: created.id,
      newData: {
        managerPersonId,
        managerName: manager.fullName,
        subordinatePersonId,
        subordinateName: subordinate.fullName,
        effectiveFrom,
        effectiveTo,
        scopeType: created.scopeType,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Đã xác nhận: ${manager.fullName} phụ trách ${subordinate.fullName}`,
      data: created,
    });
  } catch (error: any) {
    console.error("[Supervisions POST Error]", error);
    return jsonError("Lỗi khi thiết lập quan hệ phụ trách: " + error.message, 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canManage =
      checkPermission(user, "org.manage") ||
      user.role === "UNIT_LEADER" ||
      user.role === "DEPARTMENT_LEADER";
    if (!canManage) {
      return jsonError("Bạn không có quyền gỡ quan hệ phụ trách", 403);
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return jsonError("Thiếu mã quan hệ", 400);

    const rec = await prisma.personSupervision.findUnique({ where: { id } });
    if (!rec) return jsonError("Không tìm thấy quan hệ phụ trách", 404);

    // Gỡ bằng cách kết thúc hiệu lực (giữ lịch sử, không xoá dữ liệu).
    const updated = await prisma.personSupervision.update({
      where: { id },
      data: { status: "REVOKED", effectiveTo: new Date() },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "SUPERVISION_REVOKE",
      resourceType: "PersonSupervision",
      resourceId: id,
      oldData: { status: rec.status, effectiveTo: rec.effectiveTo },
      newData: { status: "REVOKED", effectiveTo: updated.effectiveTo },
    });

    return NextResponse.json({ success: true, message: "Đã gỡ quan hệ phụ trách" });
  } catch (error: any) {
    console.error("[Supervisions DELETE Error]", error);
    return jsonError("Lỗi khi gỡ quan hệ phụ trách: " + error.message, 500);
  }
}

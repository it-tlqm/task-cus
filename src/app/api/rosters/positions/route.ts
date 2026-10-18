import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { DUTY_POSITION_SEEDS, parseSlots, validateSlotsInput } from "@/server/duty-catalog";

/** GET /api/rosters/positions — danh mục vị trí/nhiệm vụ phân công (mọi vai trò nghiệp vụ được xem). */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem danh mục nghiệp vụ", 403);
    const rows = await prisma.dutyPosition.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
    return NextResponse.json({
      success: true,
      data: rows.map((p) => ({
        id: p.id,
        code: p.code,
        title: p.title,
        detail: p.detail,
        slots: parseSlots(p.slots),
        sortOrder: p.sortOrder,
        status: p.status,
      })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục vị trí: " + error.message, 500);
  }
}

/**
 * POST /api/rosters/positions — CHỈ lãnh đạo đơn vị (UNIT_LEADER).
 * - { action: "seed-defaults" }: bổ sung các vị trí mẫu còn thiếu (không ghi đè bản ghi đã có).
 * - { title, detail?, slots?, sortOrder? }: tạo vị trí mới.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role !== "UNIT_LEADER") return jsonError("Chỉ lãnh đạo đơn vị mới được sửa danh mục vị trí", 403);

    const body = await req.json();

    if (body?.action === "seed-defaults") {
      let created = 0;
      for (const seed of DUTY_POSITION_SEEDS) {
        const existing = await prisma.dutyPosition.findUnique({ where: { code: seed.code } });
        if (existing) continue;
        await prisma.dutyPosition.create({
          data: {
            id: seed.id,
            code: seed.code,
            title: seed.title,
            detail: seed.detail,
            slots: seed.slots as any,
            sortOrder: seed.sortOrder,
            status: "ACTIVE",
            createdById: user.personId,
          },
        });
        created++;
      }
      await recordAuditEvent({
        actorId: user.id,
        action: "DUTY_POSITION_SEED",
        resourceType: "DutyPosition",
        newData: { created },
      });
      return NextResponse.json({ success: true, message: `Đã khôi phục ${created} vị trí mẫu còn thiếu.`, created });
    }

    const title = String(body?.title || "").trim();
    if (!title) return jsonError("Tên vị trí/nhiệm vụ là bắt buộc", 400);
    const detail = body?.detail ? String(body.detail).trim() : null;
    const slotsCheck = validateSlotsInput(
      Array.isArray(body?.slots) && body.slots.length > 0 ? body.slots : [{ k: "s1", l: null }]
    );
    if (!slotsCheck.ok) return jsonError(slotsCheck.error, 400);

    // Mã tự sinh: YC24-XX — chọn số kế tiếp chưa dùng
    let next = ((await prisma.dutyPosition.count()) + 1) as number;
    let code = "";
    for (let i = 0; i < 100; i++) {
      const candidate = `YC24-${String(next + i).padStart(2, "0")}`;
      const dup = await prisma.dutyPosition.findUnique({ where: { code: candidate } });
      if (!dup) {
        code = candidate;
        break;
      }
    }
    if (!code) return jsonError("Không sinh được mã vị trí mới — kiểm tra danh mục", 400);

    const sortOrder = Number.isInteger(body?.sortOrder) ? Number(body.sortOrder) : await nextSortOrder();

    const created = await prisma.dutyPosition.create({
      data: {
        code,
        title,
        detail: detail || null,
        slots: slotsCheck.slots as any,
        sortOrder,
        status: "ACTIVE",
        createdById: user.personId,
      },
    });
    await recordAuditEvent({
      actorId: user.id,
      action: "DUTY_POSITION_CREATE",
      resourceType: "DutyPosition",
      resourceId: created.id,
      newData: { code, title, detail, slots: slotsCheck.slots, sortOrder },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi lưu vị trí: " + error.message, 500);
  }
}

async function nextSortOrder(): Promise<number> {
  const last = await prisma.dutyPosition.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return (last?.sortOrder || 0) + 1;
}

/**
 * PATCH /api/rosters/positions — CHỈ UNIT_LEADER: sửa tiêu đề/dòng phụ/ô/thứ tự/trạng thái.
 * Lưu ý: bản ghi phân công cũ giữ nguyên bản sao nội dung — sửa danh mục không đổi lịch sử.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role !== "UNIT_LEADER") return jsonError("Chỉ lãnh đạo đơn vị mới được sửa danh mục vị trí", 403);

    const body = await req.json();
    const { id } = body;
    if (!id) return jsonError("Thiếu ID vị trí", 400);
    const current = await prisma.dutyPosition.findUnique({ where: { id } });
    if (!current) return jsonError("Vị trí không tồn tại", 404);

    const data: any = {};
    const auditNew: any = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (!title) return jsonError("Tên vị trí/nhiệm vụ không được để trống", 400);
      data.title = title;
      auditNew.title = title;
    }
    if (body.detail !== undefined) {
      const detail = body.detail ? String(body.detail).trim() : null;
      data.detail = detail || null;
      auditNew.detail = data.detail;
    }
    if (body.slots !== undefined) {
      const check = validateSlotsInput(body.slots);
      if (!check.ok) return jsonError(check.error, 400);
      data.slots = check.slots as any;
      auditNew.slots = check.slots;
    }
    if (body.sortOrder !== undefined) {
      const so = Number(body.sortOrder);
      if (!Number.isInteger(so) || so < 1 || so > 99) return jsonError("Thứ tự không hợp lệ (1–99)", 400);
      data.sortOrder = so;
      auditNew.sortOrder = so;
    }
    if (body.status !== undefined) {
      const st = String(body.status);
      if (!["ACTIVE", "INACTIVE"].includes(st)) return jsonError("Trạng thái không hợp lệ", 400);
      data.status = st;
      auditNew.status = st;
    }

    if (Object.keys(data).length === 0) return jsonError("Không có thay đổi nào để lưu", 400);

    const updated = await prisma.dutyPosition.update({ where: { id }, data });
    await recordAuditEvent({
      actorId: user.id,
      action: "DUTY_POSITION_UPDATE",
      resourceType: "DutyPosition",
      resourceId: id,
      oldData: { title: current.title, detail: current.detail, slots: current.slots, sortOrder: current.sortOrder, status: current.status },
      newData: auditNew,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật vị trí: " + error.message, 500);
  }
}

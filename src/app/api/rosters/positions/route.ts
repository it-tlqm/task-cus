import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { DUTY_POSITION_SEEDS, parseSlots, validateSlotsInput } from "@/server/duty-catalog";
import { resolveDutyUnitId } from "@/server/duty-scope";

/**
 * YC-24 PHƯƠNG ÁN B — Danh mục vị trí/nhiệm vụ SỞ HỮU THEO TỪNG BỘ PHẬN.
 *
 * - Mỗi bộ phận có danh mục riêng; chỉnh danh mục KHÔNG làm đổi lịch sử phân công (bản ghi giữ bản sao nội dung).
 * - Trưởng bộ phận quản lý danh mục CỦA BỘ PHẬN MÌNH; Lãnh đạo đơn vị quản lý mọi bộ phận trong phạm vi.
 * - 8 nhóm nhiệm vụ mẫu CHỈ khôi phục khi Lãnh đạo đơn vị chủ động yêu cầu và gán về ĐÚNG một bộ phận
 *   (không tự động áp dụng cho mọi bộ phận).
 */

function toDto(p: { id: string; code: string; title: string; detail: string | null; slots: unknown; sortOrder: number; status: string }) {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    detail: p.detail,
    slots: parseSlots(p.slots),
    sortOrder: p.sortOrder,
    status: p.status,
  };
}

/** GET /api/rosters/positions?unitId=... — danh mục vị trí của MỘT bộ phận (mọi vai trò nghiệp vụ trong phạm vi được xem). */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") return jsonError("Quản trị kỹ thuật không có quyền xem danh mục nghiệp vụ", 403);

    const { searchParams } = new URL(req.url);
    const resolved = await resolveDutyUnitId(user, searchParams.get("unitId") || null);
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);

    const rows = await prisma.dutyPosition.findMany({
      where: { unitId: resolved.unitId },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    });
    const unit = resolved.units.find((u) => u.id === resolved.unitId);
    return NextResponse.json({ success: true, data: rows.map(toDto), selectedUnitId: resolved.unitId, unit });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục vị trí: " + error.message, 500);
  }
}

/**
 * POST /api/rosters/positions — Trưởng bộ phận (bộ phận mình) / Lãnh đạo đơn vị.
 * - { unitId, action: "seed-defaults" }: khôi phục 8 vị trí mẫu còn thiếu/gán bộ phận cho vị trí mẫu chưa gắn — CHỈ UNIT_LEADER.
 * - { unitId, title, detail?, slots?, sortOrder? }: tạo vị trí mới thuộc bộ phận.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canManage = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canManage) return jsonError("Chỉ lãnh đạo trong phạm vi mới được sửa danh mục vị trí", 403);

    const body = await req.json();
    if (!body?.unitId) return jsonError("Thiếu bộ phận của danh mục", 400);
    const resolved = await resolveDutyUnitId(user, String(body.unitId));
    if (!resolved.ok) return jsonError(resolved.error, resolved.status);
    const unitId = resolved.unitId;

    if (body?.action === "seed-defaults") {
      // 8 nhóm nhiệm vụ mẫu gắn với ĐÚNG bộ phận được chỉ định — chỉ Lãnh đạo đơn vị chủ động khôi phục.
      if (user.role !== "UNIT_LEADER") {
        return jsonError("Chỉ lãnh đạo đơn vị mới được khôi phục danh mục mẫu", 403);
      }
      let created = 0, adopted = 0, kept = 0, skipped = 0;
      for (const seed of DUTY_POSITION_SEEDS) {
        const existing = await prisma.dutyPosition.findUnique({ where: { code: seed.code } });
        if (!existing) {
          await prisma.dutyPosition.create({
            data: {
              id: seed.id,
              code: seed.code,
              unitId,
              title: seed.title,
              detail: seed.detail,
              slots: seed.slots as any,
              sortOrder: seed.sortOrder,
              status: "ACTIVE",
              createdById: user.personId,
            },
          });
          created++;
        } else if (existing.unitId === unitId) {
          kept++;
        } else if (existing.unitId === null) {
          await prisma.dutyPosition.update({ where: { id: existing.id }, data: { unitId } });
          adopted++;
        } else {
          skipped++; // mã thuộc bộ phận khác — không đụng tới
        }
      }
      await recordAuditEvent({
        actorId: user.id,
        action: "DUTY_POSITION_SEED",
        resourceType: "DutyPosition",
        newData: { unitId, created, adopted, kept, skipped },
      });
      return NextResponse.json({
        success: true,
        message: `Danh mục mẫu: tạo mới ${created}, gán bộ phận ${adopted}, giữ nguyên ${kept}, bỏ qua ${skipped}.`,
        created,
        adopted,
        kept,
        skipped,
      });
    }

    const title = String(body?.title || "").trim();
    if (!title) return jsonError("Tên vị trí/nhiệm vụ là bắt buộc", 400);
    const detail = body?.detail ? String(body.detail).trim() : null;
    const slotsCheck = validateSlotsInput(
      Array.isArray(body?.slots) && body.slots.length > 0 ? body.slots : [{ k: "s1", l: null }]
    );
    if (!slotsCheck.ok) return jsonError(slotsCheck.error, 400);

    // Mã tự sinh: YC24-XX — chọn số kế tiếp chưa dùng (mã duy nhất toàn hệ thống)
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
        unitId,
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
      newData: { unitId, code, title, detail, slots: slotsCheck.slots, sortOrder },
    });
    return NextResponse.json({ success: true, data: toDto(created) }, { status: 201 });
  } catch (error: any) {
    return jsonError("Lỗi khi lưu vị trí: " + error.message, 500);
  }
}

async function nextSortOrder(): Promise<number> {
  const last = await prisma.dutyPosition.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return (last?.sortOrder || 0) + 1;
}

/**
 * PATCH /api/rosters/positions — Trưởng bộ phận (danh mục bộ phận mình) / Lãnh đạo đơn vị:
 * sửa tiêu đề/dòng phụ/ô/thứ tự/trạng thái. Bản ghi phân công cũ giữ nguyên bản sao nội dung.
 * Lãnh đạo đơn vị có thể gán bộ phận cho vị trí đang chưa gắn (unitId null) bằng cách gửi unitId.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const canManage = user.role === "UNIT_LEADER" || user.role === "DEPARTMENT_LEADER";
    if (!canManage) return jsonError("Chỉ lãnh đạo trong phạm vi mới được sửa danh mục vị trí", 403);

    const body = await req.json();
    const { id } = body;
    if (!id) return jsonError("Thiếu ID vị trí", 400);
    const current = await prisma.dutyPosition.findUnique({ where: { id } });
    if (!current) return jsonError("Vị trí không tồn tại", 404);

    // Phạm vi: vị trí thuộc bộ phận nào thì phải có quyền với bộ phận đó.
    // Vị trí chưa gắn bộ phận: chỉ Lãnh đạo đơn vị xử lý (có thể gán bộ phận qua body.unitId).
    if (current.unitId) {
      const resolved = await resolveDutyUnitId(user, current.unitId);
      if (!resolved.ok) return jsonError("Bạn không có quyền sửa danh mục của bộ phận này", 403);
    } else if (user.role !== "UNIT_LEADER") {
      return jsonError("Bạn không có quyền sửa danh mục vị trí chưa gắn bộ phận", 403);
    }

    const data: any = {};
    const auditNew: any = {};

    if (body.unitId !== undefined) {
      const target = String(body.unitId);
      if (current.unitId && target !== current.unitId) {
        return jsonError("Không hỗ trợ chuyển vị trí sang bộ phận khác", 400);
      }
      if (!current.unitId) {
        const resolved = await resolveDutyUnitId(user, target);
        if (!resolved.ok) return jsonError(resolved.error, resolved.status);
        data.unitId = target;
        auditNew.unitId = target;
      }
    }
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
      oldData: {
        unitId: current.unitId,
        title: current.title,
        detail: current.detail,
        slots: current.slots,
        sortOrder: current.sortOrder,
        status: current.status,
      },
      newData: auditNew,
    });
    return NextResponse.json({ success: true, data: toDto(updated) });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật vị trí: " + error.message, 500);
  }
}

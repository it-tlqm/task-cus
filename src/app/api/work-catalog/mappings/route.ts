import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import { getCatalogDepartmentStatuses } from "@/server/work-catalog";

/**
 * YC-31 — Ánh xạ nhóm TX trong file nguồn với bộ phận thật (org_units)
 * và bật/tắt kích hoạt THEO TỪNG BỘ PHẬN.
 *
 * Nguyên tắc:
 * - Tên nhóm nguồn giữ nguyên, không tự tạo org_units.
 * - Mặc định chưa kích hoạt; chỉ nhóm đã xác nhận mới được phát cho cán bộ.
 * - Kích hoạt bắt buộc phải có unitId hợp lệ (CSDL cũng có CHECK constraint).
 */

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền quản lý danh mục công việc", 403);
    }

    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId");
    const [status, units] = await Promise.all([
      getCatalogDepartmentStatuses(versionId),
      prisma.orgUnit.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, code: true, name: true, level: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        version: status.version,
        departments: status.departments,
        units,
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải bảng ánh xạ bộ phận TX: " + error.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền quản lý danh mục công việc", 403);
    }

    const body = await req.json();
    const department = String(body.department || "").trim();
    if (!department) return jsonError("Thiếu tên nhóm bộ phận trong file nguồn", 400);

    const activeVersion = await prisma.workCatalogVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { importedAt: "desc" },
      select: { id: true, code: true },
    });
    if (!activeVersion) {
      return jsonError("Chưa có phiên bản danh mục TX đang áp dụng — hãy nhập danh mục trước", 409);
    }
    const departmentExists = await prisma.workCatalogEntry.findFirst({
      where: { versionId: activeVersion.id, department },
      select: { id: true },
    });
    if (!departmentExists) {
      return jsonError("Nhóm bộ phận không tồn tại trong phiên bản đang áp dụng", 400);
    }

    const existing = await prisma.workCatalogDepartmentMapping.findUnique({
      where: { department },
    });

    let nextUnitId = existing?.unitId ?? null;
    if (body.unitId !== undefined) {
      const raw = body.unitId;
      if (raw === null || raw === "") {
        nextUnitId = null;
      } else {
        const unit = await prisma.orgUnit.findUnique({
          where: { id: String(raw) },
          select: { id: true, status: true },
        });
        if (!unit) return jsonError("Bộ phận được chọn không tồn tại trong org_units", 400);
        if (unit.status !== "ACTIVE") {
          return jsonError("Bộ phận được chọn đã ngừng hoạt động", 400);
        }
        nextUnitId = unit.id;
      }
    }

    const nextActive =
      body.isActive === undefined ? Boolean(existing?.isActive) : Boolean(body.isActive);
    if (nextActive && !nextUnitId) {
      return jsonError(
        "Phải chọn bộ phận thật trong org_units trước khi kích hoạt nhóm TX",
        400
      );
    }

    let nextNote = existing?.note ?? null;
    if (body.note !== undefined) {
      const note = String(body.note ?? "").trim();
      if (note.length > 500) return jsonError("Ghi chú tối đa 500 ký tự", 400);
      nextNote = note || null;
    }

    const activatedNow = nextActive && (!existing?.isActive || existing?.unitId !== nextUnitId);
    const mapping = await prisma.workCatalogDepartmentMapping.upsert({
      where: { department },
      create: {
        department,
        unitId: nextUnitId,
        isActive: nextActive,
        note: nextNote,
        confirmedBy: nextActive ? user.personId : null,
        confirmedAt: nextActive ? new Date() : null,
      },
      update: {
        unitId: nextUnitId,
        isActive: nextActive,
        note: nextNote,
        ...(activatedNow
          ? { confirmedBy: user.personId, confirmedAt: new Date() }
          : {}),
      },
      include: { unit: { select: { id: true, code: true, name: true } } },
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "WORK_CATALOG_DEPARTMENT_MAPPING_UPDATE",
      resourceType: "WorkCatalogDepartmentMapping",
      resourceId: mapping.id,
      oldData: existing
        ? {
            department: existing.department,
            unitId: existing.unitId,
            isActive: existing.isActive,
            note: existing.note,
          }
        : null,
      newData: {
        department: mapping.department,
        unitId: mapping.unitId,
        unitCode: mapping.unit?.code || null,
        unitName: mapping.unit?.name || null,
        isActive: mapping.isActive,
        note: mapping.note,
        versionCode: activeVersion.code,
        activatedNow,
      },
    });

    return NextResponse.json({
      success: true,
      message: mapping.isActive
        ? `Đã kích hoạt nhóm "${mapping.department}" cho bộ phận ${mapping.unit?.name || ""}`
        : `Đã tắt kích hoạt nhóm "${mapping.department}"`,
      data: mapping,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi cập nhật ánh xạ bộ phận TX: " + error.message, 500);
  }
}

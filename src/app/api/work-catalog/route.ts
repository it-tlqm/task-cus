import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, getAuthorizedUnitIds, jsonError } from "@/server/guard";
import {
  getActiveWorkCatalogVersion,
  getCatalogActivationForPerson,
  getCatalogDepartmentStatuses,
  getSelectableCatalogEntriesForPerson,
  isLegacyTemplateSelectableForPerson,
} from "@/server/work-catalog";

/**
 * GET /api/work-catalog
 *
 * - Người dùng nghiệp vụ: chỉ trả các đầu việc TX thuộc nhóm đã được
 *   ánh xạ + kích hoạt cho ĐÚNG bộ phận của cán bộ. Nhóm chưa xác nhận
 *   không được phát ra để tránh chọn sai phạm vi.
 * - Quản trị danh mục (`includeInactive=1`): xem toàn bộ đầu việc của
 *   phiên bản (kể cả ngừng sử dụng) để đối soát.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập để truy cập danh mục công việc", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền truy cập danh mục nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId");
    const department = searchParams.get("department");
    const q = (searchParams.get("q") || "").trim();
    const includeInactive = searchParams.get("includeInactive") === "1";

    // ---- Chế độ quản trị: xem đầy đủ để đối soát, không dùng cho picker ----
    if (includeInactive) {
      if (!checkPermission(user, "catalog.manage")) {
        return jsonError("Bạn không có quyền quản lý danh mục công việc", 403);
      }

      const version = versionId
        ? await prisma.workCatalogVersion.findUnique({
            where: { id: versionId },
            include: { importedBy: { select: { id: true, fullName: true, code: true } } },
          })
        : await getActiveWorkCatalogVersion();

      if (!version) {
        return NextResponse.json({
          success: true,
          data: {
            version: null,
            entries: [],
            departments: [],
            totalEntries: 0,
            legacyTemplatesSelectable: true,
            activation: { status: "NO_VERSION", activatedDepartments: [] },
          },
        });
      }

      const baseWhere: any = { versionId: version.id };
      if (department) baseWhere.department = department;

      const [entries, allForDepartments, mappingStatus] = await Promise.all([
        prisma.workCatalogEntry.findMany({
          where: {
            ...baseWhere,
            ...(q
              ? {
                  OR: [
                    { title: { contains: q, mode: "insensitive" } },
                    { code: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          orderBy: [{ departmentOrder: "asc" }, { sortOrder: "asc" }],
        }),
        prisma.workCatalogEntry.findMany({
          where: { versionId: version.id },
          select: { department: true, departmentOrder: true },
        }),
        getCatalogDepartmentStatuses(version.id),
      ]);

      const deptMap = new Map<string, { name: string; order: number; count: number }>();
      for (const e of allForDepartments) {
        const cur = deptMap.get(e.department) || {
          name: e.department,
          order: e.departmentOrder,
          count: 0,
        };
        cur.count += 1;
        deptMap.set(e.department, cur);
      }

      return NextResponse.json({
        success: true,
        data: {
          version,
          entries,
          departments: [...deptMap.values()].sort((a, b) => a.order - b.order),
          totalEntries: allForDepartments.length,
          legacyTemplatesSelectable: await isLegacyTemplateSelectableForPerson(user.personId),
          activation: { status: "MANAGEMENT", departments: mappingStatus.departments },
        },
      });
    }

    // ---- Chế độ picker: chỉ đầu việc đã kích hoạt cho bộ phận của cán bộ ----
    let targetPersonId = user.personId;
    const requestedPersonId = searchParams.get("personId");
    if (requestedPersonId && requestedPersonId !== user.personId) {
      const target = await prisma.person.findUnique({
        where: { id: requestedPersonId },
        include: { assignments: { select: { unitId: true } } },
      });
      if (!target) return jsonError("Cán bộ không tồn tại", 404);
      const scope = await getAuthorizedUnitIds(user);
      const allowed =
        user.role === "UNIT_LEADER" ||
        scope === "ALL" ||
        target.assignments.some((a) => scope.includes(a.unitId));
      if (!allowed) {
        return jsonError("Bạn không có quyền xem danh mục cho cán bộ này", 403);
      }
      targetPersonId = requestedPersonId;
    }

    const activeVersion = await getActiveWorkCatalogVersion();
    if (!activeVersion) {
      const activation = await getCatalogActivationForPerson(targetPersonId);
      return NextResponse.json({
        success: true,
        data: {
          version: null,
          entries: [],
          departments: [],
          totalEntries: 0,
          legacyTemplatesSelectable: true,
          activation: {
            status: "NO_VERSION",
            unitIds: activation.unitIds,
            activatedDepartments: [],
          },
        },
      });
    }

    if (versionId && versionId !== activeVersion.id) {
      return jsonError(
        "Chỉ phiên bản đang áp dụng mới được dùng để chọn đầu việc mới; phiên bản cũ chỉ xem ở màn hình quản trị",
        400
      );
    }

    const selectable = await getSelectableCatalogEntriesForPerson(targetPersonId, {
      department,
      q,
    });

    const deptMap = new Map<string, { name: string; order: number; count: number }>();
    for (const e of selectable.entries) {
      const cur = deptMap.get(e.department) || {
        name: e.department,
        order: e.departmentOrder,
        count: 0,
      };
      cur.count += 1;
      deptMap.set(e.department, cur);
    }

    return NextResponse.json({
      success: true,
      data: {
        version: {
          id: activeVersion.id,
          code: activeVersion.code,
          title: activeVersion.title,
          status: activeVersion.status,
          entryCount: activeVersion.entryCount,
          importedAt: activeVersion.importedAt,
          sourceFileName: activeVersion.sourceFileName,
          sourceSheet: activeVersion.sourceSheet,
          note: activeVersion.note,
          importedBy: activeVersion.importedBy,
        },
        entries: selectable.entries,
        departments: [...deptMap.values()].sort((a, b) => a.order - b.order),
        totalEntries: selectable.entries.length,
        legacyTemplatesSelectable: !selectable.activation.activated,
        activation: {
          status: selectable.activation.activated ? "ACTIVATED" : "NOT_ACTIVATED",
          unitIds: selectable.activation.unitIds,
          activatedDepartments: selectable.activation.departments,
        },
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục công việc thường xuyên: " + error.message, 500);
  }
}

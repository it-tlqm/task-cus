import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  getActiveWorkCatalogVersion,
  isLegacyTemplateSelectable,
} from "@/server/work-catalog";

/**
 * GET /api/work-catalog
 * Danh sách đầu việc TX của phiên bản đang áp dụng (mặc định) hoặc phiên bản chỉ định.
 * Quyền: người dùng nghiệp vụ (SYSTEM_ADMIN bị chặn theo quy ước hiện hành).
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
        },
      });
    }

    const baseWhere: any = { versionId: version.id };
    if (!includeInactive) baseWhere.status = "ACTIVE";
    if (department) baseWhere.department = department;

    const [entries, allForDepartments] = await Promise.all([
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
        where: { versionId: version.id, ...(includeInactive ? {} : { status: "ACTIVE" }) },
        select: { department: true, departmentOrder: true },
      }),
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
        version: {
          id: version.id,
          code: version.code,
          title: version.title,
          status: version.status,
          entryCount: version.entryCount,
          importedAt: version.importedAt,
          sourceFileName: version.sourceFileName,
          sourceSheet: version.sourceSheet,
          note: version.note,
          importedBy: version.importedBy,
        },
        entries,
        departments: [...deptMap.values()].sort((a, b) => a.order - b.order),
        totalEntries: allForDepartments.length,
        legacyTemplatesSelectable: await isLegacyTemplateSelectable(),
      },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục công việc thường xuyên: " + error.message, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

/**
 * GET /api/work-catalog/versions
 * Lịch sử phiên bản danh mục TX + số liệu nhập. Chỉ đọc.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền truy cập danh mục nghiệp vụ", 403);
    }

    const versions = await prisma.workCatalogVersion.findMany({
      orderBy: { importedAt: "desc" },
      include: {
        importedBy: { select: { id: true, fullName: true, code: true } },
        _count: { select: { entries: true } },
      },
    });

    const counts = await prisma.workCatalogEntry.groupBy({
      by: ["versionId", "status"],
      _count: { _all: true },
    });
    const statusMap = new Map<string, { active: number; inactive: number }>();
    for (const c of counts) {
      const cur = statusMap.get(c.versionId) || { active: 0, inactive: 0 };
      if (c.status === "ACTIVE") cur.active += c._count._all;
      else cur.inactive += c._count._all;
      statusMap.set(c.versionId, cur);
    }

    return NextResponse.json({
      success: true,
      data: versions.map((v) => ({
        id: v.id,
        code: v.code,
        title: v.title,
        status: v.status,
        entryCount: v.entryCount,
        sourceFileName: v.sourceFileName,
        sourceSheet: v.sourceSheet,
        note: v.note,
        importedAt: v.importedAt,
        importedBy: v.importedBy,
        activeEntries: statusMap.get(v.id)?.active ?? 0,
        inactiveEntries: statusMap.get(v.id)?.inactive ?? 0,
      })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch sử danh mục: " + error.message, 500);
  }
}

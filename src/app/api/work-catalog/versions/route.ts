import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { setCatalogSelectionMode } from "@/server/work-catalog";

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
        selectionMode: v.selectionMode,
        activeEntries: statusMap.get(v.id)?.active ?? 0,
        inactiveEntries: statusMap.get(v.id)?.inactive ?? 0,
      })),
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải lịch sử danh mục: " + error.message, 500);
  }
}

/**
 * PATCH /api/work-catalog/versions
 * Đổi chế độ chọn đầu việc của một phiên bản:
 *  - MAPPED: chỉ nhóm đã ánh xạ + kích hoạt cho bộ phận của cán bộ.
 *  - ALL: mọi cán bộ chọn được mọi nhóm — dùng khi Hải quan chưa xác nhận ánh xạ bộ phận,
 *    để danh mục vẫn dùng được ngay mà không cần chặn cả danh mục.
 * Quyền: catalog.manage.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!checkPermission(user, "catalog.manage")) {
      return jsonError("Bạn không có quyền cấu hình danh mục công việc", 403);
    }

    const body = await req.json().catch(() => ({}));
    const versionId = String(body.versionId || "").trim();
    const selectionMode = String(body.selectionMode || "").trim().toUpperCase();
    if (!versionId) return jsonError("Thiếu mã phiên bản danh mục", 400);
    if (selectionMode !== "MAPPED" && selectionMode !== "ALL") {
      return jsonError("Chế độ chọn không hợp lệ (MAPPED hoặc ALL)", 400);
    }

    const version = await prisma.workCatalogVersion.findUnique({
      where: { id: versionId },
      select: { id: true, code: true, status: true },
    });
    if (!version) return jsonError("Không tìm thấy phiên bản danh mục", 404);

    const updated = await setCatalogSelectionMode(
      version.id,
      selectionMode as "MAPPED" | "ALL",
      user.id
    );

    return NextResponse.json({
      success: true,
      message:
        selectionMode === "ALL"
          ? "Đã cho phép chọn đầu việc từ tất cả các nhóm danh mục"
          : "Đã giới hạn chọn đầu việc theo bộ phận đã ánh xạ",
      data: updated,
    });
  } catch (error: any) {
    return jsonError("Lỗi khi đổi chế độ chọn danh mục: " + error.message, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";

/**
 * YC-11 — Danh mục sản phẩm QĐ1277: xem + tìm kiếm + phân trang.
 * Không tải toàn bộ nghìn dòng vào dropdown; công chức thường không sửa hệ số.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xem danh mục nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() || "";
    const groupId = searchParams.get("groupId") || "";
    const versionCode = searchParams.get("version") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "30", 10)));

    const version = versionCode
      ? await prisma.productCatalogVersion.findUnique({ where: { code: versionCode } })
      : await prisma.productCatalogVersion.findFirst({ where: { status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (!version) return jsonError("Chưa có phiên bản danh mục sản phẩm nào", 404);

    const where: any = { versionId: version.id, status: "ACTIVE" };
    if (groupId) where.groupId = groupId;
    if (search) {
      where.OR = [
        { code: { contains: search, mode: "insensitive" } },
        { sourceStt: { contains: search, mode: "insensitive" } },
        { taskName: { contains: search, mode: "insensitive" } },
        { detailWork: { contains: search, mode: "insensitive" } },
        { outputProduct: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, items, groups, versions] = await Promise.all([
      prisma.productItem.count({ where }),
      prisma.productItem.findMany({
        where,
        include: { group: { select: { id: true, code: true, title: true } } },
        orderBy: [{ sourceRow: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.productGroup.findMany({
        where: { versionId: version.id },
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, title: true },
      }),
      prisma.productCatalogVersion.findMany({
        orderBy: { createdAt: "desc" },
        select: { id: true, code: true, title: true, status: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      version: { code: version.code, title: version.title, qdRef: version.qdRef },
      data: items,
      groups,
      versions,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error: any) {
    return jsonError("Lỗi khi tải danh mục sản phẩm: " + error.message, 500);
  }
}

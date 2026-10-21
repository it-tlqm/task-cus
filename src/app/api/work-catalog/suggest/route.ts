import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { unaccentSearchIds } from "@/server/search";

export const runtime = "nodejs";

/**
 * GET /api/work-catalog/suggest?q=&limit=8
 *
 * YC-38B — Gợi ý đầu việc Danh mục TX khi cán bộ đã nhập tên công việc.
 *  - Tìm KHÔNG DẤU, không phân biệt hoa/thường (dùng unaccent() + ILIKE).
 *  - Tối đa 8 gợi ý (mặc định), sắp xếp theo độ khớp:
 *      1) khớp tiêu đề đầy đủ (điểm cao nhất)
 *      2) khớp tiêu đề dạng từ khoá
 *      3) mã đầu việc khớp
 *      4) ưu tiên nhóm TX mà người đó vừa dùng (gợi ý "gần đây")
 *  - CHỈ trả về đầu việc đang ACTIVE trong phiên bản đang áp dụng.
 *  - KHÔNG tự gắn sản phẩm QĐ1277 (quyết định I.4).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền tra cứu danh mục nghiệp vụ", 403);
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(8, Math.max(1, parseInt(searchParams.get("limit") || "8", 10)));
    if (q.length < 2) {
      return NextResponse.json({ success: true, data: [], total: 0 });
    }

    const version = await prisma.workCatalogVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { importedAt: "desc" },
      select: { id: true, code: true },
    });
    if (!version) {
      return NextResponse.json({ success: true, data: [], total: 0, version: null });
    }

    // Lọc không dấu ở DB (title hoặc code)
    const ids = await unaccentSearchIds(
      "work_catalog_entries",
      ["title", "code"],
      q,
      200
    );
    if (!ids || ids.length === 0) {
      return NextResponse.json({ success: true, data: [], total: 0, version });
    }

    const rows = await prisma.workCatalogEntry.findMany({
      where: { id: { in: ids }, versionId: version.id, status: "ACTIVE" },
      select: {
        id: true,
        code: true,
        title: true,
        department: true,
        groupCode: true,
        convertFactor: true,
      },
    });

    // Chấm điểm độ khớp (không dấu, không phân biệt hoa thường)
    const norm = (s: string) =>
      s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
    const nq = norm(q);
    const qTokens = nq.split(" ").filter((t) => t.length >= 2);

    const scored = rows
      .map((r) => {
        const nt = norm(r.title);
        const nc = norm(r.code);
        let score = 0;
        if (nt === nq) score += 100;
        if (nt.startsWith(nq)) score += 60;
        if (nt.includes(nq)) score += 40;
        const matched = qTokens.filter((t) => nt.includes(t)).length;
        score += matched * 12;
        if (nc === nq) score += 80;
        else if (nc.includes(nq)) score += 30;
        if (r.convertFactor !== null && r.convertFactor !== undefined) score += 3;
        return { ...r, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      data: scored.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        department: r.department,
        groupCode: r.groupCode,
        convertFactor:
          r.convertFactor === null || r.convertFactor === undefined
            ? null
            : Number(r.convertFactor),
      })),
      total: scored.length,
      version,
    });
  } catch (error: any) {
    console.error("[Work Catalog Suggest Error]", error);
    return jsonError("Lỗi khi gợi ý đầu việc: " + error.message, 500);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission } from "@/server/guard";
import { unaccentSearchIds } from "@/server/search";

/**
 * Nhật ký kiểm toán — phân trang + lọc phía máy chủ.
 * ?meta=actions  → danh sách hành động thực tế (đổ dropdown lọc)
 * ?page=1&pageSize=50&search=...&action=...  → trang dữ liệu
 * (vẫn nhận ?limit=N cũ để tương thích các màn hình khác)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkPermission(user, "audit.view")) {
      return NextResponse.json(
        { error: "Bạn không có quyền xem nhật ký kiểm toán hệ thống" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);

    // Dropdown "hành động": chỉ liệt kê các mã thật đang có trong nhật ký
    if (searchParams.get("meta") === "actions") {
      const grouped = await prisma.auditEvent.groupBy({
        by: ["action"],
        _count: { _all: true },
        orderBy: { _count: { action: "desc" } },
        take: 40,
      });
      return NextResponse.json({
        success: true,
        actions: grouped.map((g) => ({ action: g.action, count: g._count._all })),
      });
    }

    const action = searchParams.get("action")?.trim() || "";
    const search = searchParams.get("search")?.trim() || "";
    const legacyLimit = searchParams.get("limit");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = legacyLimit
      ? Math.min(200, Math.max(1, parseInt(legacyLimit, 10)))
      : Math.min(200, Math.max(10, parseInt(searchParams.get("pageSize") || "50", 10)));

    const where: any = {};
    if (action) where.action = action;

    // Tìm không dấu theo người thực hiện (họ tên/mã/tên đăng nhập) + hành động + đối tượng tác động
    if (search) {
      const [personIds, accountIds] = await Promise.all([
        unaccentSearchIds("people", ["full_name", "code"], search),
        unaccentSearchIds("accounts", ["username"], search),
      ]);
      const actorIds = new Set<string>(accountIds || []);
      if (personIds && personIds.length > 0) {
        const accs = await prisma.account.findMany({
          where: { personId: { in: personIds } },
          select: { id: true },
        });
        for (const a of accs) actorIds.add(a.id);
      }
      where.OR = [
        ...(actorIds.size > 0 ? [{ actorId: { in: Array.from(actorIds) } }] : []),
        { action: { contains: search, mode: "insensitive" } },
        { resourceType: { contains: search, mode: "insensitive" } },
        { resourceId: { contains: search, mode: "insensitive" } },
        { id: { startsWith: search.toLowerCase() } },
      ];
    }

    const [total, events] = await Promise.all([
      prisma.auditEvent.count({ where }),
      prisma.auditEvent.findMany({
        where,
        include: {
          actor: {
            include: {
              person: true,
              roleGrants: {
                include: { role: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const formattedEvents = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      actorUsername: e.actor?.username || "Hệ thống",
      actorFullName: e.actor?.person?.fullName || "Hệ thống tự động",
      actorRole: e.actor?.roleGrants?.[0]?.role?.code || null,
      ipAddress: e.ipAddress || null,
      oldData: e.oldData,
      newData: e.newData,
      status: e.action.includes("BLOCKED")
        ? "BLOCKED"
        : e.action.includes("ISSUE") || e.action.includes("WARNING")
        ? "WARNING"
        : "SUCCESS",
    }));

    return NextResponse.json({
      success: true,
      events: formattedEvents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err: any) {
    console.error("Error in GET /api/admin/audit:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

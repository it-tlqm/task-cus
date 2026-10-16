import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { prisma } from "@/server/db";
import { checkPermission } from "@/server/guard";

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
    const action = searchParams.get("action");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    const where: any = {};
    if (action) {
      where.action = action;
    }

    const events = await prisma.auditEvent.findMany({
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
      take: limit,
    });

    const formattedEvents = events.map((e) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      action: e.action,
      resourceType: e.resourceType,
      resourceId: e.resourceId,
      actorUsername: e.actor?.username || "Hệ thống",
      actorFullName: e.actor?.person?.fullName || "Hệ thống tự động",
      actorRole: e.actor?.roleGrants?.[0]?.role?.code || null,
      ipAddress: e.ipAddress || "127.0.0.1",
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
      total: formattedEvents.length,
      events: formattedEvents,
    });
  } catch (err: any) {
    console.error("Error in GET /api/admin/audit:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

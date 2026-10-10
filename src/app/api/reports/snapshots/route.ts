import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { listReportSnapshots, createReportSnapshot, listAvailablePeriods } from "@/server/snapshots";

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [snapshots, availablePeriods] = await Promise.all([
      listReportSnapshots(user),
      listAvailablePeriods(),
    ]);

    return NextResponse.json({
      success: true,
      snapshots,
      availablePeriods,
    });
  } catch (err: any) {
    console.error("Error in GET /api/reports/snapshots:", err);
    if (err.message?.startsWith("SCOPE_VIOLATION")) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { periodId, notes, scopeUnitId } = body;

    const result = await createReportSnapshot(user, {
      periodId,
      notes,
      scopeUnitId,
    });

    return NextResponse.json(
      {
        ...result,
        message: `Đã chốt và khóa thành công số liệu ${result.snapshot.periodTitle}. Mã kiểm tra toàn vẹn: ${result.snapshot.checksum}`,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("Error in POST /api/reports/snapshots:", err);

    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json(
        { error: err.message.replace("FORBIDDEN: ", "") },
        { status: 403 }
      );
    }
    if (
      err.code === "P2002" ||
      err.message?.includes("Unique constraint failed") ||
      err.message?.startsWith("ALREADY_LOCKED")
    ) {
      return NextResponse.json(
        {
          error: err.message?.startsWith("ALREADY_LOCKED")
            ? err.message.replace("ALREADY_LOCKED: ", "")
            : "Kỳ báo cáo này đã được chốt và khóa số liệu trước đó (Xung đột đồng thời)",
        },
        { status: 409 }
      );
    }
    if (err.message?.startsWith("NOT_FOUND")) {
      return NextResponse.json(
        { error: err.message.replace("NOT_FOUND: ", "") },
        { status: 404 }
      );
    }
    if (err.message?.startsWith("SCOPE_VIOLATION")) {
      return NextResponse.json(
        { error: err.message.replace("SCOPE_VIOLATION: ", "") },
        { status: 403 }
      );
    }

    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

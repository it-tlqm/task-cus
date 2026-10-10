import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { getReportSnapshotById, verifySnapshotIntegrity } from "@/server/snapshots";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const snapshot = await getReportSnapshotById(id, user);

    if (!snapshot) {
      return NextResponse.json(
        { error: "Không tìm thấy bản chụp số liệu để xác minh" },
        { status: 404 }
      );
    }

    const result = verifySnapshotIntegrity(snapshot.checksum, snapshot.snapshotData);

    return NextResponse.json({
      success: true,
      snapshotId: snapshot.id,
      code: snapshot.code,
      periodTitle: snapshot.period.title,
      ...result,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Error in POST /api/reports/snapshots/[id]/verify:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return POST(req, context);
}

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { getReportSnapshotById } from "@/server/snapshots";

export async function GET(
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
        { error: "Không tìm thấy bản chụp số liệu tương ứng" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      snapshot,
    });
  } catch (err: any) {
    console.error("Error in GET /api/reports/snapshots/[id]:", err);
    if (err.message?.startsWith("FORBIDDEN")) {
      return NextResponse.json({ error: err.message.replace("FORBIDDEN: ", "") }, { status: 403 });
    }
    if (err.message?.startsWith("SCOPE_VIOLATION")) {
      return NextResponse.json({ error: err.message.replace("SCOPE_VIOLATION: ", "") }, { status: 403 });
    }
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function PUT() {
  return NextResponse.json(
    { error: "Bản chụp số liệu đã chốt là bất biến trong vận hành thông thường, không cho phép chỉnh sửa" },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Bản chụp số liệu đã chốt là bất biến trong vận hành thông thường, không cho phép chỉnh sửa" },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Bản chụp số liệu đã chốt là bất biến trong vận hành thông thường, không cho phép xóa bỏ" },
    { status: 405 }
  );
}

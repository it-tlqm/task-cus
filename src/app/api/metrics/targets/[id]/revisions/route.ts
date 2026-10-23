import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { MetricTargetError, listMetricTargetRevisions } from "@/server/metric-targets";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const revisions = await listMetricTargetRevisions(user, id);
    return NextResponse.json({ success: true, revisions });
  } catch (error) {
    if (error instanceof MetricTargetError) return jsonError(error.message, error.statusCode);
    console.error("GET /api/metrics/targets/[id]/revisions error:", error);
    return jsonError("Lỗi hệ thống khi tải lịch sử chỉ tiêu giao.", 500);
  }
}

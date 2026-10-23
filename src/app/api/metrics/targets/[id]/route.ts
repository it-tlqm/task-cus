import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import {
  MetricTargetError,
  confirmMetricTarget,
  getMetricTarget,
  lockMetricTarget,
  updateMetricTarget,
  voidMetricTarget,
} from "@/server/metric-targets";

export const runtime = "nodejs";

function fail(error: unknown) {
  if (error instanceof MetricTargetError) return jsonError(error.message, error.statusCode);
  console.error("GET/PATCH/POST/DELETE /api/metrics/targets/[id] error:", error);
  return jsonError("Lỗi hệ thống khi xử lý chỉ tiêu giao.", 500);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const target = await getMetricTarget(user, id);
    return NextResponse.json({ success: true, target });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);
    const target = await updateMetricTarget(user, id, body as Record<string, unknown>);
    return NextResponse.json({ success: true, target });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("Dữ liệu không hợp lệ", 400);
    const action = String((body as Record<string, unknown>).action || "").trim();

    if (action === "confirm") {
      const target = await confirmMetricTarget(user, id, body as Record<string, unknown>);
      return NextResponse.json({ success: true, target });
    }
    if (action === "lock") {
      const target = await lockMetricTarget(user, id, body as Record<string, unknown>);
      return NextResponse.json({ success: true, target });
    }
    if (action === "void") {
      const result = await voidMetricTarget(user, id, body as Record<string, unknown>);
      return NextResponse.json({ success: true, ...result });
    }
    return jsonError("Thao tác chỉ tiêu giao không hợp lệ.", 400);
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await voidMetricTarget(user, id, body as Record<string, unknown>);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return fail(error);
  }
}

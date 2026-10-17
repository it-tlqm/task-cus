import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { computeMetricSummary } from "@/server/metrics";
import { getIsoWeekFromDate, getVnDateParts } from "@/lib/period-helper";

// ============================================================
// GET /api/metrics/summary?year=2026&week=42&month=10&quarter=4&scope=full|dashboard
// Trả về số liệu Tuần / Tháng / Quý / Năm + % chỉ tiêu giao + trạng thái nhập.
// Mọi người dùng đã đăng nhập đều xem được (chỉ đọc).
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const vn = getVnDateParts(now);
    const iso = getIsoWeekFromDate(now);

    const year = Number(searchParams.get("year")) || iso.year;
    const weekNumber = Number(searchParams.get("week")) || iso.weekNumber;
    const month = Math.min(12, Math.max(1, Number(searchParams.get("month")) || vn.month));
    const quarter = Math.min(4, Math.max(1, Number(searchParams.get("quarter")) || Math.ceil(vn.month / 3)));
    const scopeParam = searchParams.get("scope");
    const scope = scopeParam === "dashboard" ? "dashboard" : "full";

    const result = await computeMetricSummary({ year, weekNumber, month, quarter }, scope);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("GET /api/metrics/summary error:", error);
    return jsonError("Lỗi hệ thống khi tổng hợp số liệu", 500);
  }
}

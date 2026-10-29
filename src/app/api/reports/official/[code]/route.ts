import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { checkPermission, jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  buildOfficialReport,
  type OfficialReportCode,
} from "@/server/official-reports";

export const runtime = "nodejs";

const CODES: OfficialReportCode[] = ["2c", "2d", "2e", "cong-van"];

/**
 * GET /api/reports/official/{2c|2d|2e|cong-van}?year=2026&quarter=4&documentNo=...
 *
 * Xuất biểu mẫu chính thức từ file mẫu thật trong public/templates.
 * Chỉ lãnh đạo hoặc tài khoản có quyền reports.export được xuất.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (user.role === "SYSTEM_ADMIN") {
      return jsonError("Quản trị kỹ thuật không có quyền xuất dữ liệu đánh giá", 403);
    }

    const canExport =
      checkPermission(user, "reports.export") ||
      user.role === "UNIT_LEADER" ||
      user.role === "DEPARTMENT_LEADER";
    if (!canExport) {
      await recordAuditEvent({
        actorId: user.id,
        action: "OFFICIAL_REPORT_EXPORT_BLOCKED",
        resourceType: "Report",
        newData: { reason: "Thiếu quyền reports.export", username: user.username },
      });
      return jsonError("Bạn không có quyền xuất biểu mẫu báo cáo", 403);
    }

    const { code } = await params;
    if (!CODES.includes(code as OfficialReportCode)) {
      return jsonError("Mẫu báo cáo không hợp lệ (2c, 2d, 2e, cong-van)", 400);
    }

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const quarter = Number(searchParams.get("quarter")) || Math.floor(now.getMonth() / 3) + 1;
    const documentNo = searchParams.get("documentNo") || "";
    const periodTypeParam = (searchParams.get("periodType") || "QUARTER").toUpperCase();
    const periodType = periodTypeParam === "MONTH" ? "MONTH" : "QUARTER";
    const numberRaw = searchParams.get("number");
    const number = numberRaw ? Number(numberRaw) : undefined;

    const { buffer, filename, contentType } = await buildOfficialReport(
      code as OfficialReportCode,
      { year, quarter, documentNo, periodType, number }
    );

    await recordAuditEvent({
      actorId: user.id,
      action: "OFFICIAL_REPORT_EXPORT",
      resourceType: "Report",
      newData: { code, year, quarter, filename, by: user.username },
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi xuất biểu mẫu";
    return jsonError(message, 400);
  }
}

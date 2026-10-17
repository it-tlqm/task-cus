import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  composeBriefingReport,
  defaultReportMeta,
  deleteReportVersion,
  getReportVersionSnapshot,
  listReportVersions,
  REPORT_PERIOD_TYPES,
  reportPeriodKey,
  saveReportVersion,
  type ReportPeriodType,
} from "@/server/briefing-report";
import { renderReportDocx } from "@/server/briefing-report-docx";
import { isMetricsAdmin, type SummaryAnchors } from "@/server/metrics";
import { getIsoWeekFromDate, getVnDateParts } from "@/lib/period-helper";

// ============================================================
// Báo cáo giao ban (Giai đoạn 3):
//   GET  /api/metrics/report?periodType=WEEK&year=&week=&month=&quarter=
//        -> xem trước (tổng hợp mới) + danh sách phiên bản đã lưu
//   GET  ?download=current            -> tải Word bản tổng hợp mới
//   GET  ?download=<versionId>        -> tải Word từ phiên bản đã lưu (snapshot)
//   POST { periodType, year, week, month, quarter, title, subtitle, meetingStart, meetingEnd }
//        -> lưu phiên bản (chụp lại số liệu tại server) — chỉ lãnh đạo/quản trị
//   DELETE ?versionId= -> xóa phiên bản — chỉ lãnh đạo/quản trị
// Mọi tài khoản đã đăng nhập được XEM/TẢI (như trang tổng quan số liệu).
// ============================================================

function parseAnchors(searchParams: URLSearchParams): { periodType: ReportPeriodType; anchors: SummaryAnchors } | null {
  const periodType = (searchParams.get("periodType") || "WEEK") as ReportPeriodType;
  if (!REPORT_PERIOD_TYPES.includes(periodType)) return null;

  const now = new Date();
  const vn = getVnDateParts(now);
  const iso = getIsoWeekFromDate(now);

  const yearRaw = Number(searchParams.get("year")) || iso.year;
  const year = Math.min(2100, Math.max(2000, yearRaw));
  const weekNumber = Math.min(53, Math.max(1, Number(searchParams.get("week")) || iso.weekNumber));
  const month = Math.min(12, Math.max(1, Number(searchParams.get("month")) || vn.month));
  const quarter = Math.min(4, Math.max(1, Number(searchParams.get("quarter")) || Math.ceil(vn.month / 3)));

  return { periodType, anchors: { year, weekNumber, month, quarter } };
}

function docxFileName(snapshot: { meta: { periodKey: string; periodLabel: string } }, versionNo: number | null): {
  ascii: string;
  utf8: string;
} {
  const suffix = versionNo ? `-v${versionNo}` : "";
  return {
    ascii: `Bao-cao-giao-ban-${snapshot.meta.periodKey}${suffix}.docx`,
    utf8: `Báo cáo giao ban - ${snapshot.meta.periodLabel}${suffix}.docx`,
  };
}

function docxResponse(buffer: Uint8Array, names: { ascii: string; utf8: string }): NextResponse {
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${names.ascii}"; filename*=UTF-8''${encodeURIComponent(names.utf8)}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const parsed = parseAnchors(searchParams);
    if (!parsed) return jsonError("Loại kỳ không hợp lệ", 400);
    const { periodType, anchors } = parsed;
    const download = searchParams.get("download");

    // --- Tải Word từ phiên bản đã lưu ---
    if (download && download !== "current") {
      const found = await getReportVersionSnapshot(download);
      if (!found) return jsonError("Không tìm thấy phiên bản báo cáo", 404);
      const buffer = await renderReportDocx(found.snapshot);
      return docxResponse(buffer, docxFileName(found.snapshot, found.info.versionNo));
    }

    // --- Tổng hợp mới (xem trước hoặc tải Word bản hiện tại) ---
    const snapshot = await composeBriefingReport(periodType, anchors);
    if (download === "current") {
      const buffer = await renderReportDocx(snapshot);
      return docxResponse(buffer, docxFileName(snapshot, null));
    }

    const versions = await listReportVersions(periodType, snapshot.meta.periodKey);
    const def = defaultReportMeta(periodType, anchors);
    return NextResponse.json({
      success: true,
      meta: snapshot.meta,
      blocks: snapshot.blocks,
      versions,
      defaults: def,
      canManage: isMetricsAdmin(user),
    });
  } catch (error: any) {
    console.error("GET /api/metrics/report error:", error);
    return jsonError("Lỗi hệ thống khi tổng hợp báo cáo", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!isMetricsAdmin(user))
      return jsonError("Chỉ lãnh đạo hoặc quản trị hệ thống mới lưu được phiên bản báo cáo", 403);

    const body = await req.json().catch(() => null);
    const periodType = (body?.periodType || "WEEK") as ReportPeriodType;
    if (!REPORT_PERIOD_TYPES.includes(periodType)) return jsonError("Loại kỳ không hợp lệ", 400);

    const year = Math.min(2100, Math.max(2000, Number(body?.year) || new Date().getFullYear()));
    const weekNumber = Math.min(53, Math.max(1, Number(body?.week) || 1));
    const month = Math.min(12, Math.max(1, Number(body?.month) || 1));
    const quarter = Math.min(4, Math.max(1, Number(body?.quarter) || 1));
    const anchors: SummaryAnchors = { year, weekNumber, month, quarter };

    const version = await saveReportVersion({
      periodType,
      anchors,
      title: typeof body?.title === "string" ? body.title : null,
      subtitle: typeof body?.subtitle === "string" ? body.subtitle : null,
      meetingStart: typeof body?.meetingStart === "string" ? body.meetingStart : null,
      meetingEnd: typeof body?.meetingEnd === "string" ? body.meetingEnd : null,
      createdById: user.personId,
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "REPORT_VERSION_SAVED",
      resourceType: "BriefingReportVersion",
      resourceId: version.id,
      newData: {
        periodType,
        periodKey: reportPeriodKey(periodType, anchors),
        versionNo: version.versionNo,
        title: version.title,
      },
    });

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    console.error("POST /api/metrics/report error:", error);
    return jsonError("Lỗi hệ thống khi lưu phiên bản báo cáo", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);
    if (!isMetricsAdmin(user))
      return jsonError("Chỉ lãnh đạo hoặc quản trị hệ thống mới xóa được phiên bản báo cáo", 403);

    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId");
    if (!versionId) return jsonError("Thiếu mã phiên bản", 400);

    const existed = await getReportVersionSnapshot(versionId);
    if (!existed) return jsonError("Không tìm thấy phiên bản báo cáo", 404);

    await deleteReportVersion(versionId);

    await recordAuditEvent({
      actorId: user.id,
      action: "REPORT_VERSION_DELETED",
      resourceType: "BriefingReportVersion",
      resourceId: versionId,
      oldData: {
        versionNo: existed.info.versionNo,
        period: existed.snapshot.meta.periodKey,
        title: existed.snapshot.meta.title,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/metrics/report error:", error);
    return jsonError("Lỗi hệ thống khi xóa phiên bản báo cáo", 500);
  }
}

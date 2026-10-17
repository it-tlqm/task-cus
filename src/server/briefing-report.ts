/**
 * Giai đoạn 3 — Tổng hợp báo cáo giao ban từ dữ liệu thật:
 * - Cấu trúc khối (report_blocks) cấu hình trên giao diện: HEADING / METRIC_GROUP / NARRATIVE
 * - Số liệu lấy từ computeMetricSummary (cùng nguồn với trang tổng quan — không tính lại khác đi)
 * - Nhận xét lấy từ briefing_narratives theo kỳ
 * - Bản chụp (snapshot) lưu vào briefing_report_versions: báo cáo đã chốt không đổi khi số liệu nguồn sửa
 */
import { prisma } from "@/server/db";
import { computeMetricSummary, type SummaryAnchors, type MetricSummaryRow } from "@/server/metrics";
import { getIsoWeekBounds } from "@/lib/period-helper";
import { fmtMetric } from "@/lib/metric-format";

export type ReportPeriodType = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

const ROMAN = ["", "I", "II", "III", "IV"];

export const REPORT_PERIOD_TYPES: ReportPeriodType[] = ["WEEK", "MONTH", "QUARTER", "YEAR"];

export function isValidPeriodKey(periodType: string, key: string): boolean {
  if (periodType === "WEEK") return /^\d{4}-W\d{2}$/.test(key);
  if (periodType === "MONTH") return /^\d{4}-\d{2}$/.test(key);
  if (periodType === "QUARTER") return /^\d{4}-Q[1-4]$/.test(key);
  if (periodType === "YEAR") return /^\d{4}$/.test(key);
  return false;
}

export function reportPeriodKey(periodType: ReportPeriodType, a: SummaryAnchors): string {
  if (periodType === "WEEK") return `${a.year}-W${String(a.weekNumber).padStart(2, "0")}`;
  if (periodType === "MONTH") return `${a.year}-${String(a.month).padStart(2, "0")}`;
  if (periodType === "QUARTER") return `${a.year}-Q${a.quarter}`;
  return String(a.year);
}

export interface ReportTableColumn {
  key: "week" | "month" | "quarter" | "year";
  label: string;
}

export interface ReportTableRow {
  name: string;
  level: number; // 0 = chỉ tiêu, 1 = phân loại con
  values: string[];
  target: string;
  percent: string;
  note: string;
}

export interface ReportBlockPayload {
  id: string;
  code: string;
  kind: string; // HEADING | METRIC_GROUP | NARRATIVE
  title: string;
  groupCode: string | null;
  columns: ReportTableColumn[];
  rows: ReportTableRow[];
  content: string | null;
}

export interface ReportMeta {
  periodType: ReportPeriodType;
  periodKey: string;
  periodLabel: string;
  startDate: string; // dd/mm/yyyy
  endDate: string; // dd/mm/yyyy
  title: string;
  subtitle: string;
  meetingStart: string;
  meetingEnd: string;
}

export interface ReportSnapshot {
  meta: ReportMeta;
  blocks: ReportBlockPayload[];
}

export interface ReportVersionSummary {
  id: string;
  versionNo: number;
  title: string;
  subtitle: string | null;
  meetingStart: string | null;
  meetingEnd: string | null;
  createdAt: string;
  createdByName: string | null;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Khoảng ngày của kỳ (chuỗi hiển thị dd/mm/yyyy) */
function periodBounds(periodType: ReportPeriodType, a: SummaryAnchors): { start: string; end: string } {
  if (periodType === "WEEK") {
    const w = getIsoWeekBounds(a.year, a.weekNumber);
    return { start: w.startDateStr, end: w.endDateStr };
  }
  if (periodType === "MONTH") {
    return {
      start: `01/${pad2(a.month)}/${a.year}`,
      end: `${pad2(lastDayOfMonth(a.year, a.month))}/${pad2(a.month)}/${a.year}`,
    };
  }
  if (periodType === "QUARTER") {
    const m1 = (a.quarter - 1) * 3 + 1;
    const m3 = m1 + 2;
    return { start: `01/${pad2(m1)}/${a.year}`, end: `${pad2(lastDayOfMonth(a.year, m3))}/${pad2(m3)}/${a.year}` };
  }
  return { start: `01/01/${a.year}`, end: `31/12/${a.year}` };
}

export function reportPeriodLabel(periodType: ReportPeriodType, a: SummaryAnchors): string {
  if (periodType === "WEEK") return `Tuần ${a.weekNumber}/${a.year}`;
  if (periodType === "MONTH") return `Tháng ${a.month}/${a.year}`;
  if (periodType === "QUARTER") return `Quý ${ROMAN[a.quarter]}/${a.year}`;
  return `Năm ${a.year}`;
}

/** Tiêu đề mặc định theo kỳ (người dùng sửa được trên giao diện trước khi lưu/xuất) */
export function defaultReportMeta(
  periodType: ReportPeriodType,
  a: SummaryAnchors
): { title: string; subtitle: string; startDate: string; endDate: string; periodLabel: string } {
  const b = periodBounds(periodType, a);
  const range = `(${b.start} – ${b.end})`;
  let mission: string;
  if (periodType === "WEEK") mission = `tuần ${a.weekNumber}`;
  else if (periodType === "MONTH") mission = `tháng ${a.month}/${a.year}`;
  else if (periodType === "QUARTER") mission = `quý ${ROMAN[a.quarter]}/${a.year}`;
  else mission = `năm ${a.year}`;
  return {
    title: "TỔNG HỢP SỐ LIỆU GIAO BAN",
    subtitle: `Đánh giá kết quả thực hiện nhiệm vụ ${mission} ${range}`,
    startDate: b.start,
    endDate: b.end,
    periodLabel: reportPeriodLabel(periodType, a),
  };
}

/** Các cột số liệu hiển thị theo loại kỳ báo cáo */
export function reportColumns(periodType: ReportPeriodType, a: SummaryAnchors): ReportTableColumn[] {
  const week: ReportTableColumn = { key: "week", label: `Tuần ${a.weekNumber}` };
  const month: ReportTableColumn = { key: "month", label: `Lũy kế Tháng ${a.month}` };
  const quarter: ReportTableColumn = { key: "quarter", label: `Lũy kế Quý ${ROMAN[a.quarter]}` };
  const year: ReportTableColumn = { key: "year", label: `Lũy kế Năm ${a.year}` };
  if (periodType === "WEEK") return [week, month, quarter, year];
  if (periodType === "MONTH") return [{ ...month, label: `Tháng ${a.month}` }, quarter, year];
  if (periodType === "QUARTER") return [{ ...quarter, label: `Quý ${ROMAN[a.quarter]}` }, year];
  return [{ ...year, label: `Năm ${a.year}` }];
}

function fmtPercent(v: number): string {
  return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;
}

/** Ô giá trị: null = chưa nhập (không hiển thị 0 giả) */
function cellValue(v: number | null, m: MetricSummaryRow): string {
  if (v === null) return "…";
  return fmtMetric(v, m);
}

function shortDay(iso: string): string {
  // iso = yyyy-mm-dd
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function targetCell(m: MetricSummaryRow): string {
  if (!m.targets.length) return "…";
  return m.targets.map((t) => `${t.label}: ${fmtMetric(t.targetValue, m)}`).join("; ");
}

function percentCell(m: MetricSummaryRow): string {
  const withPct = m.targets.filter((t) => t.percent !== null);
  if (!withPct.length) return "…";
  if (withPct.length === 1) return fmtPercent(withPct[0].percent as number);
  return withPct.map((t) => `${t.label} ${fmtPercent(t.percent as number)}`).join("; ");
}

function noteCell(m: MetricSummaryRow): string {
  const parts: string[] = [];
  if (m.missingDates.length) parts.push(`Chưa nhập ngày: ${m.missingDates.map(shortDay).join(", ")}`);
  if (m.note) parts.push(m.note);
  return parts.join("; ");
}

function metricToRows(m: MetricSummaryRow, columns: ReportTableColumn[]): ReportTableRow[] {
  const rows: ReportTableRow[] = [
    {
      name: m.name,
      level: 0,
      values: columns.map((c) => cellValue(m.cols[c.key], m)),
      target: targetCell(m),
      percent: percentCell(m),
      note: noteCell(m),
    },
  ];
  for (const cc of m.classCols) {
    rows.push({
      name: cc.label,
      level: 1,
      values: columns.map((c) => cellValue(cc.cols[c.key], m)),
      target: "…",
      percent: "…",
      note: "",
    });
  }
  return rows;
}

/** Tổng hợp toàn bộ báo cáo hiện tại (theo dữ liệu thật) + cấu trúc khối đang bật */
export async function composeBriefingReport(
  periodType: ReportPeriodType,
  anchors: SummaryAnchors
): Promise<ReportSnapshot> {
  const periodKey = reportPeriodKey(periodType, anchors);
  const def = defaultReportMeta(periodType, anchors);
  const columns = reportColumns(periodType, anchors);

  const [blockDefs, narratives, summary] = await Promise.all([
    prisma.reportBlock.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, code: true, kind: true, title: true, groupId: true, sectionId: true },
    }),
    prisma.briefingNarrative.findMany({ where: { periodType, periodKey } }),
    computeMetricSummary(anchors, "full"),
  ]);

  const groupById = new Map(summary.groups.map((g) => [g.id, g]));
  const narrativeBySection = new Map(narratives.map((n) => [n.sectionId, n.content]));

  const blocks: ReportBlockPayload[] = [];
  for (const b of blockDefs) {
    if (b.kind === "METRIC_GROUP") {
      if (!b.groupId) continue; // khối thiếu cấu hình — bỏ qua an toàn
      const g = groupById.get(b.groupId);
      const rows = g ? g.metrics.flatMap((m) => metricToRows(m, columns)) : [];
      blocks.push({
        id: b.id,
        code: b.code,
        kind: b.kind,
        title: b.title,
        groupCode: g?.code ?? null,
        columns,
        rows,
        content: null,
      });
    } else if (b.kind === "NARRATIVE") {
      if (!b.sectionId) continue;
      blocks.push({
        id: b.id,
        code: b.code,
        kind: b.kind,
        title: b.title,
        groupCode: null,
        columns: [],
        rows: [],
        content: narrativeBySection.get(b.sectionId) ?? "",
      });
    } else {
      if (!b.title) continue;
      blocks.push({
        id: b.id,
        code: b.code,
        kind: "HEADING",
        title: b.title,
        groupCode: null,
        columns: [],
        rows: [],
        content: null,
      });
    }
  }

  return {
    meta: {
      periodType,
      periodKey,
      periodLabel: def.periodLabel,
      startDate: def.startDate,
      endDate: def.endDate,
      title: def.title,
      subtitle: def.subtitle,
      meetingStart: "",
      meetingEnd: "",
    },
    blocks,
  };
}

/** Danh sách phiên bản đã lưu của một kỳ (mới nhất trước) */
export async function listReportVersions(periodType: string, periodKey: string): Promise<ReportVersionSummary[]> {
  const versions = await prisma.briefingReportVersion.findMany({
    where: { periodType, periodKey },
    orderBy: { versionNo: "desc" },
    take: 50,
  });
  const personIds = Array.from(new Set(versions.map((v) => v.createdById).filter(Boolean))) as string[];
  const persons = personIds.length
    ? await prisma.person.findMany({ where: { id: { in: personIds } }, select: { id: true, fullName: true } })
    : [];
  const nameById = new Map(persons.map((p) => [p.id, p.fullName]));
  return versions.map((v) => ({
    id: v.id,
    versionNo: v.versionNo,
    title: v.title,
    subtitle: v.subtitle,
    meetingStart: v.meetingStart,
    meetingEnd: v.meetingEnd,
    createdAt: v.createdAt.toISOString(),
    createdByName: v.createdById ? nameById.get(v.createdById) || null : null,
  }));
}

/**
 * Lưu phiên bản: CHỤP LẠI số liệu hiện tại ở server (không tin số liệu do client gửi lên),
 * chỉ nhận từ client phần văn bản do người dùng sửa (tiêu đề, phụ đề, thời gian họp).
 */
export async function saveReportVersion(args: {
  periodType: ReportPeriodType;
  anchors: SummaryAnchors;
  title?: string | null;
  subtitle?: string | null;
  meetingStart?: string | null;
  meetingEnd?: string | null;
  createdById: string | null;
}): Promise<ReportVersionSummary> {
  const snapshot = await composeBriefingReport(args.periodType, args.anchors);

  const clean = (s: string | null | undefined, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
  const title = clean(args.title, 300) || snapshot.meta.title;
  const subtitle = clean(args.subtitle, 500) || snapshot.meta.subtitle;
  snapshot.meta.title = title;
  snapshot.meta.subtitle = subtitle;
  snapshot.meta.meetingStart = clean(args.meetingStart, 200);
  snapshot.meta.meetingEnd = clean(args.meetingEnd, 200);

  const periodType = args.periodType;
  const periodKey = snapshot.meta.periodKey;

  let created: { id: string; versionNo: number; createdAt: Date } | null = null;
  for (let attempt = 0; attempt < 2 && !created; attempt++) {
    const agg = await prisma.briefingReportVersion.aggregate({
      where: { periodType, periodKey },
      _max: { versionNo: true },
    });
    const versionNo = (agg._max.versionNo ?? 0) + 1 + attempt;
    try {
      created = await prisma.briefingReportVersion.create({
        data: {
          periodType,
          periodKey,
          versionNo,
          title,
          subtitle,
          meetingStart: snapshot.meta.meetingStart || null,
          meetingEnd: snapshot.meta.meetingEnd || null,
          contentJson: snapshot as unknown as object,
          createdById: args.createdById,
        },
        select: { id: true, versionNo: true, createdAt: true },
      });
    } catch (e: any) {
      if (e?.code === "P2002" && attempt === 0) continue; // đua số phiên bản — thử lại
      throw e;
    }
  }
  if (!created) throw new Error("Không lưu được phiên bản báo cáo");

  let createdByName: string | null = null;
  if (args.createdById) {
    const p = await prisma.person.findUnique({ where: { id: args.createdById }, select: { fullName: true } });
    createdByName = p?.fullName ?? null;
  }

  return {
    id: created.id,
    versionNo: created.versionNo,
    title,
    subtitle,
    meetingStart: snapshot.meta.meetingStart || null,
    meetingEnd: snapshot.meta.meetingEnd || null,
    createdAt: created.createdAt.toISOString(),
    createdByName,
  };
}

export async function getReportVersionSnapshot(
  versionId: string
): Promise<{ snapshot: ReportSnapshot; info: { id: string; versionNo: number } } | null> {
  const v = await prisma.briefingReportVersion.findUnique({ where: { id: versionId } });
  if (!v) return null;
  return { snapshot: v.contentJson as unknown as ReportSnapshot, info: { id: v.id, versionNo: v.versionNo } };
}

export async function deleteReportVersion(versionId: string): Promise<boolean> {
  const v = await prisma.briefingReportVersion.findUnique({ where: { id: versionId } });
  if (!v) return false;
  await prisma.briefingReportVersion.delete({ where: { id: versionId } });
  return true;
}

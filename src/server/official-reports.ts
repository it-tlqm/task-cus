/**
 * Xuất biểu mẫu chính thức (2C, 2D, 2E, Công văn) từ file mẫu thật của Hải quan.
 *
 * - File mẫu nằm trong `public/templates/` và được giữ nguyên định dạng gốc.
 * - Excel: dùng ExcelJS đọc/ghi trực tiếp trên mẫu (không dựng lại bảng).
 * - Word: dùng docxtemplater điền các thẻ `{...}` đã gắn trong mẫu.
 *
 * Nguyên tắc dữ liệu: chỉ lấy dữ liệu thật (bỏ bản ghi DEMO); thiếu dữ liệu thì
 * để dấu "…" chứ không tự suy ra số 0.
 */
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { prisma } from "./db";
import { pickPrimaryAssignment } from "./person-assignment";

const TEMPLATE_DIR = path.join(process.cwd(), "public", "templates");
const ROMAN = ["I", "II", "III", "IV"] as const;

export type OfficialReportCode = "2c" | "2d" | "2e" | "cong-van";

export interface OfficialReportParams {
  year: number;
  quarter: number;
  /** Số văn bản (để trống nếu chưa cấp số). */
  documentNo?: string;
  /** Mẫu 2D có thể xuất theo tháng hoặc quý; mặc định quý. */
  periodType?: "QUARTER" | "MONTH";
  /** Số tháng (1-12) hoặc số quý (1-4) tương ứng periodType. */
  number?: number;
}

function templatePath(name: string): string {
  const full = path.join(TEMPLATE_DIR, name);
  if (!fs.existsSync(full)) throw new Error(`Thiếu file mẫu: public/templates/${name}`);
  return full;
}

function quarterLabel(quarter: number, year: number): string {
  return `Quý ${ROMAN[quarter - 1] || quarter} năm ${year}`;
}

function quarterLabelUpper(quarter: number, year: number): string {
  return `QUÝ ${ROMAN[quarter - 1] || quarter}/${year}`;
}

function quarterRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1)),
    end: new Date(Date.UTC(year, startMonth + 3, 1)),
  };
}

function toDateKey(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function fmtDate(value: Date | null | undefined): string {
  const key = toDateKey(value);
  if (!key) return "…";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNumber(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "…";
  return value.toLocaleString("vi-VN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function renderDocx(templateName: string, data: Record<string, unknown>): Buffer {
  const zip = new PizZip(fs.readFileSync(templatePath(templateName)));
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });
  doc.render(data);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

/* ------------------------------------------------------------------ */
/* Dữ liệu dùng chung                                                   */
/* ------------------------------------------------------------------ */

interface TaskStats {
  assignedCount: number;
  completedCount: number;
  beforeDueCount: number;
  onTimeCount: number;
  lateCount: number;
  incompleteCount: number;
  lateTaskDetails: string;
  incompleteTaskDetails: string;
}

async function loadTaskStats(year: number, quarter: number): Promise<TaskStats> {
  const { start, end } = quarterRange(year, quarter);
  const select = {
    code: true,
    title: true,
    status: true,
    currentDeadline: true,
    completedDate: true,
  } as const;

  // Báo cáo chính thức không tính việc demo/UAT/kiểm thử nội bộ.
  const EXCLUDED = /\[DEMO|\[UAT|DEMO-UI|YC38-LOCK|TEST/i;
  const isRealTask = (task: { code: string; title: string }) =>
    !EXCLUDED.test(`${task.code} ${task.title}`);

  const [assignedRaw, completedRaw] = await Promise.all([
    prisma.task.findMany({
      where: {
        currentDeadline: { gte: start, lt: end },
        status: { not: "CANCELED" },
      },
      select,
      orderBy: { currentDeadline: "asc" },
    }),
    prisma.task.findMany({
      where: {
        status: "DONE",
        completedDate: { gte: start, lt: end },
      },
      select,
      orderBy: { completedDate: "asc" },
    }),
  ]);
  const assignedTasks = assignedRaw.filter(isRealTask);
  const completedTasks = completedRaw.filter(isRealTask);

  let beforeDueCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  const lateLines: string[] = [];

  for (const task of completedTasks) {
    const deadline = toDateKey(task.currentDeadline);
    const done = toDateKey(task.completedDate);
    if (!deadline || !done) continue;
    if (done < deadline) beforeDueCount += 1;
    else if (done === deadline) onTimeCount += 1;
    else {
      lateCount += 1;
      const days = Math.max(
        1,
        Math.round(
          (new Date(`${done}T00:00:00Z`).getTime() - new Date(`${deadline}T00:00:00Z`).getTime()) /
            86400000
        )
      );
      lateLines.push(
        `- ${task.code} — ${task.title}: hạn ${fmtDate(task.currentDeadline)}, hoàn thành ${fmtDate(task.completedDate)}, chậm ${days} ngày.`
      );
    }
  }

  const incomplete = assignedTasks.filter(
    (task) => task.status !== "DONE" && task.status !== "CANCELED"
  );

  const MAX_DETAILS = 15;
  const lateDetails = lateLines.length
    ? lateLines.slice(0, MAX_DETAILS).join("\n") +
      (lateLines.length > MAX_DETAILS
        ? `\n- … và ${lateLines.length - MAX_DETAILS} nhiệm vụ chậm khác.`
        : "")
    : "Không có nhiệm vụ chậm tiến độ.";

  const incompleteLines = incomplete.map(
    (task) =>
      `- ${task.code} — ${task.title}: hạn ${fmtDate(task.currentDeadline)}, trạng thái: ${
        task.status === "IN_PROGRESS"
          ? "đang thực hiện"
          : task.status === "WAITING_REVIEW"
            ? "chờ xác nhận"
            : "chưa thực hiện"
      }.`
  );
  const incompleteDetails = incompleteLines.length
    ? incompleteLines.slice(0, MAX_DETAILS).join("\n") +
      (incompleteLines.length > MAX_DETAILS
        ? `\n- … và ${incompleteLines.length - MAX_DETAILS} nhiệm vụ khác.`
        : "")
    : "Không có nhiệm vụ chưa hoàn thành.";

  return {
    assignedCount: assignedTasks.length,
    completedCount: completedTasks.length,
    beforeDueCount,
    onTimeCount,
    lateCount,
    incompleteCount: incomplete.length,
    lateTaskDetails: lateDetails,
    incompleteTaskDetails: incompleteDetails,
  };
}

interface TaxSnapshot {
  quarterValue: number | null;
  ytdValue: number | null;
  quarterTarget: number | null;
  btcTarget: number | null;
  ubndTarget: number | null;
  cucTarget: number | null;
  chiCucTarget: number | null;
  phanDauTarget: number | null;
}

async function loadTaxSnapshot(year: number, quarter: number): Promise<TaxSnapshot> {
  const metric = await prisma.metricDefinition.findUnique({
    where: { code: "THU_NSNN" },
    select: { id: true },
  });
  if (!metric) {
    return {
      quarterValue: null,
      ytdValue: null,
      quarterTarget: null,
      btcTarget: null,
      ubndTarget: null,
      cucTarget: null,
      chiCucTarget: null,
      phanDauTarget: null,
    };
  }

  const { start, end } = quarterRange(year, quarter);
  const yearStart = new Date(Date.UTC(year, 0, 1));

  const [qAgg, yAgg, targets] = await Promise.all([
    prisma.metricDailyEntry.aggregate({
      _sum: { valueNumeric: true },
      where: {
        metricId: metric.id,
        entryDate: { gte: start, lt: end },
        dataSource: { not: "DEMO" },
      },
    }),
    prisma.metricDailyEntry.aggregate({
      _sum: { valueNumeric: true },
      where: {
        metricId: metric.id,
        entryDate: { gte: yearStart, lt: end },
        dataSource: { not: "DEMO" },
      },
    }),
    prisma.metricPlanTarget.findMany({
      where: { metricId: metric.id, year, dataSource: { not: "DEMO" } },
      select: { label: true, periodType: true, periodNo: true, valueNumeric: true },
    }),
  ]);

  const quarterTargetRow = targets.find(
    (t) => t.periodType === "QUARTER" && t.periodNo === quarter
  );
  const yearTargets = targets.filter((t) => t.periodType === "YEAR");
  const findYearTarget = (re: RegExp) => yearTargets.find((t) => re.test(t.label));

  const btc = findYearTarget(/bộ tài chính|BTC/i);
  const ubnd = findYearTarget(/UBND|tỉnh/i);
  const chiCuc = findYearTarget(/chi cục/i);
  const cuc = findYearTarget(/cục hải quan|cục HQ/i);
  const phanDau = findYearTarget(/phấn đấu/i);
  const fallback = yearTargets.length === 1 ? yearTargets[0] : null;

  const num = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    quarterValue: num(qAgg._sum.valueNumeric),
    ytdValue: num(yAgg._sum.valueNumeric),
    quarterTarget: num(quarterTargetRow?.valueNumeric),
    btcTarget: num(btc?.valueNumeric),
    ubndTarget: num(ubnd?.valueNumeric),
    cucTarget: num(cuc?.valueNumeric),
    chiCucTarget: num(chiCuc?.valueNumeric ?? fallback?.valueNumeric),
    phanDauTarget: num(phanDau?.valueNumeric),
  };
}

function billion(value: number | null): number | null {
  return value === null ? null : value / 1_000_000_000;
}

function percent(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target === 0) return null;
  return (actual / target) * 100;
}

/* ------------------------------------------------------------------ */
/* Mẫu 2C — Báo cáo kết quả các lĩnh vực công tác của đơn vị (Word)      */
/* ------------------------------------------------------------------ */

export async function buildOfficial2C(params: OfficialReportParams): Promise<Buffer> {
  const { year, quarter } = params;
  const today = new Date();
  const [tasks, tax] = await Promise.all([
    loadTaskStats(year, quarter),
    loadTaxSnapshot(year, quarter),
  ]);

  const documentNo = params.documentNo?.trim() || "";
  const taxQuarter = billion(tax.quarterValue);
  const taxYtd = billion(tax.ytdValue);
  const btcTarget = billion(tax.btcTarget);
  const ubndTarget = billion(tax.ubndTarget);

  return renderDocx("bao-cao-2c-template.docx", {
    quarterLabel: quarterLabel(quarter, year),
    attachmentNo: documentNo || "…",
    attachmentDay: String(today.getDate()).padStart(2, "0"),
    attachmentMonth: String(today.getMonth() + 1).padStart(2, "0"),
    attachmentYear: String(today.getFullYear()),

    assignedCount: tasks.assignedCount,
    completedCount: tasks.completedCount,
    beforeDueCount: tasks.beforeDueCount,
    onTimeCount: tasks.onTimeCount,
    lateCount: tasks.lateCount,
    incompleteCount: tasks.incompleteCount,
    lateTaskDetails: tasks.lateTaskDetails,
    incompleteTaskDetails: tasks.incompleteTaskDetails,

    docTotal: "…",
    docOnTime: "…",
    docLate: "…",
    docLateDetails: "",
    issueNote: "Không phát sinh",
    disbursementNote: "…",
    inspectionNote: "…",

    taxQuarter: fmtNumber(taxQuarter),
    taxYtd: fmtNumber(taxYtd),
    taxPctBtc: fmtNumber(percent(tax.ytdValue, tax.btcTarget)),
    taxTargetBtc: fmtNumber(btcTarget),
    taxPctUbnd: fmtNumber(percent(tax.ytdValue, tax.ubndTarget)),
    taxTargetUbnd: fmtNumber(ubndTarget),
    taxYoyText: "…",
  });
}

/* ------------------------------------------------------------------ */
/* Mẫu 2D — Bảng tổng hợp kết quả đánh giá, xếp loại (Excel)             */
/* ------------------------------------------------------------------ */

interface AssessmentRow {
  personId: string;
  fullName: string;
  positionTitle: string;
  roleRank: number;
  totalScore: number | null;
  grade: string;
  selfGrade: string;
  monthlyScore: number | null;
}

const GRADE_SHORT: Record<string, string> = {
  "Hoàn thành xuất sắc": "HTXS",
  "Hoàn thành tốt": "HTT",
  "Hoàn thành": "HT",
  "Không hoàn thành": "KHT",
};

function gradeShort(value: string | null | undefined): string {
  if (!value) return "";
  const key = Object.keys(GRADE_SHORT).find((k) => value.startsWith(k));
  return key ? GRADE_SHORT[key] : value;
}

function roleRankOf(roleAtPeriod: string | null | undefined): number {
  if (roleAtPeriod === "UNIT_LEADER") return 0;
  if (roleAtPeriod === "DEPARTMENT_LEADER") return 1;
  return 2;
}

async function loadAssessmentRows(
  year: number,
  periodType: "MONTH" | "QUARTER",
  number: number
): Promise<AssessmentRow[]> {
  const assessments = await prisma.evaluationAssessment.findMany({
    where: { periodType, periodYear: year, periodNumber: number },
    orderBy: { createdAt: "asc" },
  });
  if (assessments.length === 0) return [];

  const personIds = assessments.map((a) => a.subjectPersonId);
  const people = await prisma.person.findMany({
    where: { id: { in: personIds } },
    select: {
      id: true,
      fullName: true,
      assignments: {
        where: { isPrimary: true },
        select: {
          isPrimary: true,
          effectiveFrom: true,
          effectiveTo: true,
          position: { select: { title: true } },
          unit: { select: { name: true } },
        },
      },
    },
  });
  const personMap = new Map(people.map((p) => [p.id, p]));

  const lastMonth = periodType === "QUARTER" ? number * 3 : number;
  const monthly = await prisma.evaluationAssessment.findMany({
    where: {
      periodType: "MONTH",
      periodYear: year,
      periodNumber: lastMonth,
      subjectPersonId: { in: personIds },
    },
    select: { subjectPersonId: true, commonCriteriaScore: true, taskResultScore: true },
  });
  const monthlyMap = new Map(monthly.map((m) => [m.subjectPersonId, m]));

  const rows = assessments.map((a) => {
    const person = personMap.get(a.subjectPersonId);
    const assignment = pickPrimaryAssignment(person?.assignments || []);
    const total =
      a.commonCriteriaScore !== null && a.taskResultScore !== null
        ? a.commonCriteriaScore + a.taskResultScore
        : null;
    const month = monthlyMap.get(a.subjectPersonId);
    const monthTotal =
      month && month.commonCriteriaScore !== null && month.taskResultScore !== null
        ? month.commonCriteriaScore + month.taskResultScore
        : null;
    const grade = a.finalGrade || a.selfGradeChoice || a.selfGradeSuggestion || "";
    return {
      personId: a.subjectPersonId,
      fullName: person?.fullName || a.subjectPersonId,
      positionTitle: assignment?.position?.title || "",
      roleRank: roleRankOf(a.roleAtPeriod),
      totalScore: total,
      grade,
      selfGrade: gradeShort(a.selfGradeChoice),
      monthlyScore: monthTotal,
    };
  });

  rows.sort((a, b) => {
    if (a.roleRank !== b.roleRank) return a.roleRank - b.roleRank;
    return a.fullName.localeCompare(b.fullName, "vi");
  });
  return rows;
}

export async function buildOfficial2D(params: OfficialReportParams): Promise<Buffer> {
  const { year, quarter } = params;
  const periodType = params.periodType ?? "QUARTER";
  const number = params.number ?? quarter;
  const rows = await loadAssessmentRows(year, periodType, number);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath("tong-hop-2d-template.xlsx"));
  const ws = wb.worksheets[0];

  const documentNo = params.documentNo?.trim() || "";
  const today = new Date();
  const titleLabel =
    periodType === "QUARTER"
      ? quarterLabelUpper(number, year)
      : `THÁNG ${number}/${year}`;
  ws.getCell("A5").value = `BẢNG TỔNG HỢP KẾT QUẢ ĐÁNH GIÁ, XẾP LOẠI ${titleLabel}`;
  ws.getCell("G8").value = periodType === "QUARTER" ? `T${number * 3}` : `T${number}`;
  ws.getCell("A6").value =
    `(Ban hành kèm theo công văn số: ${documentNo || "……"} /HQTL ngày ${String(today.getDate()).padStart(2, "0")} tháng ${String(today.getMonth() + 1).padStart(2, "0")} năm ${today.getFullYear()} của Hải quan CKQT Tà Lùng)`;

  const DATA_START = 10;
  const DATA_END = 69; // mẫu đã mở rộng sẵn 60 dòng
  for (let r = DATA_START; r <= DATA_END; r++) {
    for (let c = 1; c <= 8; c++) ws.getCell(r, c).value = null;
  }
  if (rows.length > DATA_END - DATA_START + 1) {
    throw new Error(
      `Mẫu 2D chỉ chứa tối đa ${DATA_END - DATA_START + 1} người, hiện có ${rows.length}. Cần mở rộng mẫu.`
    );
  }

  rows.forEach((row, index) => {
    const r = DATA_START + index;
    ws.getCell(r, 1).value = index + 1;
    ws.getCell(r, 2).value = row.fullName;
    ws.getCell(r, 3).value = row.positionTitle;
    ws.getCell(r, 4).value = row.totalScore;
    ws.getCell(r, 5).value = row.grade || null;
    ws.getCell(r, 6).value = null;
    ws.getCell(r, 7).value = row.monthlyScore;
    ws.getCell(r, 8).value = row.selfGrade || null;
    ws.getCell(r, 4).numFmt = "#,##0.0";
    ws.getCell(r, 7).numFmt = "#,##0.0";
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ------------------------------------------------------------------ */
/* Mẫu 2E — Bảng kết quả thực hiện các chỉ tiêu kế hoạch (Excel)         */
/* ------------------------------------------------------------------ */

export async function buildOfficial2E(params: OfficialReportParams): Promise<Buffer> {
  const { year, quarter } = params;
  const tax = await loadTaxSnapshot(year, quarter);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath("chi-tieu-2e-template.xlsx"));
  const ws = wb.worksheets[0];

  const documentNo = params.documentNo?.trim() || "";
  const today = new Date();
  ws.getCell("A3").value =
    `\nBẢNG KẾT QUẢ THỰC HIỆN CÁC CHỈ TIÊU KẾ HOẠCH CÁC LĨNH VỰC CÔNG TÁC TRỌNG TÂM\n` +
    `(Kèm theo công văn số ${documentNo || "……"}/HQTL ngày ${String(today.getDate()).padStart(2, "0")} tháng ${String(today.getMonth() + 1).padStart(2, "0")} năm ${today.getFullYear()} của Hải quan cửa khẩu quốc tế Tà Lùng)\n`;

  // Xoá số liệu cũ của mẫu (giữ nguyên nhãn, đơn vị tính, định dạng).
  for (let r = 8; r <= 24; r++) {
    for (let c = 4; c <= 16; c++) ws.getCell(r, c).value = null;
  }

  // Dòng 12 — Số thu NSNN
  const q = billion(tax.quarterValue);
  const ytd = billion(tax.ytdValue);
  const qTarget = billion(tax.quarterTarget);
  const btc = billion(tax.btcTarget);
  const cuc = billion(tax.cucTarget);
  const chiCuc = billion(tax.chiCucTarget);
  const phanDau = billion(tax.phanDauTarget);

  const setNum = (cell: string, value: number | null) => {
    ws.getCell(cell).value = value;
  };
  setNum("D12", qTarget);
  setNum("E12", q);
  setNum("F12", q !== null && qTarget ? q / qTarget : null);
  setNum("G12", btc);
  setNum("H12", cuc);
  setNum("I12", chiCuc);
  setNum("J12", phanDau);
  setNum("K12", ytd);
  setNum("L12", ytd !== null && btc ? ytd / btc : null);
  setNum("M12", ytd !== null && cuc ? ytd / cuc : null);
  setNum("N12", ytd !== null && chiCuc ? ytd / chiCuc : null);
  setNum("O12", ytd !== null && phanDau ? ytd / phanDau : null);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/* ------------------------------------------------------------------ */
/* Công văn (Word)                                                     */
/* ------------------------------------------------------------------ */

export async function buildOfficialCongVan(params: OfficialReportParams): Promise<Buffer> {
  const { year, quarter } = params;
  const today = new Date();

  const leaderGrant = await prisma.roleGrant.findFirst({
    where: { role: { code: "UNIT_LEADER" }, account: { status: "ACTIVE" } },
    select: {
      account: { select: { person: { select: { fullName: true } } } },
    },
  });

  let signerName = leaderGrant?.account?.person?.fullName || "";
  let signerTitle = "ĐỘI TRƯỞNG";
  if (!signerName) {
    const leader = await prisma.person.findFirst({
      where: {
        status: "ACTIVE",
        assignments: {
          some: {
            isPrimary: true,
            position: { title: { contains: "trưởng", mode: "insensitive" } },
          },
        },
      },
      select: {
        fullName: true,
        assignments: {
          where: { isPrimary: true },
          select: { position: { select: { title: true } } },
          take: 1,
        },
      },
    });
    signerName = leader?.fullName || "…";
    signerTitle = leader?.assignments?.[0]?.position?.title || "ĐỘI TRƯỞNG";
  }

  return renderDocx("cong-van-template.docx", {
    documentNo: params.documentNo?.trim() || "……",
    quarterLabel: quarterLabel(quarter, year),
    issueDay: String(today.getDate()).padStart(2, "0"),
    issueMonth: String(today.getMonth() + 1).padStart(2, "0"),
    issueYear: String(today.getFullYear()),
    signerTitle: signerTitle.toUpperCase(),
    signerName,
  });
}

/* ------------------------------------------------------------------ */
/* Điều phối                                                           */
/* ------------------------------------------------------------------ */

export async function buildOfficialReport(
  code: OfficialReportCode,
  params: OfficialReportParams
): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
  const { year, quarter } = params;
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Năm không hợp lệ");
  }
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
    throw new Error("Quý không hợp lệ (1-4)");
  }
  const periodType = params.periodType ?? "QUARTER";
  const number = params.number ?? quarter;
  if (periodType === "MONTH" && (!Number.isInteger(number) || number < 1 || number > 12)) {
    throw new Error("Tháng không hợp lệ (1-12)");
  }
  if (periodType === "QUARTER" && (!Number.isInteger(number) || number < 1 || number > 4)) {
    throw new Error("Quý không hợp lệ (1-4)");
  }

  const suffix = periodType === "MONTH" ? `T${number}-${year}` : `Q${number}-${year}`;
  switch (code) {
    case "2c":
      return {
        buffer: await buildOfficial2C(params),
        filename: `Mau-2C-BaoCao-LinhVuc-${suffix}.docx`,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    case "2d":
      return {
        buffer: await buildOfficial2D(params),
        filename: `Mau-2D-TongHop-DanhGia-${suffix}.xlsx`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    case "2e":
      return {
        buffer: await buildOfficial2E(params),
        filename: `Mau-2E-ChiTieu-KeHoach-${suffix}.xlsx`,
        contentType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      };
    case "cong-van":
      return {
        buffer: await buildOfficialCongVan(params),
        filename: `Cong-van-danh-gia-xep-loai-${suffix}.docx`,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    default:
      throw new Error("Mẫu báo cáo không hợp lệ");
  }
}

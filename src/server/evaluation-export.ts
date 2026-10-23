/**
 * YC-34 — Sinh biểu mẫu 01A / 01B (theo THÁNG) và 02A / 02B (theo QUÝ).
 *
 * Bám sát bố cục workbook gốc (`Dữ liệu.zip`):
 *   01A → sheet "Biểu 01A (CC)"        (công chức không giữ chức vụ lãnh đạo)
 *   01B → sheet "01B tháng 9"          (công chức giữ chức vụ lãnh đạo)
 *   02A → sheet "Biểu 02A Quý III (CC)"
 *   02B → sheet "02B Quý III(LĐ)"
 *
 * NGUYÊN TẮC:
 * - Ô nào CHƯA có căn cứ → để TRỐNG và gắn nhãn "DỰ THẢO — CHƯA ĐỦ CĂN CỨ".
 *   KHÔNG ghi điểm giả, KHÔNG tự đặt xếp loại.
 * - Phần nhận xét của cấp có thẩm quyền, chữ ký để TRỐNG (ghi tay hoặc nhập sau).
 * - Cột/cell bám theo mẫu gốc; vùng in đặt khổ A4.
 */

import ExcelJS from "exceljs";
import { computeBang1, type ScoreResult } from "./scoring/bang1";
import { computeForm01A } from "./scoring/bang1";
import type { ApprovalQualityExportRow } from "./approval-quality";

export type EvaluationTemplate = "01A" | "01B" | "02A" | "02B";

export interface ExportTaskRow {
  /** id bản ghi kết quả tháng (khớp với id dòng của engine) — để ghép dữ liệu theo id. */
  resultId: string;
  title: string;
  dueDate: string | null;
  product: string | null;
  factor: number | null;
  assignedQty: number | null;
  completedQty: number | null;
  completedDate: string | null;
  lateDays: number;
  reworkCount: number;
}

export interface ExportEvaluation {
  fullName: string;
  positionTitle?: string | null;
  unitName?: string | null;
  /** Điểm tiêu chí chung (tối đa 30). */
  commonCriteriaScore: number | null;
  /** Gợi ý hệ thống (chưa có quy tắc → null). */
  commonCriteriaSuggested: number | null;
  /** Mức xếp loại cá nhân đề xuất. */
  selfGradeChoice: string | null;
  /** Gợi ý hệ thống về mức xếp loại (chưa có ngưỡng → null). */
  selfGradeSuggestion: string | null;
  strengths: string | null;
  weaknesses: string | null;
  reviewerComment: string | null;
  evaluationStatus: string;
}

export interface ExportLeaderInput {
  /** a/b/c bình quân theo quan hệ phụ trách (YC-35). */
  a: number | null;
  b: number | null;
  c: number | null;
  /** d, đ, e — do lãnh đạo tự nhập (mức đơn vị). */
  d: number | null;
  dd: number | null;
  e: number | null;
  /** Lý do chưa đủ căn cứ. */
  reasons: string[];
  status: string;
}

export interface ExportParams {
  template: EvaluationTemplate;
  periodType: "MONTH" | "QUARTER";
  year: number;
  number: number;
  person: ExportEvaluation;
  tasks: ExportTaskRow[];
  score: ScoreResult | null;
  leader?: ExportLeaderInput | null;
  /**
   * YC-10: dữ liệu cho sheet phụ "Đánh giá chất lượng". KHÔNG tham gia Bảng 1/ô chính thức.
   * undefined = bỏ qua sheet phụ (tương thích caller cũ).
   */
  qualityRows?: ApprovalQualityExportRow[];
}

const DRAFT = "DỰ THẢO — CHƯA ĐỦ CĂN CỨ";
const FONT = { name: "Times New Roman", size: 11 };

function fmt(n: number | null | undefined, digits = 2): string | null {
  if (n === null || n === undefined) return null;
  return Number(n).toFixed(digits).replace(/\.?0+$/, (m) => (m.includes(".") ? "" : m));
}

function isLeaderTemplate(t: EvaluationTemplate) {
  return t === "01B" || t === "02B";
}

function sheetNameFor(t: EvaluationTemplate): string {
  if (t === "01A") return "Biểu 01A (CC)";
  if (t === "01B") return "01B tháng";
  if (t === "02A") return "Biểu 02A (CC)";
  return "02B quý (LĐ)";
}

function periodLabel(p: ExportParams): string {
  return p.periodType === "QUARTER"
    ? `Quý ${p.number}/${p.year}`
    : `Tháng ${p.number}/${p.year}`;
}

/** Tạo sheet Bảng 1 (tính điểm) — chỉ cho mẫu công chức (01A/02A). */
function buildBang1Sheet(wb: ExcelJS.Workbook, p: ExportParams): void {
  const ws = wb.addWorksheet("Bảng 1 (tính điểm)", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 5 },
    { width: 42 },
    { width: 12 },
    { width: 28 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 12 },
  ];

  ws.mergeCells("A1:N1");
  ws.getCell("A1").value = "CHI CỤC HẢI QUAN KHU VỰC XVI";
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.mergeCells("A2:N2");
  ws.getCell("A2").value = p.person.unitName || "HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG";
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getCell("A4").value = `Họ và tên: ${p.person.fullName}`;
  ws.getCell("A5").value = `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${
    p.person.positionTitle || "—"
  }`;
  ws.getCell("A6").value = `Đơn vị công tác: ${p.person.unitName || "—"}`;

  ws.mergeCells("E7:N7");
  ws.getCell("E7").value = "Bảng 1. Cách tính điểm số lượng, tiến độ, chất lượng";

  const headers = [
    "STT",
    "Nội dung nhiệm vụ",
    "Ngày hết hạn",
    "Sản phẩm/công việc",
    "Hệ số quy đổi",
    "Số lượng giao",
    "Số lượng giao quy đổi",
    "Số lượng hoàn thành thực tế",
    "Số lượng hoàn thành thực tế quy đổi",
    "Ngày hoàn thành",
    "Số lần chậm tiến độ",
    "Số lượng hoàn thành thực tế đạt tiến độ quy đổi",
    "Số lần yêu cầu làm lại",
    "Số lượng hoàn thành thực tế đạt chất lượng quy đổi",
  ];
  const headRow = 11;
  headers.forEach((h, i) => {
    const cell = ws.getCell(headRow, i + 1);
    cell.value = h;
    cell.font = { ...FONT, bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  const first = headRow + 1;
  const rows = p.score?.rows || [];
  // GHÉP THEO ID (không theo thứ tự chỉ số) — tránh lệch dữ liệu khi số dòng
  // của engine khác số dòng nguồn (thiếu hệ số, bị loại trùng...).
  const taskByResultId = new Map(p.tasks.map((t) => [t.resultId, t]));
  rows.forEach((r, i) => {
    const rw = first + i;
    ws.getCell(rw, 1).value = i + 1;
    ws.getCell(rw, 2).value = r.title;
    const src = taskByResultId.get(r.id);
    ws.getCell(rw, 3).value = src?.dueDate || null;
    ws.getCell(rw, 4).value = src?.product || null;
    ws.getCell(rw, 5).value = r.factor;
    ws.getCell(rw, 6).value = r.assignedQty;
    ws.getCell(rw, 7).value = r.g;
    ws.getCell(rw, 8).value = r.completedQty;
    ws.getCell(rw, 9).value = r.i;
    ws.getCell(rw, 10).value = src?.completedDate || null;
    ws.getCell(rw, 11).value = r.lateDays;
    ws.getCell(rw, 12).value = r.l;
    ws.getCell(rw, 13).value = r.reworkCount;
    ws.getCell(rw, 14).value = r.n;
    for (let cc = 1; cc <= 14; cc++) {
      ws.getCell(rw, cc).font = FONT;
      ws.getCell(rw, cc).border = {
        top: { style: "hair" },
        left: { style: "hair" },
        bottom: { style: "hair" },
        right: { style: "hair" },
      };
    }
    if (r.status !== "KNOWN") {
      ws.getCell(rw, 2).note = `DỰ THẢO — ${r.reasons.join("; ")}`;
    }
  });

  const tongRow = first + Math.max(rows.length, 1);
  ws.getCell(tongRow, 2).value = "TỔNG CỘNG";
  ws.getCell(tongRow, 2).font = { ...FONT, bold: true };
  const totals = p.score?.totals;
  ws.getCell(tongRow, 7).value = totals?.g ?? null;
  ws.getCell(tongRow, 8).value = totals?.h ?? null;
  ws.getCell(tongRow, 9).value = totals?.i ?? null;
  ws.getCell(tongRow, 12).value = totals?.l ?? null;
  ws.getCell(tongRow, 13).value = totals?.m ?? null;
  ws.getCell(tongRow, 14).value = totals?.n ?? null;

  const pctRow = tongRow + 1;
  ws.getCell(pctRow, 1).value = "Điểm (%) về số lượng";
  ws.getCell(pctRow, 2).value = "[= (9)/(7)]";
  ws.getCell(pctRow, 5).value = p.score?.ratios.a ?? null;
  ws.getCell(pctRow, 10).value = "Điểm (%) về tiến độ";
  ws.getCell(pctRow, 11).value = p.score?.ratios.b ?? null;
  ws.getCell(pctRow, 13).value = "Điểm % chất lượng";
  ws.getCell(pctRow, 14).value = p.score?.ratios.c ?? null;
  for (let cc = 1; cc <= 14; cc++) {
    ws.getCell(pctRow, cc).font = { ...FONT, bold: true };
  }
}

/** Sheet biểu mẫu đánh giá (01A/01B/02A/02B). */
function buildFormSheet(wb: ExcelJS.Workbook, p: ExportParams): void {
  const ws = wb.addWorksheet(sheetNameFor(p.template), {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 6 }, { width: 62 }, { width: 14 }, { width: 20 }, { width: 14 }];

  const leader = isLeaderTemplate(p.template);
  const quarter = p.template === "02A" || p.template === "02B";

  ws.mergeCells("A1:E1");
  ws.getCell("A1").value = p.template;
  ws.getCell("A1").alignment = { horizontal: "center" };
  ws.getCell("A1").font = { ...FONT, bold: true, size: 13 };

  ws.mergeCells("A2:E2");
  ws.getCell("A2").value = "CHI CỤC HẢI QUAN KHU VỰC XVI";
  ws.getCell("A2").alignment = { horizontal: "center" };
  ws.getCell("A2").font = { ...FONT, bold: true, size: 12 };
  ws.mergeCells("A3:E3");
  ws.getCell("A3").value = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM — Độc lập - Tự do - Hạnh phúc";
  ws.getCell("A3").alignment = { horizontal: "center" };
  ws.getCell("A3").font = FONT;

  ws.mergeCells("A5:E5");
  ws.getCell("A5").value = "PHIẾU THEO DÕI, ĐÁNH GIÁ CÔNG CHỨC";
  ws.getCell("A5").alignment = { horizontal: "center" };
  ws.getCell("A5").font = { ...FONT, bold: true, size: 13 };
  ws.mergeCells("A6:E6");
  ws.getCell("A6").value = leader
    ? "(Dành cho công chức giữ chức vụ lãnh đạo)"
    : "(Dành cho công chức không giữ chức vụ lãnh đạo)";
  ws.getCell("A6").alignment = { horizontal: "center" };
  ws.getCell("A6").font = FONT;
  ws.getCell("A7").value = periodLabel(p);
  ws.getCell("A7").font = { ...FONT, bold: true };

  ws.getCell("B8").value = `Họ và tên: ${p.person.fullName}`;
  ws.getCell("B9").value = leader
    ? `Chức vụ, chức danh: ${p.person.positionTitle || "—"}`
    : `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${
        p.person.positionTitle || "—"
      }`;
  ws.getCell("B10").value = `Đơn vị công tác: ${p.person.unitName || "—"}`;

  // ---------------- I. Tiêu chí chung ----------------
  ws.mergeCells("B12:E12");
  ws.getCell("B12").value = "I. KẾT QUẢ THEO DÕI, ĐÁNH GIÁ THEO TIÊU CHÍ CHUNG:";
  ws.getCell("B12").font = { ...FONT, bold: true };

  const criteria: Array<[string, string, number, number | null]> = [
    ["I", "Phẩm chất chính trị, phẩm chất đạo đức, văn hóa thực thi công vụ", 10, null],
    ["1", "Phẩm chất chính trị, phẩm chất đạo đức, văn hóa thực thi công vụ", 5, null],
    ["2", "Ý thức kỷ luật, kỷ cương trong thực thi công vụ", 5, null],
    ["II", "Năng lực chuyên môn, nghiệp vụ theo yêu cầu của vị trí việc làm", 10, null],
    ["1", "Năng lực chuyên môn, nghiệp vụ theo yêu cầu của vị trí việc làm", 2.5, null],
    ["2", "Khả năng đáp ứng yêu cầu thực thi nhiệm vụ được giao thường xuyên", 2.5, null],
    ["3", "Tinh thần trách nhiệm trong thực thi công vụ", 2.5, null],
    ["4", "Thái độ phục vụ người dân, doanh nghiệp và khả năng phối hợp", 2.5, null],
    ["III", "Năng lực đổi mới, sáng tạo, dám nghĩ, dám làm, dám chịu trách nhiệm", 10, null],
    ["1", "Có sản phẩm, giải pháp đột phá, sáng tạo đem lại giá trị, hiệu quả", 2.5, null],
    ["2", "Sẵn sàng tham gia thực hiện nhiệm vụ chính trị đặc biệt quan trọng", 2.5, null],
    ["3", "Có tinh thần chịu trách nhiệm trước kết quả công việc; chủ động", 2.5, null],
    ["4", "Chủ động đưa ra quyết định trong phạm vi thẩm quyền", 2.5, null],
  ];

  ws.getCell("A13").value = "TT";
  ws.getCell("B13").value = "Tiêu chí chấm điểm";
  ws.getCell("C13").value = "Điểm tối đa";
  ws.getCell("D13").value = "Điểm do cá nhân tự chấm";
  ws.getCell("E13").value = "Ghi chú";
  for (let cc = 1; cc <= 5; cc++) {
    ws.getCell(13, cc).font = { ...FONT, bold: true, size: 10 };
    ws.getCell(13, cc).alignment = { horizontal: "center", wrapText: true };
  }

  let r = 14;
  const groupRows: number[] = [];
  criteria.forEach(([tt, name, max]) => {
    ws.getCell(r, 1).value = tt;
    ws.getCell(r, 2).value = name;
    ws.getCell(r, 3).value = max;
    ws.getCell(r, 4).value = null; // cán bộ tự chấm — để trống nếu chưa nhập
    ws.getCell(r, 5).value = null;
    for (let cc = 1; cc <= 5; cc++) ws.getCell(r, cc).font = FONT;
    if (["I", "II", "III"].includes(tt)) {
      ws.getCell(r, 2).font = { ...FONT, bold: true };
      groupRows.push(r);
    }
    r++;
  });

  // Tổng cộng tiêu chí chung: điểm do cán bộ tự chấm (nếu có) — ngược lại để trống + ghi chú.
  const totalRow = r;
  ws.getCell(totalRow, 2).value = "Tổng cộng";
  ws.getCell(totalRow, 3).value = 30;
  ws.getCell(totalRow, 4).value = p.person.commonCriteriaScore;
  ws.getCell(totalRow, 5).value =
    p.person.commonCriteriaScore === null ? DRAFT : null;
  ws.getCell(totalRow, 2).font = { ...FONT, bold: true };
  ws.getCell(totalRow, 3).font = { ...FONT, bold: true };
  ws.getCell(totalRow, 4).font = { ...FONT, bold: true };

  // ---------------- II. Tổng hợp ----------------
  const s2 = totalRow + 2;
  ws.mergeCells(`B${s2}:E${s2}`);
  ws.getCell(`B${s2}`).value = "II. TỔNG HỢP KẾT QUẢ TỰ ĐÁNH GIÁ, XẾP LOẠI:";
  ws.getCell(`B${s2}`).font = { ...FONT, bold: true };

  const rowCC = s2 + 1;
  ws.getCell(rowCC, 2).value = "1. Điểm tiêu chí chung (tối đa 30 điểm):";
  ws.getCell(rowCC, 3).value = p.person.commonCriteriaScore;
  ws.getCell(rowCC, 5).value = p.person.commonCriteriaScore === null ? DRAFT : null;

  const rowTask = rowCC + 1;
  ws.getCell(rowTask, 2).value = "2. Điểm tiêu chí kết quả thực hiện nhiệm vụ: (tối đa 70 điểm)";

  let d34: number | null = null;
  let d35: number | null = null;
  let d36: number | null = null;
  let d37: number | null = null;
  let d38: number | null = null;
  let draftNote: string | null = null;

  if (leader && p.leader) {
    d34 = p.leader.a;
    d35 = p.leader.b;
    d36 = p.leader.c;
    if (d34 === null || d35 === null || d36 === null) {
      draftNote = DRAFT;
    }
  } else {
    const ratios = p.score?.ratios;
    d34 = ratios?.a ?? null;
    d35 = ratios?.b ?? null;
    d36 = ratios?.c ?? null;
    if (d34 === null || d35 === null || d36 === null) draftNote = DRAFT;
  }
  if (d34 !== null && d35 !== null && d36 !== null) {
    d37 = (d34 + d35 + d36) / 3;
    d38 = (d37 * 70) / 100;
  }

  const rowsDetail: Array<[string, number | null]> = [
    ["a. Điểm tỷ lệ % đánh giá về số lượng (a):", d34],
    ["b. Điểm tỷ lệ % đánh giá về tiến độ (b):", d35],
    ["c. Điểm tỷ lệ % đánh giá về chất lượng (c):", d36],
    [
      "d. Điểm tỷ lệ % đánh giá kết quả thực hiện nhiệm vụ (d = (a+b+c)/3):",
      d37,
    ],
    ["Điểm tiêu chí kết quả thực hiện nhiệm vụ (=(d*70)/100):", d38],
  ];
  let rr = rowTask + 1;
  for (const [label, val] of rowsDetail) {
    ws.getCell(rr, 2).value = label;
    ws.getCell(rr, 3).value = val;
    if (val === null) ws.getCell(rr, 5).value = DRAFT;
    ws.getCell(rr, 2).font = FONT;
    ws.getCell(rr, 3).font = FONT;
    rr++;
  }

  // D39 — tổng điểm
  const form01a = computeForm01A({
    ratios: {
      a: d34,
      b: d35,
      c: d36,
      d: d37,
      score70: d38,
    },
    commonCriteriaScore: p.person.commonCriteriaScore,
  });
  const rowTotal = rr;
  ws.getCell(rowTotal, 2).value = "3. Tổng điểm theo dõi, đánh giá (3=1+2):";
  ws.getCell(rowTotal, 3).value = form01a.d39;
  if (form01a.d39 === null) ws.getCell(rowTotal, 5).value = DRAFT;
  ws.getCell(rowTotal, 2).font = { ...FONT, bold: true };
  ws.getCell(rowTotal, 3).font = { ...FONT, bold: true };

  // Ưu điểm / hạn chế
  const rowStrength = rowTotal + 2;
  ws.getCell(rowStrength, 2).value = "4. Ưu điểm:";
  ws.getCell(rowStrength, 2).font = { ...FONT, bold: true };
  ws.mergeCells(rowStrength + 1, 2, rowStrength + 2, 5);
  ws.getCell(rowStrength + 1, 2).value = p.person.strengths || "";
  ws.getCell(rowStrength + 1, 2).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(rowStrength + 1, 2).font = FONT;

  const rowWeak = rowStrength + 4;
  ws.getCell(rowWeak, 2).value = "5. Hạn chế, khuyết điểm:";
  ws.getCell(rowWeak, 2).font = { ...FONT, bold: true };
  ws.mergeCells(rowWeak + 1, 2, rowWeak + 2, 5);
  ws.getCell(rowWeak + 1, 2).value = p.person.weaknesses || "";
  ws.getCell(rowWeak + 1, 2).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(rowWeak + 1, 2).font = FONT;

  // Mức xếp loại (chỉ mẫu quý 02A/02B — theo mẫu gốc)
  if (quarter) {
    const rowGrade = rowWeak + 4;
    ws.getCell(rowGrade, 2).value = "6. Cá nhân tự đề xuất mức xếp loại:";
    ws.getCell(rowGrade, 2).font = { ...FONT, bold: true };
    ws.getCell(rowGrade + 1, 2).value = p.person.selfGradeChoice || "";
    ws.getCell(rowGrade + 1, 5).value = p.person.selfGradeChoice ? null : DRAFT;
    ws.getCell(rowGrade + 2, 2).value = `Gợi ý của hệ thống: ${
      p.person.selfGradeSuggestion || DRAFT
    }`;
    ws.getCell(rowGrade + 2, 2).font = { ...FONT, italic: true, size: 10 };
  }

  // Nhận xét cấp có thẩm quyền — để trống nếu chưa nhập
  const rowComment = (quarter ? rowWeak + 4 : rowWeak + 4) + 4;
  ws.getCell(rowComment, 2).value = "7. Ý kiến nhận xét của cấp có thẩm quyền theo dõi, đánh giá:";
  ws.getCell(rowComment, 2).font = { ...FONT, bold: true };
  ws.mergeCells(rowComment + 1, 2, rowComment + 3, 5);
  ws.getCell(rowComment + 1, 2).value = p.person.reviewerComment || "";
  ws.getCell(rowComment + 1, 2).alignment = { wrapText: true, vertical: "top" };
  ws.getCell(rowComment + 1, 2).font = FONT;

  // Chữ ký — để trống (ghi tay hoặc nhập sau)
  const signRow = rowComment + 5;
  ws.getCell(signRow, 2).value = "CÔNG CHỨC TỰ ĐÁNH GIÁ";
  ws.getCell(signRow, 2).font = { ...FONT, bold: true };
  ws.getCell(signRow + 1, 2).value = "(Ký tên, ghi rõ họ tên)";
  ws.getCell(signRow, 4).value = "CẤP CÓ THẨM QUYỀN THEO DÕI, ĐÁNH GIÁ";
  ws.getCell(signRow, 4).font = { ...FONT, bold: true };
  ws.getCell(signRow + 1, 4).value = "(Ký tên, ghi rõ họ tên)";
  ws.getCell(signRow + 3, 2).value = `Phục Hòa, ngày....tháng.....năm ${p.year}`;
  ws.getCell(signRow + 3, 4).value = `Phục Hòa, ngày....tháng.....năm ${p.year}`;

  // Cảnh báo dự thảo
  const warnRow = signRow + 5;
  if (draftNote) {
    ws.mergeCells(warnRow, 1, warnRow, 5);
    ws.getCell(warnRow, 1).value = `${draftNote} — ${p.score?.reasons?.join("; ") || ""}`;
    ws.getCell(warnRow, 1).font = { ...FONT, bold: true, color: { argb: "FFB45309" } };
    ws.getCell(warnRow, 1).alignment = { wrapText: true };
  }

  // Vùng in
  ws.pageSetup.printArea = `A1:E${warnRow + 1}`;
  ws.headerFooter = {
    oddFooter: "&LTài liệu dự thảo — chưa phải bản chính thức để trình ký&RTrang &P / &N",
  };
}

/**
 * YC-10 — sheet phụ "Đánh giá chất lượng" (annex).
 * Tuyệt đối không ghi vào các ô/cột chính thức 01A/01B/02A/02B hay Bảng 1.
 */
function buildQualitySheet(wb: ExcelJS.Workbook, rows: ApprovalQualityExportRow[]): void {
  const ws = wb.addWorksheet("Đánh giá chất lượng", {
    views: [{ state: "frozen", ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  ws.mergeCells("A1:J1");
  const title = ws.getCell("A1");
  title.value = "ĐÁNH GIÁ CHẤT LƯỢNG KẾT QUẢ NHIỆM VỤ (SHEET PHỤ — KHÔNG THAY ĐỔI Ô CHÍNH THỨC)";
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  ws.getRow(1).height = 28;

  ws.mergeCells("A2:J2");
  const note = ws.getCell("A2");
  note.value =
    "Mức chất lượng do lãnh đạo đánh giá khi nghiệm thu (65–100, bước 5). " +
    "Chỉ hiển thị/audit; KHÔNG tham gia điểm tháng, Bảng 1, QĐ1277 hoặc xếp loại. " +
    "Cột “Chất lượng gốc” là giá trị bất biến trên quyết định; “Chất lượng hiệu lực” có thể đã điều chỉnh.";
  note.font = { italic: true, size: 9 };
  note.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(2).height = 42;

  const headers = [
    "STT",
    "Mã nhiệm vụ",
    "Tên nhiệm vụ",
    "Vòng duyệt",
    "Chất lượng gốc (%)",
    "Chất lượng hiệu lực (%)",
    "Điều chỉnh",
    "Lý do điều chỉnh",
    "Người đánh giá",
    "Thời điểm quyết định",
  ];
  const headerRow = ws.getRow(4);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });
  headerRow.height = 30;

  if (rows.length === 0) {
    ws.mergeCells("A5:J5");
    const empty = ws.getCell("A5");
    empty.value = "Chưa có nhiệm vụ nào trong kỳ để đánh giá chất lượng.";
    empty.font = { italic: true, size: 9 };
    empty.alignment = { horizontal: "center" };
  } else {
    rows.forEach((r, idx) => {
      const row = ws.getRow(5 + idx);
      const values = [
        idx + 1,
        r.taskCode,
        r.taskTitle,
        r.decisionRound ?? "—",
        r.originalQualityPercent ?? "Chưa đánh giá",
        r.effectiveQualityPercent ?? "Chưa đánh giá",
        r.adjusted ? "Có điều chỉnh" : "—",
        r.adjustmentReason ?? "—",
        r.decidedByName ?? "—",
        r.decidedAt ? new Date(r.decidedAt).toLocaleString("vi-VN") : "—",
      ];
      values.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v as any;
        cell.font = { size: 9 };
        cell.alignment = {
          horizontal: i === 0 || i === 3 || i >= 4 ? "center" : "left",
          vertical: "middle",
          wrapText: true,
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD9D9D9" } },
          left: { style: "thin", color: { argb: "FFD9D9D9" } },
          bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
          right: { style: "thin", color: { argb: "FFD9D9D9" } },
        };
      });
    });
  }

  ws.columns = [
    { width: 6 },
    { width: 18 },
    { width: 42 },
    { width: 10 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
    { width: 36 },
    { width: 20 },
    { width: 20 },
  ];
  ws.pageSetup.printArea = `A1:J${Math.max(5, 4 + rows.length)}`;
  ws.headerFooter = {
    oddFooter:
      "&LSheet phụ YC-10 — không thay đổi ô chính thức&RTrang &P / &N",
  };
}

/** Sinh workbook biểu mẫu. */
export async function buildEvaluationWorkbook(p: ExportParams): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TALUNG-CUS-WORK";
  wb.created = new Date();

  if (!isLeaderTemplate(p.template)) {
    buildBang1Sheet(wb, p);
  }
  buildFormSheet(wb, p);
  if (p.qualityRows !== undefined) {
    buildQualitySheet(wb, p.qualityRows);
  }

  // Excel tính lại khi mở
  wb.calcProperties = { fullCalcOnLoad: true } as any;

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

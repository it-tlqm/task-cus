/**
 * Giai đoạn 3 — Xuất báo cáo giao ban ra file Word (.docx) theo mẫu Tuần 42.
 * Dùng chung cho cả bản xem trước hiện tại (tổng hợp mới) và phiên bản đã lưu (snapshot).
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { ReportSnapshot, ReportTableRow } from "@/server/briefing-report";

const FONT = "Times New Roman";
const CELL_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: "404040" },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: "404040" },
  left: { style: BorderStyle.SINGLE, size: 4, color: "404040" },
  right: { style: BorderStyle.SINGLE, size: 4, color: "404040" },
};

function run(text: string, opts?: { bold?: boolean; italics?: boolean; size?: number }): TextRun {
  return new TextRun({
    text,
    bold: opts?.bold,
    italics: opts?.italics,
    size: opts?.size ?? 26, // 13pt
    font: FONT,
  });
}

function para(
  text: string,
  opts?: {
    bold?: boolean;
    italics?: boolean;
    size?: number;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    spaceBefore?: number;
    spaceAfter?: number;
    indentLeft?: number;
  }
): Paragraph {
  return new Paragraph({
    alignment: opts?.alignment,
    spacing: { before: opts?.spaceBefore ?? 0, after: opts?.spaceAfter ?? 100, line: 276 },
    indent: opts?.indentLeft ? { left: opts.indentLeft } : undefined,
    children: [run(text, opts)],
  });
}

function cell(
  text: string,
  width: number,
  opts?: {
    bold?: boolean;
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    fill?: string;
    indentLeft?: number;
    size?: number;
  }
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: opts?.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    borders: CELL_BORDER,
    children: [
      new Paragraph({
        alignment: opts?.alignment,
        spacing: { before: 20, after: 20, line: 240 },
        indent: opts?.indentLeft ? { left: opts.indentLeft } : undefined,
        children: [run(text, { bold: opts?.bold, size: opts?.size ?? 22 })],
      }),
    ],
  });
}

/** Bề rộng cột (khổ A4, lề 1000 twips → dùng được ~9900 twips) */
function buildWidths(): { name: number; value: number; target: number; percent: number; note: number } {
  return { name: 2300, value: 1000, target: 1450, percent: 900, note: 1250 };
}

function buildMetricTableWithHeaders(rows: ReportTableRow[], columns: { label: string }[]): Table {
  const w = buildWidths();
  const headerCells: TableCell[] = [
    cell("Chỉ tiêu", w.name, { bold: true, alignment: AlignmentType.CENTER, fill: "D9D9D9" }),
    ...columns.map((c) => cell(c.label, w.value, { bold: true, alignment: AlignmentType.CENTER, fill: "D9D9D9" })),
    cell("Chỉ tiêu giao", w.target, { bold: true, alignment: AlignmentType.CENTER, fill: "D9D9D9" }),
    cell("Tỷ lệ %", w.percent, { bold: true, alignment: AlignmentType.CENTER, fill: "D9D9D9" }),
    cell("Ghi chú", w.note, { bold: true, alignment: AlignmentType.CENTER, fill: "D9D9D9" }),
  ];

  const tableRows: TableRow[] = [new TableRow({ tableHeader: true, children: headerCells })];

  for (const r of rows) {
    const cells: TableCell[] = [
      cell(r.level > 0 ? `– ${r.name}` : r.name, w.name, {
        indentLeft: r.level > 0 ? 220 : 0,
        alignment: AlignmentType.LEFT,
      }),
      ...r.values.map((v) => cell(v, w.value, { alignment: AlignmentType.RIGHT })),
      cell(r.target, w.target, { alignment: AlignmentType.LEFT }),
      cell(r.percent, w.percent, { alignment: AlignmentType.CENTER }),
      cell(r.note, w.note, { alignment: AlignmentType.LEFT }),
    ];
    tableRows.push(new TableRow({ children: cells }));
  }

  return new Table({ rows: tableRows });
}

/** Dựng file Word từ snapshot báo cáo (nội dung số liệu đã là chuỗi hiển thị — không tính lại) */
export async function renderReportDocx(snapshot: ReportSnapshot): Promise<Buffer> {
  const { meta, blocks } = snapshot;
  const children: (Paragraph | Table)[] = [];

  // ---- Phần đầu biên bản ----
  children.push(para(meta.title, { bold: true, alignment: AlignmentType.CENTER, size: 30, spaceAfter: 60 }));
  children.push(para(meta.subtitle, { alignment: AlignmentType.CENTER, size: 26, spaceAfter: 200 }));

  children.push(para("THỜI GIAN HỌP GIAO BAN", { bold: true, spaceBefore: 60, spaceAfter: 40 }));
  children.push(para(`Bắt đầu: ${meta.meetingStart || "……………………………………"}`, { spaceAfter: 20 }));
  children.push(para(`Kết thúc: ${meta.meetingEnd || "……………………………………"}`, { spaceAfter: 200 }));

  // ---- Các khối theo cấu trúc đã cấu hình ----
  for (const b of blocks) {
    if (b.kind === "HEADING") {
      children.push(para(b.title, { bold: true, spaceBefore: 200, spaceAfter: 80 }));
    } else if (b.kind === "METRIC_GROUP") {
      children.push(para(b.title, { bold: true, spaceBefore: 200, spaceAfter: 80 }));
      if (b.rows.length === 0) {
        children.push(para("Chưa có chỉ tiêu trong nhóm này.", { italics: true, spaceAfter: 120 }));
      } else {
        children.push(buildMetricTableWithHeaders(b.rows, b.columns));
        children.push(para("", { spaceAfter: 60 }));
      }
    } else if (b.kind === "NARRATIVE") {
      if (b.title) children.push(para(b.title, { bold: true, spaceBefore: 200, spaceAfter: 80 }));
      const content = (b.content || "").trim();
      if (!content) {
        children.push(para("………………………………………………………………………………………………", { spaceAfter: 120 }));
      } else {
        for (const line of content.split(/\r?\n/)) {
          if (line.trim() === "") {
            children.push(para("", { spaceAfter: 40 }));
          } else {
            children.push(para(line.trim(), { alignment: AlignmentType.JUSTIFIED, spaceAfter: 80 }));
          }
        }
      }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: 26 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 }, // A4 dọc
            margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

import ExcelJS from "exceljs";
import { DutySlotDef } from "./duty-catalog";

/**
 * YC-24 — Xuất "Sổ phân công nhiệm vụ" (.xlsx) bám cấu trúc mẫu Hải quan
 * (docs/Dữ liệu-file-hai-quan-gui/so phan cong nhiem vu.xls — sheet ND).
 *
 * Nguyên tắc:
 * - Mỗi NGÀY = một khối biểu; một trang/sheet chứa 2×2 = 4 khối (đúng cách mẫu lặp vùng in).
 * - KHÔNG nhân đôi dữ liệu: mỗi phân công chỉ vào đúng khối của ngày đó, đúng ô của vị trí.
 * - Không tự bịa số liệu: ô tổng hợp chỉ điền khi người dùng đã nhập, còn lại giữ dòng chấm mẫu.
 * - Bản ghi cũ (không gắn vị trí) được in nối tiếp phía dưới các dòng chuẩn của ngày đó.
 */

export interface DutyExportAssignment {
  date: Date;
  personName: string;
  positionId: string | null;
  positionTitle: string | null;
  positionDetail: string | null;
  slotLabel: string | null;
  slotOrder: number | null;
  /** Dữ liệu cũ: điểm trực dạng văn bản tự do */
  post: string | null;
  /** Dữ liệu cũ: ca */
  shift: string;
}

export interface DutyExportCatalogPosition {
  id: string;
  code: string;
  title: string;
  detail: string | null;
  slots: DutySlotDef[];
  sortOrder: number;
  status: string;
}

export interface DutyExportDayInfo {
  date: Date;
  totalStaff: number | null;
  presentStaff: number | null;
  absentCount: number | null;
  absentReason: string | null;
}

export interface DutyExportOptions {
  from: Date;
  to: Date;
  /** Tên bộ phận được xuất — hiển thị trên tiêu đề biểu & trang bìa (không hardcode "Bộ phận Nghiệp vụ"). */
  unitName?: string | null;
  /** Mã bộ phận (dùng cho tên tệp/đối chiếu). */
  unitCode?: string | null;
  assignments: DutyExportAssignment[];
  catalog: DutyExportCatalogPosition[];
  dayInfos: DutyExportDayInfo[];
  skipEmpty?: boolean;
  includeCover?: boolean;
}

const FONT = "Times New Roman";
const THIN = { style: "thin" as const };
const BORDER_ALL = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const ORG_LINE = "HẢI QUAN CỬA KHẨU QUỐC TẾ TÀ LÙNG";
const FORM_TITLE = "PHÂN CÔNG NHIỆM VỤ BỘ PHẬN NGHIỆP VỤ";
const NOTE_LINE =
  "Ghi chú: Các đ/c công chức được giao nhiệm vụ chịu trách nhiệm về công việc hàng ngày của mình được phân công ";
const SIGN_LINE = "LÃNH ĐẠO ĐỘI ";
const DOTS_STD = "Đ/c…………………………";
const DOTS_LONG = "Đ/c…………………………….";
const DOTS_REASON = "……………………………………………………";
const DOTS_FILL = "………………………………………………………….";
const SHIFT_LABEL: Record<string, string> = { SANG: "Sáng", CHIEU: "Chiều", CA_NGAY: "Cả ngày" };

/** Chiều cao dòng vị trí mặc định theo mẫu (8 dòng đầu), các dòng thêm dùng mặc định 42. */
const POSITION_ROW_HEIGHTS = [30.75, 42.75, 40.5, 29.25, 45.75, 42.75, 26.25, 99.75];

/** Tiêu đề biểu theo bộ phận: "PHÂN CÔNG NHIỆM VỤ <TÊN BỘ PHẬN>" (mặc định giữ mẫu gốc khi không truyền). */
function formTitleOf(unitName?: string | null): string {
  const n = (unitName || "").trim();
  return n ? `PHÂN CÔNG NHIỆM VỤ ${n.toUpperCase()}` : FORM_TITLE;
}

/** Dòng tên bộ phận trên trang bìa (không hardcode cho mọi file). */
function coverUnitLine(unitName?: string | null): string {
  const n = (unitName || "").trim();
  return n ? n.toUpperCase() : "BỘ PHẬN NGHIỆP VỤ HẢI QUAN";
}

function dayKey(d: Date): string {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function eachDay(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur.getTime() <= end.getTime() && out.length < 62) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function dateLine(d: Date): string {
  return `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
}

interface RenderRow {
  /** Các dòng của cột "Nhiệm vụ được phân công" */
  taskLines: string[];
  /** Các dòng của cột "Người thực hiện" */
  personLines: string[];
  /** Căn giữa tiêu đề (mẫu: dòng Trực trưa) */
  centerTitle: boolean;
}

/** Dựng danh sách dòng in của 1 ngày từ dữ liệu phân công. */
function buildDayRows(dayRows: DutyExportAssignment[], catalog: DutyExportCatalogPosition[]): RenderRow[] {
  const out: RenderRow[] = [];
  const renderedPositionIds = new Set<string>();
  const activeCatalog = catalog.filter((p) => p.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);

  const renderPosition = (
    title: string,
    detail: string | null,
    slots: DutySlotDef[],
    assignedBySlot: Map<number, string>,
    center: boolean
  ): RenderRow => {
    const taskLines: string[] = [title];
    if (detail) taskLines.push(detail);
    const personLines: string[] = [];
    slots.forEach((s, idx) => {
      const name = assignedBySlot.get(idx);
      const label = s.l;
      const isSiteLabel = !!label && /^vị\s*trí/i.test(label);
      if (isSiteLabel) {
        taskLines.push(label!);
        personLines.push(name ? `Đ/c ${name}` : DOTS_LONG);
      } else if (label) {
        personLines.push(name ? `${label} đ/c ${name}` : `${label} đ/c………………………`);
      } else {
        personLines.push(name ? `Đ/c ${name}` : DOTS_STD);
      }
    });
    if (personLines.length === 0) personLines.push(DOTS_STD);
    return { taskLines, personLines, centerTitle: center || /trực\s*trưa/i.test(title) };
  };

  // 1) Các vị trí còn hiệu lực theo danh mục (bản sao tiêu đề lấy từ bản ghi cũ nhất của ngày nếu có)
  for (const p of activeCatalog) {
    const assigned = dayRows.filter((r) => r.positionId === p.id);
    const firstSnap = assigned[0];
    const title = firstSnap?.positionTitle || p.title;
    const detail = firstSnap ? firstSnap.positionDetail : p.detail;
    const map = new Map<number, string>();
    for (const r of assigned) {
      if (r.slotOrder === null || r.slotOrder === undefined) continue;
      if (!map.has(r.slotOrder)) map.set(r.slotOrder, r.personName);
    }
    out.push(renderPosition(title, detail, p.slots, map, false));
    renderedPositionIds.add(p.id);
  }

  // 2) Vị trí đã ngừng sử dụng / không còn trong danh mục nhưng ngày đó có phân công (in theo bản sao, không mất dữ liệu)
  const orphanRows = dayRows.filter((r) => r.positionId && !renderedPositionIds.has(r.positionId));
  const orphanGroups = new Map<string, DutyExportAssignment[]>();
  for (const r of orphanRows) {
    const arr = orphanGroups.get(r.positionId!) || [];
    arr.push(r);
    orphanGroups.set(r.positionId!, arr);
  }
  for (const [, arr] of orphanGroups) {
    const maxSlot = Math.max(...arr.map((r) => (r.slotOrder ?? 0)));
    const slots: DutySlotDef[] = Array.from({ length: maxSlot + 1 }, (_, idx) => {
      const row = arr.find((r) => r.slotOrder === idx);
      return { k: `s${idx + 1}`, l: row?.slotLabel ?? null };
    });
    const map = new Map<number, string>();
    for (const r of arr) {
      if (r.slotOrder === null || r.slotOrder === undefined) continue;
      if (!map.has(r.slotOrder)) map.set(r.slotOrder, r.personName);
    }
    const title = arr[0].positionTitle || "(vị trí ngừng sử dụng)";
    out.push(renderPosition(title, arr[0].positionDetail, slots, map, false));
  }

  // 3) Bản ghi cũ không gắn vị trí — in nối tiếp, mỗi bản ghi một dòng
  for (const r of dayRows.filter((x) => !x.positionId)) {
    const label = r.post?.trim() || SHIFT_LABEL[r.shift] || r.shift;
    out.push({ taskLines: [label], personLines: [`Đ/c ${r.personName}`], centerTitle: false });
  }

  return out;
}

function styleCell(
  cell: ExcelJS.Cell,
  opts: {
    size: number;
    bold?: boolean;
    italic?: boolean;
    h?: "left" | "center";
    v?: "top" | "middle" | "bottom";
    wrap?: boolean;
    border?: boolean;
    borderTop?: boolean;
    borderBottom?: boolean;
  }
) {
  cell.font = { name: FONT, size: opts.size, bold: !!opts.bold, italic: !!opts.italic };
  cell.alignment = {
    horizontal: opts.h || "left",
    vertical: opts.v || "middle",
    wrapText: !!opts.wrap,
  };
  if (opts.border) cell.border = BORDER_ALL;
  else if (opts.borderTop || opts.borderBottom) {
    cell.border = { ...(opts.borderTop ? { top: THIN } : {}), ...(opts.borderBottom ? { bottom: THIN } : {}) };
  }
}

/** Ghi một khối biểu (1 ngày) tại vị trí bắt đầu; trả về dòng trống đầu tiên sau khối. */
function writeDayBlock(
  ws: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  day: Date,
  dayRows: DutyExportAssignment[],
  catalog: DutyExportCatalogPosition[],
  info: DutyExportDayInfo | undefined,
  formTitle: string
): number {
  const cTT = startCol;
  const cTask = startCol + 1;
  const cPerson = startCol + 2;
  const merge = (r: number) => ws.mergeCells(r, cTT, r, cPerson);

  // R1: tên đơn vị
  let r = startRow;
  ws.getCell(r, cTT).value = ORG_LINE;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 11, bold: true, h: "center", v: "bottom" });
  ws.getRow(r).height = 18.75;

  // R2: tiêu đề biểu (theo bộ phận được xuất)
  r++;
  ws.getCell(r, cTT).value = formTitle;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 11, bold: true, h: "center", v: "bottom" });
  ws.getRow(r).height = 18.75;

  // R3: ngày
  r++;
  ws.getCell(r, cTT).value = dateLine(day);
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 12, italic: true, h: "center", v: "bottom", borderBottom: true });
  ws.getRow(r).height = 18.75;

  // R4: header bảng
  r++;
  const head = ["TT", "Nhiệm vụ được phân công", "Người thực hiện"];
  head.forEach((t, i) => {
    ws.getCell(r, cTT + i).value = t;
    styleCell(ws.getCell(r, cTT + i), { size: 12, bold: true, h: "center", v: "middle", border: true });
  });
  ws.getRow(r).height = 24;

  // R5..: các dòng vị trí
  const rows = buildDayRows(dayRows, catalog);
  rows.forEach((row, idx) => {
    r++;
    ws.getCell(r, cTT).value = idx + 1;
    styleCell(ws.getCell(r, cTT), { size: 12, bold: true, h: "center", v: "middle", border: true });
    ws.getCell(r, cTask).value = row.taskLines.join("\n");
    styleCell(ws.getCell(r, cTask), {
      size: 11,
      bold: true,
      h: row.centerTitle ? "center" : "left",
      v: "middle",
      wrap: true,
      border: true,
    });
    ws.getCell(r, cPerson).value = row.personLines.join("\n");
    styleCell(ws.getCell(r, cPerson), { size: 12, h: "left", v: "middle", wrap: true, border: true });
    const base = POSITION_ROW_HEIGHTS[idx] ?? 42;
    ws.getRow(r).height = Math.max(base, row.personLines.length * 16.6);
  });

  // R ghi chú
  r++;
  ws.getCell(r, cTT).value = NOTE_LINE;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 10, bold: true, italic: true, h: "left", v: "bottom", wrap: true, borderTop: true });
  ws.getRow(r).height = 27;

  // R tổng hợp
  r++;
  const total = info?.totalStaff ?? null;
  const present = info?.presentStaff ?? null;
  const absent = info?.absentCount ?? null;
  ws.getCell(r, cTT).value = `Tổng số công chức:${total ?? "………"}Có mặt:${present ?? "……"}Vắng:${absent ?? "……………"}`;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 12, h: "center", v: "bottom" });
  ws.getRow(r).height = 18.75;

  // R lý do
  r++;
  ws.getCell(r, cTT).value = `Lý do:${info?.absentReason?.trim() || DOTS_REASON}`;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 12, h: "center", v: "bottom" });
  ws.getRow(r).height = 18.75;

  // R dòng chấm tiếp
  r++;
  ws.getCell(r, cTT).value = DOTS_FILL;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 12, h: "center", v: "bottom" });
  ws.getRow(r).height = 18.75;

  // R ký
  r++;
  ws.getCell(r, cTT).value = SIGN_LINE;
  merge(r);
  styleCell(ws.getCell(r, cTT), { size: 11, bold: true, h: "center", v: "bottom" });
  ws.getRow(r).height = 18.75;

  return r + 3; // 2 dòng trống giữa các khối (đúng mẫu: khối 1 kết thúc dòng 17, khối 2 bắt đầu dòng 20)
}

/** Ghi trang bìa (bám sheet Sheet1 của mẫu: NĂM + nơi ký); tên bộ phận theo file xuất. */
function writeCover(ws: ExcelJS.Worksheet, year: number, unitLine: string) {
  const setMerged = (row: number, col1: number, col2: number, value: string, size: number, bold: boolean, italic = false) => {
    ws.getCell(row, col1).value = value;
    ws.mergeCells(row, col1, row, col2);
    styleCell(ws.getCell(row, col1), { size, bold, italic, h: "center", v: "bottom" });
  };
  for (let c = 1; c <= 12; c++) ws.getColumn(c).width = c === 5 ? 18.71 : c === 12 ? 20.57 : 8.43;
  for (let r = 3; r <= 13; r++) ws.getRow(r).height = 12.75;
  ws.getRow(14).height = 20.25;
  ws.getRow(15).height = 20.25;

  setMerged(1, 1, 5, ORG_LINE, 14, false);
  setMerged(2, 1, 5, unitLine, 14, true);
  setMerged(14, 1, 12, "SỔ PHÂN CÔNG NHIỆM VỤ CÔNG TÁC GIÁM SÁT QUẢN LÝ", 16, true);
  setMerged(15, 1, 12, `NĂM ${year}`, 16, true);
  setMerged(27, 8, 12, `Phục Hòa, ngày 01 tháng 01 năm ${year}`, 14, false, true);
  setMerged(28, 8, 12, "KT. ĐỘI TRƯỞNG", 14, true);
  setMerged(29, 8, 12, "PHÓ ĐỘI TRƯỞNG", 14, true);
}

function setupPrint(ws: ExcelJS.Worksheet) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: false,
    verticalCentered: false,
  } as any;
}

const DAY_COL_WIDTHS = [
  [4.57, 29.57, 30],
  [4.57, 29.43, 30],
];

export async function buildDutyRosterWorkbook(opts: DutyExportOptions): Promise<Buffer> {
  const formTitle = formTitleOf(opts.unitName);
  const coverUnit = coverUnitLine(opts.unitName);
  const days = eachDay(opts.from, opts.to);
  const byDay = new Map<string, DutyExportAssignment[]>();
  for (const a of opts.assignments) {
    const k = dayKey(new Date(a.date));
    const arr = byDay.get(k) || [];
    arr.push(a);
    byDay.set(k, arr);
  }
  const infoByDay = new Map<string, DutyExportDayInfo>();
  for (const i of opts.dayInfos) infoByDay.set(dayKey(new Date(i.date)), i);

  const hasRows = (d: Date) => (byDay.get(dayKey(d)) || []).length > 0;
  // Mặc định: in ĐỦ các ngày trong kỳ (kể cả ngày trống — giữ đúng "sổ").
  // skipEmpty=1: chỉ in ngày có phân công.
  let exportDays = opts.skipEmpty ? days.filter(hasRows) : days.slice();
  if (exportDays.length === 0) exportDays = [days[0]];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Hệ thống quản lý Hải quan Tà Lùng";
  wb.created = new Date();

  if (opts.includeCover !== false) {
    const cover = wb.addWorksheet("Bìa");
    writeCover(cover, exportDays[0].getFullYear(), coverUnit);
    setupPrint(cover);
  }

  const chunkSize = 4; // 2 cột khối × 2 dòng khối — đúng cách mẫu lặp vùng in
  const chunks: Date[][] = [];
  for (let i = 0; i < exportDays.length; i += chunkSize) chunks.push(exportDays.slice(i, i + chunkSize));

  chunks.forEach((chunk, sheetIdx) => {
    const ws = wb.addWorksheet(`Phân công ${sheetIdx + 1}`);
    // Độ rộng cột: hai nửa giống mẫu
    for (let c = 0; c < 6; c++) {
      const half = c < 3 ? 0 : 1;
      ws.getColumn(c + 1).width = DAY_COL_WIDTHS[half][c % 3];
    }
    // Nền chiều cao cho các dòng khối (đặt trước để khối nào ghi sau vẫn đúng)
    const starts: Array<{ row: number; col: number }> = [
      { row: 1, col: 1 },
      { row: 1, col: 4 },
      { row: 20, col: 1 },
      { row: 20, col: 4 },
    ];
    chunk.forEach((day, i) => {
      const pos = starts[i];
      writeDayBlock(
        ws,
        pos.row,
        pos.col,
        day,
        byDay.get(dayKey(day)) || [],
        opts.catalog,
        infoByDay.get(dayKey(day)),
        formTitle
      );
    });
    setupPrint(ws);
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

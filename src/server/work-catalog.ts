/**
 * YC-31 — Danh mục công việc thường xuyên (TX): đọc file Excel, chuẩn hóa,
 * sinh mã ổn định, so sánh phiên bản và nhập danh mục có kiểm soát.
 *
 * Nguyên tắc:
 * - Mỗi lần nhập = 1 phiên bản bất biến; phiên bản cũ chuyển SUPERSEDED (không xóa).
 * - Chống trùng 2 lớp: importHash + mã đầu việc ổn định theo nhóm.
 * - Không đoán "đổi tên": tên cũ biến mất = ngừng dùng, tên mới = dòng mới.
 * - Hệ số quy đổi: NULL = ô trống trong file; 0 = hệ số bằng 0 (giữ nguyên, không đổi thành NULL).
 * - Tên trùng trong CÙNG nhóm vẫn được giữ (mã khác nhau) — không bỏ dòng nào.
 */

import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import * as XLSX from "@e965/xlsx";
import { prisma } from "./db";
import { advisoryLock } from "./idempotency";
import { recordAuditEvent } from "./audit";

export const WORK_CATALOG_SHEET_HINT = "DM CV";
export const WORK_CATALOG_TITLE = "Danh mục công việc thường xuyên";

/** Tên sheet mới (file TX1 ngày 20/10/2026) — có khoảng trắng ở cuối. */
export const WORK_CATALOG_SHEET_V2 = "Danh mục công việc";

/**
 * Mã nhóm theo tên bộ phận trong file nguồn.
 * Nhóm trong Excel là CẤU TRÚC PHÂN LOẠI của file — KHÔNG tự động kết luận
 * tương ứng 1:1 với bộ phận nhân sự. Ánh xạ → org_units do quản trị xác nhận.
 */
export const DEPARTMENT_GROUP_CODES: Array<{ match: RegExp; code: string; label: string }> = [
  { match: /nghiệp vụ hải quan/i, code: "NV", label: "Nghiệp vụ Hải quan" },
  { match: /cntt/i, code: "CNTT", label: "CNTT" },
  { match: /điều tra cbl|cbl/i, code: "CBL", label: "Điều tra, chống buôn lậu" },
  { match: /phúc tập/i, code: "PT", label: "Phúc tập & KT STQ" },
  { match: /th\s*&\s*báo cáo|tổng hợp\s*&\s*báo cáo/i, code: "TH", label: "Tổng hợp & Báo cáo" },
  { match: /công tác đảng/i, code: "DANG", label: "Công tác Đảng" },
];

export function resolveGroupCode(department: string): { code: string; label: string } | null {
  const found = DEPARTMENT_GROUP_CODES.find((g) => g.match.test(department));
  return found ? { code: found.code, label: found.label } : null;
}

export interface ParsedCatalogEntry {
  code: string;
  department: string;
  departmentOrder: number;
  groupCode: string;
  title: string;
  /** Hệ số quy đổi trong file: null = ô trống; 0 = hệ số bằng 0. */
  convertFactor: number | null;
  sortOrder: number;
  sourceRow: number;
}

export interface ParsedCatalog {
  sheetName: string;
  entries: ParsedCatalogEntry[];
  departments: Array<{ name: string; order: number; count: number; groupCode: string; groupLabel: string }>;
  errors: Array<{ row: number; message: string }>;
  /** Tên trùng trong CÙNG nhóm — vẫn được giữ, chỉ cảnh báo. */
  duplicates: Array<{ department: string; title: string; rows: number[] }>;
  crossDepartmentDuplicates: Array<{ title: string; departments: string[] }>;
  totalRowsScanned: number;
  importHash: string;
}

export interface CatalogDiff {
  newEntries: Array<{ department: string; title: string }>;
  removedEntries: Array<{ department: string; title: string; status: string }>;
  unchangedCount: number;
  unchangedHash: boolean;
}

const MAX_ENTRIES = 2000;
const MAX_TITLE_LENGTH = 500;

export function normalizeCatalogText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeImportHash(entries: ParsedCatalogEntry[]): string {
  const lines = entries.map(
    (e) => `${e.departmentOrder}\t${e.department}\t${e.groupCode}\t${e.sortOrder}\t${e.title}\t${
      e.convertFactor === null ? "" : String(e.convertFactor)
    }`
  );
  return crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
}

/**
 * Mã đầu việc ổn định theo nhóm: `<GROUP>-<số thứ tự 2 chữ số>`.
 * NV-01 … NV-174 · CNTT-01 … CNTT-05 · CBL-01 … CBL-57 · PT-01 … PT-02
 * TH-01 … TH-102 · DANG-01 … DANG-08.
 * Mã không đổi khi đầu việc đã được liên kết với công việc.
 */
export function computeEntryCode(groupCode: string, ordinal: number): string {
  return `${groupCode}-${String(ordinal).padStart(2, "0")}`;
}

/** Mã cũ (hash) — giữ để đọc được phiên bản đã nhập trước khi chuyển sang mã theo nhóm. */
export function computeLegacyEntryCode(department: string, title: string): string {
  const base = `${normalizeCatalogText(department)}\u0000${normalizeCatalogText(title)}`;
  return `TX-${crypto.createHash("sha256").update(base, "utf8").digest("hex").slice(0, 8).toUpperCase()}`;
}

interface RawRow {
  row: number;
  a: string;
  b: string;
  c: string;
  cNumeric: number | null;
  cHasValue: boolean;
}

/** Đọc sheet dữ liệu từ buffer .xls (OLE2/BIFF) hoặc .xlsx (zip). */
function readSheetRows(buffer: Buffer, sheetFilter?: (name: string) => boolean): {
  sheetName: string;
  rows: RawRow[];
} {
  // .xlsx bắt đầu bằng chữ ký "PK"; .xls cũ bắt đầu bằng 0xD0CF11E0.
  const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle2 =
    buffer.length > 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;

  if (!isZip && !isOle2) {
    throw Object.assign(new Error("Tệp không phải Excel hợp lệ (.xls hoặc .xlsx)"), {
      statusCode: 400,
    });
  }

  if (isZip) {
    throw Object.assign(
      new Error("Tệp .xlsx phải được xử lý bằng luồng chuẩn — hãy dùng tệp .xls gốc"),
      { statusCode: 400 }
    );
  }

  // SheetJS đọc được cả BIFF8 (.xls) và zip (.xlsx); dùng nhánh .xls cho file gốc.
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false, cellNF: false, cellText: true });
  const sheetName =
    (sheetFilter && wb.SheetNames.find(sheetFilter)) || wb.SheetNames[0];
  if (!sheetName) {
    throw Object.assign(new Error("File Excel không có sheet dữ liệu"), { statusCode: 400 });
  }
  const ws = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  }) as string[][];

  const rows: RawRow[] = matrix.map((r, idx) => {
    const cell = ws[XLSX.utils.encode_cell({ r: idx, c: 2 })];
    const rawText = normalizeCatalogText(r?.[2]);
    const cHasValue = !!cell && !(cell.t === "s" && String(cell.v).trim() === "");
    const cNumeric =
      cell && cell.t === "n" && typeof cell.v === "number" ? cell.v : null;
    return {
      row: idx + 1,
      a: normalizeCatalogText(r?.[0]),
      b: normalizeCatalogText(r?.[1]),
      c: rawText,
      cNumeric,
      cHasValue,
    };
  });

  return { sheetName, rows };
}

/**
 * Đọc sheet "Danh mục công việc" của file TX:
 *  - Cột A: tên bộ phận (chỉ ghi ở dòng đầu của khối, hoặc dòng tiêu đề nhóm).
 *  - Cột B: nội dung nhiệm vụ.
 *  - Cột C: hệ số quy đổi (trống = NULL; 0 = giữ 0).
 *
 * Bỏ dòng trống; giữ nguyên dấu tiếng Việt; giữ TÊN TRÙNG trong cùng nhóm
 * (mỗi dòng là một đầu việc riêng với mã riêng).
 */
export async function parseWorkCatalogWorkbook(buffer: Buffer): Promise<ParsedCatalog> {
  const { sheetName, rows } = readSheetRows(
    buffer,
    (n) => n.trim().toUpperCase().includes(WORK_CATALOG_SHEET_V2.toUpperCase())
  );

  const entries: ParsedCatalogEntry[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const duplicatesMap = new Map<string, number[]>();
  const departments: Array<{
    name: string;
    order: number;
    count: number;
    groupCode: string;
    groupLabel: string;
  }> = [];

  let currentDepartment = "";
  let currentGroup: { code: string; label: string } | null = null;
  let departmentOrder = -1;
  const groupOrdinal = new Map<string, number>();
  let scanned = 0;

  for (const r of rows) {
    const titleCell = r.b;

    // Dòng tiêu đề CỘT (dòng 1 của file nguồn): cột A mang tên bộ phận đầu tiên,
    // cột B/C là nhãn cột — KHÔNG phải đầu việc.
    const isColumnHeader =
      r.row === 1 && /hệ số|nội dung nhiệm vụ|bộ phận/i.test(`${r.b} ${r.c}`);

    // 1) Nhận diện nhóm TRƯỚC — dòng tiêu đề nhóm (cột A có tên, cột B trống) vẫn mở nhóm mới.
    if (r.a && r.a !== currentDepartment) {
      const group = resolveGroupCode(r.a);
      if (!group) {
        errors.push({
          row: r.row,
          message: `Không xác định được mã nhóm cho bộ phận "${r.a}" — cần Hải quan xác nhận`,
        });
        currentDepartment = r.a;
        currentGroup = null;
        continue;
      }
      currentDepartment = r.a;
      currentGroup = group;
      departmentOrder += 1;
      groupOrdinal.set(group.code, 0);
      departments.push({
        name: currentDepartment,
        order: departmentOrder,
        count: 0,
        groupCode: group.code,
        groupLabel: group.label,
      });
    }

    if (isColumnHeader) continue; // dòng tiêu đề cột — không phải đầu việc
    if (!titleCell) continue; // dòng tiêu đề khối bộ phận (không phải đầu việc)

    if (!currentGroup) {
      errors.push({
        row: r.row,
        message: "Đầu việc chưa xác định được nhóm bộ phận (cột A trống)",
      });
      continue;
    }
    scanned++;
    if (titleCell.length > MAX_TITLE_LENGTH) {
      errors.push({ row: r.row, message: `Tên đầu việc vượt quá ${MAX_TITLE_LENGTH} ký tự` });
      continue;
    }

    // Hệ số: ô trống → null; ô có 0 → 0 (không chuyển thành null).
    let convertFactor: number | null = null;
    if (r.cHasValue) {
      if (r.cNumeric !== null) {
        convertFactor = r.cNumeric;
      } else {
        const n = Number(r.c.replace(/\s/g, "").replace(",", "."));
        if (!Number.isNaN(n)) convertFactor = n;
        else
          errors.push({
            row: r.row,
            message: `Hệ số quy đổi không phải số: "${r.c}"`,
          });
      }
    }

    const nextOrdinal = (groupOrdinal.get(currentGroup.code) || 0) + 1;
    groupOrdinal.set(currentGroup.code, nextOrdinal);
    const code = computeEntryCode(currentGroup.code, nextOrdinal);

    entries.push({
      code,
      department: currentDepartment,
      departmentOrder,
      groupCode: currentGroup.code,
      title: titleCell,
      convertFactor,
      sortOrder: nextOrdinal,
      sourceRow: r.row,
    });
    const dept = departments[departments.length - 1];
    if (dept) dept.count += 1;

    const dupKey = `${currentDepartment}\u0000${titleCell}`;
    const dupRows = duplicatesMap.get(dupKey) || [];
    dupRows.push(r.row);
    duplicatesMap.set(dupKey, dupRows);
  }

  // Tên trùng trong cùng nhóm: hợp lệ (mã khác nhau) — chỉ cảnh báo, KHÔNG chặn import.
  const duplicates = [...duplicatesMap.entries()]
    .filter(([, dupRows]) => dupRows.length > 1)
    .map(([key, dupRows]) => {
      const [department, title] = key.split("\u0000");
      return { department, title, rows: dupRows };
    });

  // Trùng tên giữa các nhóm khác nhau: được phép (nghiệp vụ riêng), chỉ báo cáo.
  const byTitle = new Map<string, Set<string>>();
  for (const e of entries) {
    const set = byTitle.get(e.title) || new Set<string>();
    set.add(e.department);
    byTitle.set(e.title, set);
  }
  const crossDepartmentDuplicates = [...byTitle.entries()]
    .filter(([, depts]) => depts.size > 1)
    .map(([title, depts]) => ({ title, departments: [...depts] }));

  if (entries.length === 0) {
    errors.push({ row: 0, message: "Không đọc được đầu việc nào từ sheet dữ liệu" });
  }
  if (entries.length > MAX_ENTRIES) {
    errors.push({ row: 0, message: `File có quá ${MAX_ENTRIES} đầu việc — kiểm tra lại đúng file danh mục` });
  }

  return {
    sheetName,
    entries,
    departments,
    errors,
    duplicates,
    crossDepartmentDuplicates,
    totalRowsScanned: scanned,
    importHash: computeImportHash(entries),
  };
}

export async function getActiveWorkCatalogVersion() {
  return prisma.workCatalogVersion.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { importedAt: "desc" },
    include: { importedBy: { select: { id: true, fullName: true, code: true } } },
  });
}

/**
 * Chuyển chế độ chọn đầu việc của phiên bản đang áp dụng.
 * MAPPED: chỉ nhóm đã ánh xạ + kích hoạt cho bộ phận.
 * ALL: mọi cán bộ chọn được mọi nhóm (dùng khi Hải quan chưa xác nhận ánh xạ bộ phận).
 */
export async function setCatalogSelectionMode(
  versionId: string,
  selectionMode: "MAPPED" | "ALL",
  actorAccountId: string
) {
  const version = await prisma.workCatalogVersion.update({
    where: { id: versionId },
    data: { selectionMode },
    select: { id: true, code: true, selectionMode: true },
  });
  await recordAuditEvent({
    actorId: actorAccountId,
    action: "WORK_CATALOG_SELECTION_MODE_UPDATE",
    resourceType: "WorkCatalogVersion",
    resourceId: version.id,
    newData: { selectionMode: version.selectionMode, versionCode: version.code },
  });
  return version;
}

export function buildCatalogDiff(
  activeEntries: Array<{ department: string; title: string; status: string }>,
  parsed: ParsedCatalog,
  activeHash?: string | null
): CatalogDiff {
  const keyOf = (department: string, title: string) => `${department}\u0000${title}`;
  const activeMap = new Map(activeEntries.map((e) => [keyOf(e.department, e.title), e]));
  const parsedMap = new Map(parsed.entries.map((e) => [keyOf(e.department, e.title), e]));

  const newEntries = parsed.entries
    .filter((e) => !activeMap.has(keyOf(e.department, e.title)))
    .map((e) => ({ department: e.department, title: e.title }));
  const removedEntries = activeEntries
    .filter((e) => !parsedMap.has(keyOf(e.department, e.title)))
    .map((e) => ({ department: e.department, title: e.title, status: e.status }));
  const unchangedCount = parsed.entries.length - newEntries.length;

  return {
    newEntries,
    removedEntries,
    unchangedCount,
    unchangedHash: !!activeHash && activeHash === parsed.importHash,
  };
}

// ----------------------------------------------------
// YC-31 (bổ sung) — Kích hoạt danh mục TX THEO BỘ PHẬN
// Không dùng trạng thái ACTIVE của phiên bản để ẩn mẫu cũ toàn hệ thống.
// Chỉ bộ phận đã được ánh xạ + kích hoạt mới chuyển sang nguồn TX.
// ----------------------------------------------------

export interface ActivatedCatalogDepartment {
  department: string;
  /** Đơn vị được ánh xạ (có thể null khi bản danh mục ở chế độ ALL cho mọi bộ phận). */
  unitId: string | null;
  unitCode: string | null;
  unitName: string | null;
}

export interface CatalogActivationForPerson {
  activeVersionId: string | null;
  unitIds: string[];
  departments: ActivatedCatalogDepartment[];
  /** true khi bộ phận của cán bộ đã chuyển sang TX và có ít nhất 1 đầu việc đang dùng. */
  activated: boolean;
  /** Chế độ chọn của phiên bản đang áp dụng: MAPPED (theo bộ phận) | ALL (mọi nhóm). */
  selectionMode: "MAPPED" | "ALL";
}

export interface CatalogDepartmentStatus {
  department: string;
  departmentOrder: number;
  entryCount: number;
  activeEntryCount: number;
  unitId: string | null;
  unitCode: string | null;
  unitName: string | null;
  isActive: boolean;
  note: string | null;
  confirmedAt: Date | null;
  updatedAt: Date | null;
  groupCode: string;
  groupLabel: string;
  /** Nhóm chưa được gán đơn vị → trạng thái "chưa xác định", không chặn import/kiểm tra. */
  mappingState: "MAPPED" | "UNMAPPED";
}

/** Đơn vị đang công tác (chỉ assignment còn hiệu lực). */
export async function getPersonUnitIds(personId: string): Promise<string[]> {
  if (!personId) return [];
  const now = new Date();
  const rows = await prisma.personAssignment.findMany({
    where: {
      personId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    select: { unitId: true },
  });
  return [...new Set(rows.map((r) => r.unitId))];
}

/**
 * Trạng thái kích hoạt TX của một cán bộ, xác định theo đơn vị thực tế của cán bộ
 * (không theo đơn vị của người thao tác). Lãnh đạo tạo hộ cán bộ nào thì áp dụng
 * đúng bộ phận của cán bộ đó.
 */
export async function getCatalogActivationForPerson(
  personId: string
): Promise<CatalogActivationForPerson> {
  const [activeVersion, unitIds] = await Promise.all([
    prisma.workCatalogVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { importedAt: "desc" },
      select: { id: true, selectionMode: true },
    }),
    getPersonUnitIds(personId),
  ]);

  const selectionMode: "MAPPED" | "ALL" =
    activeVersion?.selectionMode === "ALL" ? "ALL" : "MAPPED";

  const empty: CatalogActivationForPerson = {
    activeVersionId: activeVersion?.id || null,
    unitIds,
    departments: [],
    activated: false,
    selectionMode,
  };
  if (!activeVersion) return empty;

  // F17: khi phiên ban danh muc o che do ALL, MOI bo phan deu duoc chon duoc nhom
  // (Hai quan chua xac nhan anh xa bo phan) => phai kich hoat, khong de "chua kich hoat".
  if (selectionMode === "ALL") {
    const deptCounts = await prisma.workCatalogEntry.groupBy({
      by: ["department"],
      where: { versionId: activeVersion.id, status: "ACTIVE" },
      _count: { _all: true },
    });
    const allDepartments = deptCounts
      .filter((c) => c._count._all > 0)
      .map((c) => ({
        department: c.department,
        unitId: unitIds[0] || null,
        unitCode: null,
        unitName: null,
      }));
    return { ...empty, departments: allDepartments, activated: allDepartments.length > 0 };
  }

  const mappings = await prisma.workCatalogDepartmentMapping.findMany({
    where: { isActive: true, unitId: { in: unitIds } },
    include: { unit: { select: { id: true, code: true, name: true } } },
    orderBy: { department: "asc" },
  });
  if (mappings.length === 0) return empty;
  if (unitIds.length === 0) return empty;

  // Chỉ coi là đã chuyển khi nhóm thực sự còn đầu việc ACTIVE trong phiên bản đang áp dụng.
  // Tránh trường hợp khóa mẫu cũ nhưng không có lựa chọn thay thế.
  const counts = await prisma.workCatalogEntry.groupBy({
    by: ["department"],
    where: {
      versionId: activeVersion.id,
      status: "ACTIVE",
      department: { in: mappings.map((m) => m.department) },
    },
    _count: { _all: true },
  });
  const withEntries = new Set(counts.filter((c) => c._count._all > 0).map((c) => c.department));

  const departments: ActivatedCatalogDepartment[] = mappings
    .filter((m) => m.unitId && withEntries.has(m.department))
    .map((m) => ({
      department: m.department,
      unitId: m.unitId as string,
      unitCode: m.unit?.code || null,
      unitName: m.unit?.name || null,
    }));

  return { ...empty, departments, activated: departments.length > 0 };
}

/**
 * Mẫu cũ (48 mẫu) còn được chọn khi tạo mới?
 * - Chưa có danh mục TX đang áp dụng → còn.
 * - Bộ phận chưa được kích hoạt → còn.
 * - Bộ phận đã kích hoạt và có đầu việc TX thay thế → không.
 * Đầu việc lịch sử vẫn giữ liên kết, không phụ thuộc hàm này.
 */
export async function isLegacyTemplateSelectableForPerson(personId: string): Promise<boolean> {
  const activation = await getCatalogActivationForPerson(personId);
  return !activation.activated;
}

export interface SelectableCatalogResult {
  activation: CatalogActivationForPerson;
  entries: Array<{
    id: string;
    versionId: string;
    code: string;
    department: string;
    departmentOrder: number;
    groupCode: string;
    title: string;
    convertFactor: number | null;
    sortOrder: number;
    sourceRow: number;
    status: string;
  }>;
}

/** Chuyển Decimal của Prisma về number cho API (hệ số nguồn là số thập phân đơn giản). */
function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Đầu việc TX mà một cán bộ được phép chọn.
 *
 * - `scope="dept"` (mặc định): chỉ nhóm đã ánh xạ + kích hoạt cho đơn vị của cán bộ.
 * - `scope="all"`: xem/tìm kiếm TOÀN BỘ danh mục 6 nhóm (dùng để tra cứu chung);
 *   KHÔNG mở rộng quyền xem dữ liệu công việc cá nhân của người khác.
 */
export async function getSelectableCatalogEntriesForPerson(
  personId: string,
  filters: {
    department?: string | null;
    q?: string | null;
    scope?: "dept" | "all";
    /** YC-38B: lọc theo danh sách id cụ thể (gần đây / ghim yêu thích). */
    ids?: string[] | null;
  } = {}
): Promise<SelectableCatalogResult> {
  const activation = await getCatalogActivationForPerson(personId);
  if (!activation.activeVersionId) {
    return { activation, entries: [] };
  }

  // scope=all: tra cứu TOÀN BỘ danh mục 6 nhóm (dùng để xem/tìm kiếm danh mục chung).
  // scope=dept: chỉ nhóm đã ánh xạ + kích hoạt cho bộ phận của cán bộ.
  // Khi phiên bản đang ở chế độ ALL, mặc định cho phép chọn mọi nhóm
  // (Hải quan chưa xác nhận ánh xạ bộ phận → không đình trệ việc dùng danh mục).
  const scope: "dept" | "all" =
    filters.scope === "all" || activation.selectionMode === "ALL" ? "all" : "dept";

  const departments = activation.departments.map((d) => d.department);

  if (scope === "dept" && departments.length === 0) {
    return { activation, entries: [] };
  }
  if (filters.department && scope === "dept" && !departments.includes(filters.department)) {
    return { activation, entries: [] };
  }
  const q = (filters.q || "").trim();
  // F17: ids rỗng hoặc null => KHÔNG lọc theo id.
  // Trước đây ids=null biến thành mảng rỗng => điều kiện "id IN ()" => danh mục rỗng.
  const ids =
    filters.ids == null
      ? null
      : (filters.ids || []).filter((x) => typeof x === "string" && x.length > 0);

  const entries = await prisma.workCatalogEntry.findMany({
    where: {
      versionId: activation.activeVersionId,
      status: "ACTIVE",
      ...(ids !== null ? { id: { in: ids } } : {}),
      ...(scope === "dept"
        ? { department: filters.department ? filters.department : { in: departments } }
        : filters.department
          ? { department: filters.department }
          : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { code: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ departmentOrder: "asc" }, { sortOrder: "asc" }],
  });

  return {
    activation,
    entries: entries.map((e) => ({
      id: e.id,
      versionId: e.versionId,
      code: e.code,
      department: e.department,
      departmentOrder: e.departmentOrder,
      groupCode: e.groupCode,
      title: e.title,
      convertFactor: toNumberOrNull(e.convertFactor),
      sortOrder: e.sortOrder,
      sourceRow: e.sourceRow,
      status: e.status,
    })),
  };
}

/**
 * Kiểm tra một đầu việc TX có được phép GẮN MỚI cho cán bộ hay không.
 * Trả về null nếu hợp lệ; ngược lại là thông báo lỗi nghiệp vụ.
 */
export async function getCatalogEntrySelectionError(
  personId: string,
  entry: { id: string; department: string; status: string; version: { status: string } }
): Promise<string | null> {
  if (entry.status !== "ACTIVE" || entry.version.status !== "ACTIVE") {
    return "Đầu việc này đã ngừng áp dụng hoặc thuộc phiên bản cũ — không thể chọn để tạo mới";
  }
  const activation = await getCatalogActivationForPerson(personId);
  // Chế độ ALL: mọi cán bộ chọn được mọi nhóm (ánh xạ bộ phận chưa được Hải quan xác nhận).
  if (activation.selectionMode === "ALL") return null;
  if (activation.unitIds.length === 0) {
    return "Cán bộ chưa được gán bộ phận đang công tác — không thể chọn đầu việc TX";
  }
  const matched = activation.departments.some((d) => d.department === entry.department);
  if (!matched) {
    return `Nhóm "${entry.department}" chưa được kích hoạt cho bộ phận của cán bộ — không thể chọn`;
  }
  return null;
}

/**
 * Bảng ánh xạ 6 nhóm nguồn → org_units thật, kèm trạng thái kích hoạt.
 * Dùng cho màn hình quản trị và báo cáo đối chiếu với Hải quan.
 */
export async function getCatalogDepartmentStatuses(versionId?: string | null): Promise<{
  version: { id: string; code: string; status: string; importedAt: Date } | null;
  departments: CatalogDepartmentStatus[];
}> {
  const version = versionId
    ? await prisma.workCatalogVersion.findUnique({
        where: { id: versionId },
        select: { id: true, code: true, status: true, importedAt: true },
      })
    : await prisma.workCatalogVersion.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { importedAt: "desc" },
        select: { id: true, code: true, status: true, importedAt: true },
      });

  if (!version) return { version: null, departments: [] };

  const [entries, mappings] = await Promise.all([
    prisma.workCatalogEntry.findMany({
      where: { versionId: version.id },
      select: { department: true, departmentOrder: true, status: true, groupCode: true },
      orderBy: { departmentOrder: "asc" },
    }),
    prisma.workCatalogDepartmentMapping.findMany({
      include: { unit: { select: { code: true, name: true } } },
    }),
  ]);

  const map = new Map<string, CatalogDepartmentStatus>();
  for (const e of entries) {
    const cur =
      map.get(e.department) ||
      ({
        department: e.department,
        departmentOrder: e.departmentOrder,
        entryCount: 0,
        activeEntryCount: 0,
        unitId: null,
        unitCode: null,
        unitName: null,
        isActive: false,
        note: null,
        confirmedAt: null,
        updatedAt: null,
        groupCode: e.groupCode,
        groupLabel: resolveGroupCode(e.department)?.label || e.groupCode,
        mappingState: "UNMAPPED",
      } satisfies CatalogDepartmentStatus);
    cur.entryCount += 1;
    if (e.status === "ACTIVE") cur.activeEntryCount += 1;
    map.set(e.department, cur);
  }

  for (const m of mappings) {
    const cur = map.get(m.department);
    if (!cur) continue;
    cur.unitId = m.unitId;
    cur.unitCode = m.unit?.code || null;
    cur.unitName = m.unit?.name || null;
    cur.isActive = m.isActive;
    cur.note = m.note;
    cur.confirmedAt = m.confirmedAt;
    cur.updatedAt = m.updatedAt;
    cur.mappingState = m.unitId ? "MAPPED" : "UNMAPPED";
  }

  return {
    version,
    departments: [...map.values()].sort((a, b) => a.departmentOrder - b.departmentOrder),
  };
}

function buildVersionCode(sequence: number): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return `TX-${ymd}-${String(sequence).padStart(2, "0")}`;
}

export interface ImportCatalogParams {
  parsed: ParsedCatalog;
  sourceFileName: string;
  note?: string | null;
  userId: string;
  actorAccountId: string;
  expectedHash?: string | null;
}

export async function importWorkCatalog(params: ImportCatalogParams) {
  const { parsed, sourceFileName, note, userId, actorAccountId, expectedHash } = params;

  if (parsed.errors.length > 0) {
    throw Object.assign(
      new Error("File còn lỗi — không thể nhập. Xem báo cáo chi tiết để sửa file nguồn."),
      { statusCode: 422 }
    );
  }
  if (!expectedHash) {
    throw Object.assign(
      new Error("Phải đọc và xem trước danh mục trước khi xác nhận nhập (thiếu importHash)"),
      { statusCode: 400 }
    );
  }
  if (expectedHash !== parsed.importHash) {
    throw Object.assign(
      new Error("Nội dung tệp đã thay đổi so với bước xem trước — hãy đọc lại tệp trước khi xác nhận"),
      { statusCode: 409 }
    );
  }

  return prisma.$transaction(async (tx) => {
    await advisoryLock(tx, "work-catalog:import");

    const active = await tx.workCatalogVersion.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { importedAt: "desc" },
    });
    if (active && active.importHash === parsed.importHash) {
      throw Object.assign(
        new Error("Danh mục không thay đổi so với phiên bản đang áp dụng — không tạo phiên bản mới"),
        { statusCode: 409 }
      );
    }

    const todayPrefix = buildVersionCode(0).slice(0, -3);
    const sameDayCount = await tx.workCatalogVersion.count({
      where: { code: { startsWith: todayPrefix } },
    });
    const code = buildVersionCode(sameDayCount + 1);

    if (active) {
      await tx.workCatalogVersion.update({
        where: { id: active.id },
        data: { status: "SUPERSEDED" },
      });
    }

    const version = await tx.workCatalogVersion.create({
      data: {
        code,
        title: WORK_CATALOG_TITLE,
        sourceFileName,
        sourceSheet: parsed.sheetName,
        entryCount: parsed.entries.length,
        importHash: parsed.importHash,
        status: "ACTIVE",
        note: note?.trim() || null,
        importedById: userId,
        entries: {
          create: parsed.entries.map((e) => ({
            code: e.code,
            department: e.department,
            departmentOrder: e.departmentOrder,
            groupCode: e.groupCode,
            title: e.title,
            convertFactor: e.convertFactor === null ? null : new Prisma.Decimal(e.convertFactor),
            sortOrder: e.sortOrder,
            sourceRow: e.sourceRow,
          })),
        },
      },
      include: { importedBy: { select: { id: true, fullName: true, code: true } } },
    });

    await recordAuditEvent({
      actorId: actorAccountId,
      action: "WORK_CATALOG_IMPORT",
      resourceType: "WorkCatalogVersion",
      resourceId: version.id,
      newData: {
        code: version.code,
        sourceFileName,
        sourceSheet: parsed.sheetName,
        entryCount: version.entryCount,
        departments: parsed.departments,
        previousVersionId: active?.id || null,
        unresolvedHash: parsed.importHash,
      },
    });

    return version;
  });
}

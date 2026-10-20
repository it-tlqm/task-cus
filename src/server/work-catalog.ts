/**
 * YC-31 — Danh mục công việc thường xuyên (TX): đọc file Excel, chuẩn hóa,
 * sinh mã ổn định, so sánh phiên bản và nhập danh mục có kiểm soát.
 *
 * Nguyên tắc:
 * - Mỗi lần nhập = 1 phiên bản bất biến; phiên bản cũ chuyển SUPERSEDED (không xóa).
 * - Chống trùng 3 lớp: importHash, unique (version, department, title), mã ổn định.
 * - Không đoán "đổi tên": tên cũ biến mất = ngừng dùng, tên mới = dòng mới.
 */

import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "./db";
import { advisoryLock } from "./idempotency";
import { recordAuditEvent } from "./audit";

export const WORK_CATALOG_SHEET_HINT = "DM CV";
export const WORK_CATALOG_TITLE = "Danh mục công việc thường xuyên";

export interface ParsedCatalogEntry {
  code: string;
  department: string;
  departmentOrder: number;
  title: string;
  sortOrder: number;
  sourceRow: number;
}

export interface ParsedCatalog {
  sheetName: string;
  entries: ParsedCatalogEntry[];
  departments: Array<{ name: string; order: number; count: number }>;
  errors: Array<{ row: number; message: string }>;
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

/** Mã đầu việc ổn định: băm (bộ phận + tên đã chuẩn hóa) — giữ nguyên qua các phiên bản. */
export function computeEntryCode(department: string, title: string): string {
  const base = `${normalizeCatalogText(department)}\u0000${normalizeCatalogText(title)}`;
  return `TX-${crypto.createHash("sha256").update(base, "utf8").digest("hex").slice(0, 8).toUpperCase()}`;
}

export function computeImportHash(entries: ParsedCatalogEntry[]): string {
  const lines = entries.map(
    (e) => `${e.departmentOrder}\t${e.department}\t${e.sortOrder}\t${e.title}`
  );
  return crypto.createHash("sha256").update(lines.join("\n"), "utf8").digest("hex");
}

/**
 * Đọc sheet "DM CV thường xuyên": cột A = bộ phận (chỉ ghi 1 lần đầu khối),
 * cột B = tên đầu việc. Bỏ dòng trống; giữ nguyên dấu tiếng Việt.
 */
export async function parseWorkCatalogWorkbook(buffer: Buffer): Promise<ParsedCatalog> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet =
    workbook.worksheets.find((ws) => ws.name.toUpperCase().includes(WORK_CATALOG_SHEET_HINT)) ||
    workbook.worksheets[0];
  if (!sheet) {
    throw Object.assign(new Error("File Excel không có sheet dữ liệu"), { statusCode: 400 });
  }

  const entries: ParsedCatalogEntry[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  const duplicatesMap = new Map<string, number[]>();
  const departments: Array<{ name: string; order: number; count: number }> = [];

  let currentDepartment = "";
  let departmentOrder = -1;
  let sortOrder = 0;
  let scanned = 0;

  const maxRow = Math.min(sheet.rowCount, 5000);
  for (let r = 1; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const rawA = row.getCell(1).value as any;
    const rawB = row.getCell(2).value as any;
    const departmentCell = normalizeCatalogText(
      rawA && typeof rawA === "object" ? rawA.text ?? rawA.result ?? "" : rawA
    );
    const titleCell = normalizeCatalogText(
      rawB && typeof rawB === "object" ? rawB.text ?? rawB.result ?? "" : rawB
    );

    if (!departmentCell && !titleCell) continue;
    scanned++;

    if (departmentCell && departmentCell !== currentDepartment) {
      currentDepartment = departmentCell;
      departmentOrder += 1;
      sortOrder = 0;
      departments.push({ name: currentDepartment, order: departmentOrder, count: 0 });
    }

    if (!titleCell) continue; // dòng tiêu đề khối bộ phận

    if (!currentDepartment) {
      errors.push({ row: r, message: "Đầu việc chưa xác định được bộ phận (cột A trống)" });
      continue;
    }
    if (titleCell.length > MAX_TITLE_LENGTH) {
      errors.push({ row: r, message: `Tên đầu việc vượt quá ${MAX_TITLE_LENGTH} ký tự` });
      continue;
    }

    sortOrder += 1;
    const code = computeEntryCode(currentDepartment, titleCell);
    entries.push({
      code,
      department: currentDepartment,
      departmentOrder,
      title: titleCell,
      sortOrder,
      sourceRow: r,
    });
    const dept = departments[departments.length - 1];
    if (dept) dept.count += 1;

    const dupKey = `${currentDepartment}\u0000${titleCell}`;
    const rows = duplicatesMap.get(dupKey) || [];
    rows.push(r);
    duplicatesMap.set(dupKey, rows);
  }

  const duplicates = [...duplicatesMap.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => {
      const [department, title] = key.split("\u0000");
      return { department, title, rows };
    });

  // Trùng tên giữa các bộ phận khác nhau: được phép (nghiệp vụ riêng), chỉ báo cáo.
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
    sheetName: sheet.name,
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
  unitId: string;
  unitCode: string | null;
  unitName: string | null;
}

export interface CatalogActivationForPerson {
  activeVersionId: string | null;
  unitIds: string[];
  departments: ActivatedCatalogDepartment[];
  /** true khi bộ phận của cán bộ đã chuyển sang TX và có ít nhất 1 đầu việc đang dùng. */
  activated: boolean;
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
      select: { id: true },
    }),
    getPersonUnitIds(personId),
  ]);

  const empty: CatalogActivationForPerson = {
    activeVersionId: activeVersion?.id || null,
    unitIds,
    departments: [],
    activated: false,
  };
  if (!activeVersion || unitIds.length === 0) return empty;

  const mappings = await prisma.workCatalogDepartmentMapping.findMany({
    where: { isActive: true, unitId: { in: unitIds } },
    include: { unit: { select: { id: true, code: true, name: true } } },
    orderBy: { department: "asc" },
  });
  if (mappings.length === 0) return empty;

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
    title: string;
    sortOrder: number;
    sourceRow: number;
    status: string;
  }>;
}

/** Đầu việc TX mà một cán bộ được phép chọn (đã lọc theo ánh xạ + kích hoạt bộ phận). */
export async function getSelectableCatalogEntriesForPerson(
  personId: string,
  filters: { department?: string | null; q?: string | null } = {}
): Promise<SelectableCatalogResult> {
  const activation = await getCatalogActivationForPerson(personId);
  if (!activation.activeVersionId || activation.departments.length === 0) {
    return { activation, entries: [] };
  }

  const departments = activation.departments.map((d) => d.department);
  if (filters.department && !departments.includes(filters.department)) {
    return { activation, entries: [] };
  }
  const q = (filters.q || "").trim();

  const entries = await prisma.workCatalogEntry.findMany({
    where: {
      versionId: activation.activeVersionId,
      status: "ACTIVE",
      department: filters.department ? filters.department : { in: departments },
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

  return { activation, entries };
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
      select: { department: true, departmentOrder: true, status: true },
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

  if (parsed.errors.length > 0 || parsed.duplicates.length > 0) {
    throw Object.assign(
      new Error("File còn lỗi hoặc đầu việc trùng trong cùng bộ phận — không thể nhập"),
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
            title: e.title,
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

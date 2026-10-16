/**
 * YC-11 — Nhập Danh mục sản phẩm QĐ1277 từ sheet "Danh mục sản phẩm" (bản công chức T9).
 * - Dòng A-số = sản phẩm (giữ nguyên cả dòng thiếu chi tiết do merge ô).
 * - Dòng A-chữ = tiêu đề phần → ProductGroup.
 * - Mã SP hệ thống sinh SP-2026-V1-NNNN (STT Excel trùng mỗi phần).
 * - Chạy lại an toàn: version đã có items thì bỏ qua.
 * - KHÔNG nhập điểm/số liệu cá nhân trong workbook.
 * Dùng: npx tsx scripts/import-product-catalog.ts --file "<xlsx>" [--apply]
 */
import ExcelJS from "exceljs";
import { prisma } from "../src/server/db";

const VERSION_CODE = "DM-SP-2026-V1";

function text(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "formula" in v) return v.result === null || v.result === undefined ? "" : String(v.result);
  if (typeof v === "object" && "richText" in v) return (v.richText as any[]).map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String((v as any).text);
  if (v instanceof Date) return "";
  return String(v);
}
function num(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "object" && "formula" in v) v = v.result;
  if (typeof v === "object") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const fileIdx = process.argv.indexOf("--file");
  const file = fileIdx >= 0 ? process.argv[fileIdx + 1] : "";
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Thieu --file <xlsx>");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Danh mục sản phẩm");
  if (!ws) throw new Error("Khong thay sheet Danh muc san pham");

  // Dò dòng header chứa STT/NHIỆM VỤ
  let headerRow = 0;
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const a = text(ws.getRow(r).getCell(1).value).trim().toUpperCase();
    const b = text(ws.getRow(r).getCell(2).value).trim().toUpperCase();
    if (a === "STT" && b.includes("NHIỆM VỤ")) { headerRow = r; break; }
  }
  if (!headerRow) throw new Error("Khong tim thay dong header STT/NHIEM VU");

  let phan = "Chung";
  let roman = "";
  let sub = "";
  let lastIntB = "";
  const groups = new Map<string, { code: string; title: string }>();
  const groupKey = () => `${phan} > ${roman}${sub ? " > " + sub : ""}`;
  const ensureGroup = () => {
    const key = groupKey();
    if (!groups.has(key)) {
      const code = `G-${groups.size + 1}`;
      groups.set(key, { code, title: key.slice(0, 200) });
    }
    return groups.get(key)!;
  };
  ensureGroup();
  const items: any[] = [];
  const isLetterHeader = (a: string) => /^(PHẦN|[A-ZĐ]\.|[IVXLCDM]+\.)/.test(a);
  const isDotted = (a: string) => /^\d+\.\d+(\.\d+)?$/.test(a);
  const isInteger = (a: string) => /^[0-9]+$/.test(a);
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const a = text(row.getCell(1).value).trim();
    if (!a) continue;
    const b = text(row.getCell(2).value).trim();
    if (!isInteger(a) && !isDotted(a)) {
      // Tiêu đề phần/nhóm (chữ): cập nhật đường dẫn phân cấp
      if (/^PHẦN/.test(a)) { phan = b ? `${a} ${b}`.slice(0, 120) : a.slice(0, 120); roman = ""; sub = ""; }
      else if (/^[IVXLCDM]+\./.test(a) && !isDotted(a)) { roman = b ? `${a} ${b}`.slice(0, 120) : a.slice(0, 120); sub = ""; }
      else if (isLetterHeader(a)) { sub = b ? `${a} ${b}`.slice(0, 120) : a.slice(0, 120); }
      else if (!b) { sub = a.slice(0, 120); }
      else continue; // dòng chú thích lẫn, bỏ qua
      ensureGroup();
      continue;
    }
    if (isInteger(a) && b) lastIntB = b.slice(0, 500);
    const g = ensureGroup();
    items.push({
      sourceRow: r,
      sourceStt: a,
      taskName: (b || lastIntB || `(Dòng ${r})`).slice(0, 500),
      detailWork: text(row.getCell(3).value).trim().slice(0, 1000) || null,
      outputProduct: text(row.getCell(4).value).trim().slice(0, 500) || null,
      groupName: text(row.getCell(5).value).trim().slice(0, 100) || null,
      maxScore: num(row.getCell(6).value),
      pointValue: num(row.getCell(7).value),
      convertFactor: num(row.getCell(8).value),
      notes: text(row.getCell(9).value).trim().slice(0, 500) || null,
      sectionCode: g.code,
      sectionTitle: g.title,
    });
  }

  console.log(`HEADER-ROW: ${headerRow}, SECTIONS: ${groups.size}, PRODUCT-ROWS: ${items.length}`);
  if (!apply) { console.log("DRY-RUN (them --apply de ghi that)"); return; }

  const existing = await prisma.productCatalogVersion.findUnique({
    where: { code: VERSION_CODE },
  });
  const version = existing || await prisma.productCatalogVersion.create({
    data: {
      code: VERSION_CODE,
      title: "Danh mục sản phẩm/công việc theo QĐ 1277/QĐ-BTC — bản công chức T9/2026",
      sourceFile: file.split(/[/\\]/).pop() || file,
      sourceSheet: "Danh mục sản phẩm",
      qdRef: "1277/QĐ-BTC ngày 27/5/2026",
      status: "ACTIVE",
    },
  });

  const existingGroups = await prisma.productGroup.findMany({ where: { versionId: version.id } });
  const groupIdByCode = new Map<string, string>(existingGroups.map((g) => [g.code, g.id]));
  let order = existingGroups.length;
  for (const g of groups.values()) {
    if (groupIdByCode.has(g.code)) continue;
    order++;
    const rec = await prisma.productGroup.create({
      data: { versionId: version.id, code: g.code, title: g.title, sortOrder: order },
    });
    groupIdByCode.set(g.code, rec.id);
  }

  // Chạy lại an toàn + nhanh: nạp mã đã có một lần, createMany theo lô cho phần thiếu
  const haveCodes = new Set(
    (await prisma.productItem.findMany({ where: { versionId: version.id }, select: { code: true } })).map((x) => x.code)
  );
  const rows = items.map((it, idx) => ({
    versionId: version.id,
    groupId: groupIdByCode.get(it.sectionCode) || null,
    code: `SP-2026-V1-${String(idx + 1).padStart(4, "0")}`,
    sourceRow: it.sourceRow,
    sourceStt: it.sourceStt,
    taskName: it.taskName,
    detailWork: it.detailWork,
    outputProduct: it.outputProduct,
    groupName: it.groupName,
    maxScore: it.maxScore,
    pointValue: it.pointValue,
    convertFactor: it.convertFactor,
    notes: it.notes,
    status: "ACTIVE",
  }));
  const missing = rows.filter((r) => !haveCodes.has(r.code));
  const CHUNK = 200;
  for (let i = 0; i < missing.length; i += CHUNK) {
    await prisma.productItem.createMany({ data: missing.slice(i, i + CHUNK) });
    console.log(`CHUNK ${Math.min(i + CHUNK, missing.length)}/${missing.length}`);
  }
  await prisma.auditEvent.create({
    data: {
      action: "PRODUCT_CATALOG_IMPORTED_YC11",
      resourceType: "ProductCatalogVersion",
      resourceId: version.id,
      newData: { version: VERSION_CODE, groups: groups.size, items: items.length },
    },
  });
  console.log(`IMPORTED: version=${VERSION_CODE} groups=${groupIdByCode.size} new-items=${missing.length}`);
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); }).finally(() => process.exit(0));

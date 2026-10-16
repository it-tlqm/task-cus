import ExcelJS from "exceljs";
function t(v: any): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "formula" in v) return `[F:${v.formula}]=>${v.result ?? "?"}`;
  if (typeof v === "object" && "richText" in v) return (v.richText as any[]).map((x: any) => x.text).join("|").slice(0, 60);
  if (typeof v === "object" && "text" in v) return String((v as any).text);
  if (v instanceof Date) return "DATE";
  return String(v).slice(0, 60);
}
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(process.argv[2]);
  const ws = wb.getWorksheet("Kế hoạch tháng 9")!;
  console.log(`ROWS=${ws.rowCount} COLS=${ws.columnCount} MERGES=${JSON.stringify((ws as any).model.merges)}`);
  for (let r = 13; r <= ws.rowCount; r++) {
    const c = [1, 2, 3, 4, 5, 6].map((x) => t(ws.getRow(r).getCell(x).value));
    console.log(`R${r}: ${JSON.stringify(c)}`);
  }
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });

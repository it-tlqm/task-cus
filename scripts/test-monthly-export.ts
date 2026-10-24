import ExcelJS from "exceljs";
import fs from "fs";
import { buildMonthlyWorkbook } from "../src/server/monthly-export";
import { buildMonthlyPlan02C } from "../src/server/monthly-plan-02c";
import { MISSING_TEXT, pickPrimaryAssignment } from "../src/server/person-assignment";

const OUT_DIR = "C:\\Users\\thanhnx\\AppData\\Local\\Temp\\opencode";
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    console.log(`[PASS] ${label}`);
  } else {
    failures++;
    console.log(`[FAIL] ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text ?? "").join("");
    if ("formula" in value || "sharedFormula" in value) {
      const result = (value as { result?: unknown }).result;
      return result === null || result === undefined ? "" : String(result);
    }
    if ("text" in value) return String((value as { text?: unknown }).text ?? "");
  }
  return String(value);
}

const ITEMS = [
  { title: "Kiểm tra PTVT xuất cảnh", outputText: "3 PTVT", evidenceRef: "BB-01", factor: 5.4, assignedQty: 3, completedQty: 3, dueDate: new Date("2026-10-25"), completedDate: new Date("2026-10-25"), lateCount: 0, reworkCount: 0 },
  { title: "Xử lý văn bản CCES", outputText: "Đã xử lý 100 văn bản", evidenceRef: null, factor: 2.3, assignedQty: 100, completedQty: 95, dueDate: new Date("2026-10-25"), completedDate: new Date("2026-10-26"), lateCount: 0, reworkCount: 0 },
  { title: "Việc chưa có mã SP", outputText: null, evidenceRef: null, factor: null, assignedQty: null, completedQty: 1, dueDate: null, completedDate: null, lateCount: 0, reworkCount: 1 },
];

const PERSON = {
  fullName: "NGƯỜI KIỂM THỬ",
  positionTitle: "Công chức nghiệp vụ Hải quan",
  unitName: "Hải quan cửa khẩu Quốc tế Tà Lùng",
  jobPositionTitle: null as string | null,
};

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // ---------------------------------------------------------------- Bảng 1 + 01A
  const out = `${OUT_DIR}\\test-monthly-export.xlsx`;
  const buf = await buildMonthlyWorkbook(ITEMS, PERSON, 2026, 10);
  fs.writeFileSync(out, buf);
  console.log(`WROTE ${buf.length} bytes -> ${out}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(out);
  const b1 = wb.getWorksheet("Bảng 1 (tính điểm CC)")!;
  const a01 = wb.getWorksheet("Biểu 01A (CC)")!;

  check("Bảng 1 A4 = họ tên", cellText(b1.getRow(4).getCell(1).value) === `Họ và tên: ${PERSON.fullName}`);
  check(
    "Bảng 1 A5 = vị trí",
    cellText(b1.getRow(5).getCell(1).value) ===
      `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${PERSON.positionTitle}`
  );
  check(
    "Bảng 1 A6 = đơn vị",
    cellText(b1.getRow(6).getCell(1).value) === `Đơn vị công tác: ${PERSON.unitName}`
  );

  const b8 = cellText(a01.getCell("B8").value);
  const b9 = cellText(a01.getCell("B9").value);
  const b10 = cellText(a01.getCell("B10").value);
  check("01A B8 = họ tên thật", b8 === `Họ và tên: ${PERSON.fullName}`, b8);
  check(
    "01A B9 = vị trí thật",
    b9 === `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${PERSON.positionTitle}`,
    b9
  );
  check("01A B10 = đơn vị thật", b10 === `Đơn vị công tác: ${PERSON.unitName}`, b10);
  check(
    "01A không còn tên/vị trí/đơn vị mẫu",
    ![b8, b9, b10].some(
      (text) =>
        text.includes("Nguyễn Hải Yên") ||
        text.includes("Giám sát quản lý hải quan") ||
        text.includes("Hải quan cửa khẩu quốc tế Tà Lùng")
    ),
    { b8, b9, b10 }
  );
  check(
    "01A B8/B9/B10 là giá trị thuần (không còn formula cache mẫu)",
    typeof a01.getCell("B8").value === "string" &&
      typeof a01.getCell("B9").value === "string" &&
      typeof a01.getCell("B10").value === "string"
  );

  // ---------------------------------------------------------------- fallback thiếu dữ liệu
  const fallbackOut = `${OUT_DIR}\\test-monthly-export-thieu-phan-cong.xlsx`;
  const fallbackBuf = await buildMonthlyWorkbook(
    [],
    { fullName: "NGƯỜI CHƯA PHÂN CÔNG", positionTitle: null, unitName: null },
    2026,
    10
  );
  fs.writeFileSync(fallbackOut, fallbackBuf);
  const fbWb = new ExcelJS.Workbook();
  await fbWb.xlsx.readFile(fallbackOut);
  const fbA01 = fbWb.getWorksheet("Biểu 01A (CC)")!;
  const fbB9 = cellText(fbA01.getCell("B9").value);
  const fbB10 = cellText(fbA01.getCell("B10").value);
  check("Thiếu vị trí → gạch ngang, không bịa", fbB9.endsWith(`: ${MISSING_TEXT}`), fbB9);
  check("Thiếu đơn vị → gạch ngang, không bịa", fbB10.endsWith(`: ${MISSING_TEXT}`), fbB10);
  check(
    "Fallback không lẫn dữ liệu mẫu",
    ![fbB9, fbB10].some((text) => text.includes("Giám sát quản lý hải quan") || text.includes("quốc tế Tà Lùng")),
    { fbB9, fbB10 }
  );

  // ---------------------------------------------------------------- chọn assignment
  const asOf = new Date("2026-10-20T03:00:00Z");
  const assignments = [
    { id: "expired", isPrimary: true, effectiveFrom: new Date("2025-01-01"), effectiveTo: new Date("2026-09-30") },
    { id: "future", isPrimary: true, effectiveFrom: new Date("2026-11-01"), effectiveTo: null },
    { id: "current-old", isPrimary: true, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
    { id: "current-new", isPrimary: true, effectiveFrom: new Date("2026-10-01"), effectiveTo: null },
    { id: "secondary-newest", isPrimary: false, effectiveFrom: new Date("2026-10-19"), effectiveTo: null },
  ];
  check(
    "Chọn assignment chính mới nhất còn hiệu lực",
    pickPrimaryAssignment(assignments, asOf)?.id === "current-new",
    pickPrimaryAssignment(assignments, asOf)?.id
  );
  check(
    "effectiveTo đúng ngày kết xuất vẫn còn hiệu lực",
    pickPrimaryAssignment(
      [{ id: "ends-today", isPrimary: true, effectiveFrom: new Date("2026-01-01"), effectiveTo: new Date("2026-10-20") }],
      asOf
    )?.id === "ends-today"
  );
  check(
    "Không có assignment hiệu lực → null",
    pickPrimaryAssignment(
      [
        { id: "expired", isPrimary: true, effectiveFrom: new Date("2025-01-01"), effectiveTo: new Date("2026-09-30") },
        { id: "future", isPrimary: true, effectiveFrom: new Date("2026-11-01"), effectiveTo: null },
      ],
      asOf
    ) === null
  );

  // ---------------------------------------------------------------- 02C
  const planRows = [
    {
      title: "Kiểm tra PTVT xuất cảnh",
      outputText: "3 PTVT",
      evidenceRef: null,
      dueDate: new Date("2026-10-25"),
      completedDate: null,
      notes: null,
    },
  ];
  const out02 = `${OUT_DIR}\\test-02c-export-fill.xlsx`;
  const buf02 = await buildMonthlyPlan02C(planRows, PERSON, 2026, 10);
  fs.writeFileSync(out02, buf02);
  const wb02 = new ExcelJS.Workbook();
  await wb02.xlsx.readFile(out02);
  const ws02 = wb02.worksheets[0];

  const p8 = cellText(ws02.getRow(8).getCell(1).value);
  const p9 = cellText(ws02.getRow(9).getCell(1).value);
  const p10 = cellText(ws02.getRow(10).getCell(1).value);
  const p11 = cellText(ws02.getRow(11).getCell(1).value);
  check("02C R8 = họ tên thật", p8 === `Họ và tên: ${PERSON.fullName}`, p8);
  check("02C R9 = chức vụ thật", p9 === `Chức vụ, chức danh: ${PERSON.positionTitle}`, p9);
  check("02C R10 = đơn vị thật", p10 === `Đơn vị công tác: ${PERSON.unitName}`, p10);
  check(
    "02C R11 không lặp lại chức vụ khi thiếu nguồn vị trí",
    p11 === `Vị trí việc làm/nhiệm vụ được phân công chuyên trách: ${MISSING_TEXT}`,
    p11
  );
  check(
    "02C không còn dữ liệu mẫu",
    ![p8, p9, p10, p11].some(
      (text) =>
        text.includes("Nguyễn Hải Yên") ||
        text.includes("Giám sát quản lý hải quan") ||
        text.includes("Hải quan cửa khẩu quốc tế Tà Lùng")
    ),
    { p8, p9, p10, p11 }
  );

  const out02b = `${OUT_DIR}\\test-02c-export-vi-tri.xlsx`;
  const buf02b = await buildMonthlyPlan02C(
    planRows,
    { ...PERSON, jobPositionTitle: "Giám sát quản lý hải quan" },
    2026,
    10
  );
  fs.writeFileSync(out02b, buf02b);
  const wb02b = new ExcelJS.Workbook();
  await wb02b.xlsx.readFile(out02b);
  const ws02b = wb02b.worksheets[0];
  const p9b = cellText(ws02b.getRow(9).getCell(1).value);
  const p11b = cellText(ws02b.getRow(11).getCell(1).value);
  check("02C R9 giữ chức vụ khi có vị trí riêng", p9b === `Chức vụ, chức danh: ${PERSON.positionTitle}`, p9b);
  check(
    "02C R11 điền vị trí riêng (không trùng chức vụ)",
    p11b === "Vị trí việc làm/nhiệm vụ được phân công chuyên trách: Giám sát quản lý hải quan",
    p11b
  );

  // ---------------------------------------------------------------- chẩn đoán số liệu cũ
  const f = (r: number, c: number) => {
    const v: any = b1.getRow(r).getCell(c).value;
    return v && typeof v === "object" && "formula" in v ? `[F:${v.formula}]=${v.result}` : JSON.stringify(v);
  };
  console.log("R12:", [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((c) => f(12, c)).join(" | "));
  console.log("R14-KLMN:", [11, 12, 13, 14].map((c) => f(14, c)).join(" | "));
  console.log("TOT72:", [7, 8, 9, 12, 14].map((c) => f(72, c)).join(" | "));
  console.log("PCT73:", [9, 12, 14].map((c) => f(73, c)).join(" | "));
  console.log("01A-R7:", JSON.stringify(cellText(a01.getRow(7).getCell(1).value)));
  const d34: any = a01.getRow(34).getCell(4).value;
  check(
    "01A-D34 giữ nguyên công thức điểm",
    d34 && typeof d34 === "object" && "formula" in d34,
    d34 && typeof d34 === "object" ? d34.formula : "LOST!"
  );

  if (failures > 0) {
    console.error(`\n${failures} kiểm tra THẤT BẠI`);
    process.exit(1);
  }
  console.log("\nTất cả kiểm tra PASS");
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});

/**
 * test-yc30-tx1-import.ts — Kiểm thử import danh mục TX1 (file .xls ngày 20/10/2026).
 *
 * Chạy trên DB LOCAL (không chạy trên Production):
 *   $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/talung_yc30_local"
 *   $env:DIRECT_URL=$env:DATABASE_URL
 *   npx tsx scripts/test-yc30-tx1-import.ts
 *
 * Kiểm chứng:
 *  1. Đọc được file .xls OLE2 (không phải .xlsx).
 *  2. Đúng 348 đầu việc / 6 nhóm theo đúng số lượng Hải quan công bố.
 *  3. Mã đầu việc theo nhóm: NV-01…NV-174, CNTT-01…CNTT-05, CBL-01…CBL-57,
 *     PT-01…PT-02, TH-01…TH-102, DANG-01…DANG-08 — mã duy nhất, ổn định.
 *  4. Hệ số quy đổi: 207 ô có giá trị (gồm 10 giá trị 0), 141 ô trống → NULL.
 *  5. Tên trùng trong cùng nhóm vẫn được giữ (13 cặp trong nhóm Nghiệp vụ Hải quan).
 *  6. Import idempotent: chạy lại cùng file không nhân đôi dữ liệu.
 *  7. Thứ tự + nội dung gốc được giữ (đối soát theo sourceRow).
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  parseWorkCatalogWorkbook,
  importWorkCatalog,
  getCatalogDepartmentStatuses,
} from "../src/server/work-catalog";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

const EXPECTED = [
  { name: "Bộ phân Nghiệp vụ Hải quan", prefix: "NV", count: 174 },
  { name: "Bộ phận CNTT", prefix: "CNTT", count: 5 },
  { name: "Bộ phận điều tra CBL", prefix: "CBL", count: 57 },
  { name: "Bộ phận Phúc tập & KT STQ", prefix: "PT", count: 2 },
  { name: "Bộ phận TH & Báo cáo", prefix: "TH", count: 102 },
  { name: "Bộ phận công tác Đảng", prefix: "DANG", count: 8 },
];

async function main() {
  const repo = process.cwd();
  const dir = fs.readdirSync(path.join(repo, "docs")).find((d) => d.includes("file-hai-quan-gui"));
  if (!dir) throw new Error("khong tim thay thu muc file Hải quan gửi");
  const src = path.join(repo, "docs", dir, "Danh mục TX1.xls");
  console.log(`Nguon: ${src}\n`);

  const buffer = fs.readFileSync(src);
  check("File nguồn là .xls OLE2 (không phải .xlsx)", buffer[0] === 0xd0 && buffer[1] === 0xcf, `magic=${buffer.subarray(0, 2).toString("hex")}`);

  // ---------------------------------------------------------- 1. Parse
  const parsed = await parseWorkCatalogWorkbook(buffer);
  check("Đọc được sheet danh mục", !!parsed.sheetName, parsed.sheetName);
  check("Không có lỗi khi đọc file", parsed.errors.length === 0, JSON.stringify(parsed.errors.slice(0, 3)));

  // ---------------------------------------------------------- 2. Số lượng
  check("Tổng đầu việc = 348", parsed.entries.length === 348, String(parsed.entries.length));
  check("Số nhóm = 6", parsed.departments.length === 6, String(parsed.departments.length));

  for (const exp of EXPECTED) {
    const dept = parsed.departments.find((d) => d.name === exp.name);
    check(
      `Nhóm "${exp.name}" có ${exp.count} đầu việc`,
      dept?.count === exp.count,
      `thực tế ${dept?.count ?? "không có"}`
    );
  }

  // ---------------------------------------------------------- 3. Mã đầu việc
  const codes = parsed.entries.map((e) => e.code);
  check("Mã đầu việc duy nhất", new Set(codes).size === codes.length, `${new Set(codes).size}/${codes.length}`);
  for (const exp of EXPECTED) {
    const groupCodes = parsed.entries
      .filter((e) => e.department === exp.name)
      .map((e) => e.code);
    const expectFirst = `${exp.prefix}-01`;
    const expectLast = `${exp.prefix}-${String(exp.count).padStart(2, "0")}`;
    check(
      `Mã nhóm ${exp.prefix} đúng dải ${expectFirst}…${expectLast}`,
      groupCodes[0] === expectFirst && groupCodes[groupCodes.length - 1] === expectLast,
      `${groupCodes[0]} … ${groupCodes[groupCodes.length - 1]}`
    );
    check(
      `Mã nhóm ${exp.prefix} đủ ${exp.count} mã liên tục`,
      groupCodes.length === exp.count &&
        groupCodes.every((c, i) => c === `${exp.prefix}-${String(i + 1).padStart(2, "0")}`),
      `${groupCodes.length} mã`
    );
  }

  // ---------------------------------------------------------- 4. Hệ số
  const withFactor = parsed.entries.filter((e) => e.convertFactor !== null);
  const zeroFactors = withFactor.filter((e) => e.convertFactor === 0);
  const blankFactors = parsed.entries.filter((e) => e.convertFactor === null);
  check("Có hệ số = 207", withFactor.length === 207, String(withFactor.length));
  check("Ô chưa có hệ số = 141 (NULL)", blankFactors.length === 141, String(blankFactors.length));
  check("Hệ số bằng 0 giữ nguyên 10 giá trị", zeroFactors.length === 10, String(zeroFactors.length));

  // Đối chiếu trực tiếp với file gốc (đọc độc lập bằng ExcelJS-like reader)
  const rawCheck = (() => {
    // Đếm bằng cách đọc cell thô: dùng import lại parser nhưng bỏ chuẩn hóa
    const XLSX = require("@e965/xlsx");
    const wb = XLSX.read(buffer, { type: "buffer", cellNF: false, cellText: true });
    const ws = wb.Sheets[parsed.sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
    let has = 0;
    let zero = 0;
    let blank = 0;
    let titleRows = 0;
    for (let i = 1; i < matrix.length; i++) {
      const r = matrix[i] || [];
      const title = String(r[1] || "").trim();
      if (!title) continue;
      titleRows++;
      const cell = ws[XLSX.utils.encode_cell({ r: i, c: 2 })];
      const isBlank = !cell || (cell.t === "s" && String(cell.v).trim() === "");
      if (isBlank) blank++;
      else {
        has++;
        if (cell.t === "n" && cell.v === 0) zero++;
      }
    }
    return { has, zero, blank, titleRows };
  })();
  check("Đối chiếu file gốc: số dòng có tiêu đề = 348", rawCheck.titleRows === 348, String(rawCheck.titleRows));
  check("Đối chiếu file gốc: có hệ số = 207", rawCheck.has === 207, String(rawCheck.has));
  check("Đối chiếu file gốc: hệ số = 0 → 10", rawCheck.zero === 10, String(rawCheck.zero));
  check("Đối chiếu file gốc: ô trống = 141", rawCheck.blank === 141, String(rawCheck.blank));

  // ---------------------------------------------------------- 5. Tên trùng
  // File nguồn có 12 cặp trùng HOÀN TOÀN trong nhóm Nghiệp vụ Hải quan
  // (vd dòng 78/93/97/117/163) — đều được giữ với mã riêng.
  // Ngoài ra có các cặp chỉ khác chữ hoa đầu câu (vd dòng 131 "về việc…" vs 135 "Về việc…")
  // → KHÔNG phải trùng, không gộp.
  const dupInNv = parsed.duplicates.filter((d) => d.department === EXPECTED[0].name);
  check(
    "Tên trùng trong nhóm Nghiệp vụ Hải quan vẫn được giữ",
    dupInNv.length === 12,
    `${dupInNv.length} cặp trùng hoàn toàn`
  );
  check(
    "Không dòng nào bị bỏ vì trùng tên",
    parsed.entries.length === 348,
    `${parsed.duplicates.reduce((s, d) => s + d.rows.length, 0)} dòng trùng vẫn được giữ đủ`
  );
  check("Tên trùng KHÔNG chặn import (không vào errors)", parsed.errors.length === 0);

  // ---------------------------------------------------------- 6. Import thật vào DB local
  const admin = await prisma.person.findFirst({
    where: { assignments: { some: { unit: { code: "BAN_LANH_DAO" } } } },
    orderBy: { code: "asc" },
  });
  const account = admin ? await prisma.account.findFirst({ where: { personId: admin.id } }) : null;
  if (!admin || !account) throw new Error("khong tim thay tai khoan quan tri de import");

  // Dọn phiên bản danh mục cũ trong DB test để chạy lại được nhiều lần.
  await prisma.workCatalogVersion.deleteMany();
  await prisma.workCatalogDepartmentMapping.deleteMany();

  const before = await prisma.workCatalogVersion.count();
  const version = await importWorkCatalog({
    parsed,
    sourceFileName: "Danh muc TX1.xls",
    note: "Kiem thu local YC-30",
    userId: admin.id,
    actorAccountId: account.id,
    expectedHash: parsed.importHash,
  });
  const after = await prisma.workCatalogVersion.count();
  check("Import tạo đúng 1 phiên bản mới", after === before + 1, `${before} → ${after}`);

  const rows = await prisma.workCatalogEntry.findMany({
    where: { versionId: version.id },
    orderBy: [{ departmentOrder: "asc" }, { sortOrder: "asc" }],
  });
  check("DB lưu đúng 348 đầu việc", rows.length === 348, String(rows.length));
  const dbWithFactor = rows.filter((r) => r.convertFactor !== null);
  const dbZero = dbWithFactor.filter((r) => Number(r.convertFactor) === 0);
  const dbBlank = rows.filter((r) => r.convertFactor === null);
  check("DB giữ 207 hệ số", dbWithFactor.length === 207, String(dbWithFactor.length));
  check("DB giữ 10 hệ số bằng 0", dbZero.length === 10, String(dbZero.length));
  check("DB giữ 141 ô NULL", dbBlank.length === 141, String(dbBlank.length));

  // Mã + group_code lưu đúng
  const nvRows = rows.filter((r) => r.department === EXPECTED[0].name);
  check("DB lưu group_code NV", nvRows[0]?.groupCode === "NV", String(nvRows[0]?.groupCode));
  check("DB lưu mã NV-01…NV-174", nvRows[0]?.code === "NV-01" && nvRows[173]?.code === "NV-174", `${nvRows[0]?.code} … ${nvRows[173]?.code}`);

  // Thứ tự + nội dung gốc
  const orderOk = rows.every((r, i) => r.sourceRow === parsed.entries[i].sourceRow);
  check("Thứ tự dòng nguồn được giữ (sourceRow tăng dần)", orderOk);

  // Idempotent: import lại cùng file → bị từ chối
  let dupRejected = false;
  try {
    await importWorkCatalog({
      parsed,
      sourceFileName: "Danh muc TX1.xls",
      userId: admin.id,
      actorAccountId: account.id,
      expectedHash: parsed.importHash,
    });
  } catch (e: any) {
    dupRejected = /không thay đổi|không tạo phiên bản mới/i.test(e.message);
  }
  check("Import lại cùng file bị từ chối (idempotent)", dupRejected);
  const afterDup = await prisma.workCatalogVersion.count();
  check("Import lại KHÔNG tạo thêm phiên bản", afterDup === after, `${after} → ${afterDup}`);

  // Trạng thái nhóm trong màn quản trị
  const statuses = await getCatalogDepartmentStatuses(version.id);
  check("Bảng trạng thái có 6 nhóm", statuses.departments.length === 6, String(statuses.departments.length));
  check(
    "Nhóm chưa ánh xạ → trạng thái UNMAPPED (chưa xác định, không chặn)",
    statuses.departments.every((d) => d.mappingState === "UNMAPPED" && d.isActive === false)
  );
  check(
    "Tổng đầu việc trong bảng trạng thái = 348",
    statuses.departments.reduce((s, d) => s + d.entryCount, 0) === 348
  );

  console.log("\n========================================");
  console.log(`KẾT QUẢ IMPORT TX1: ${passed} pass / ${failed} fail`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
  }
  const exitCode = failed > 0 ? 1 : 0;
  await prisma.$disconnect();
  process.exit(exitCode);
}

main().catch(async (e) => {
  console.error("LỖI:", e);
  await prisma.$disconnect();
  process.exit(1);
});

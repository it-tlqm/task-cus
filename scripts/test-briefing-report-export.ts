/**
 * Kiểm tra xuất báo cáo giao ban (Word) sau khi sửa số liệu:
 *  - Dựng DOCX từ snapshot số liệu thật của kỳ, đọc lại nội dung XML để xác nhận số lên đúng.
 *  - Kiểm tra định dạng số Việt Nam (dấu chấm hàng nghìn, dấu phẩy thập phân, %).
 *  - Lưu / đọc lại phiên bản báo cáo (snapshot) trên CSDL local rồi xoá.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { renderReportDocx } from "../src/server/briefing-report-docx";
import {
  composeBriefingReport,
  deleteReportVersion,
  getReportVersionSnapshot,
  reportColumns,
  saveReportVersion,
  type ReportSnapshot,
} from "../src/server/briefing-report";
import { prisma } from "../src/server/db";

const OUT_DIR = "C:\\Users\\thanhnx\\AppData\\Local\\Temp\\opencode";
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
}

/** Đọc 1 entry trong file ZIP (DOCX) không cần thư viện ngoài. */
function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLen).toString("utf8");
    if (name === entryName) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) return null;
      const localNameLen = buffer.readUInt16LE(localOffset + 26);
      const localExtraLen = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLen + localExtraLen;
      const data = buffer.subarray(dataStart, dataStart + compressedSize);
      return method === 0 ? Buffer.from(data) : zlib.inflateRawSync(data);
    }
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function documentText(docx: Buffer): string {
  const xml = readZipEntry(docx, "word/document.xml");
  if (!xml) return "";
  return xml
    .toString("utf8")
    .replace(/<w:p[ >]/g, "\n<w:p ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

const CURRENT_NUMBERS = [
  "265.075.753.626",
  "1.363.106.886.324",
  "236.643.983,94",
  "358.149.376.732",
  "355.053.814.006",
  "3.095.562.726",
  "132,54%",
  "57,19%",
  "-26,92%",
  "604",
  "4.398",
];

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Snapshot tổng hợp đúng số liệu hiện tại -> Word phải chứa đủ số, đúng định dạng
  const columns = reportColumns("MONTH", { year: 2026, weekNumber: 44, month: 10, quarter: 4 });
  const synthetic: ReportSnapshot = {
    meta: {
      periodType: "MONTH",
      periodKey: "2026-10",
      periodLabel: "Tháng 10/2026",
      startDate: "01/10/2026",
      endDate: "31/10/2026",
      title: "BÁO CÁO GIAO BAN THÁNG 10 NĂM 2026",
      subtitle: "Cửa khẩu Quốc tế Tà Lùng",
      meetingStart: "08:00 ngày 28/10/2026",
      meetingEnd: "09:30 ngày 28/10/2026",
    },
    blocks: [
      { id: "b1", code: "T", kind: "HEADING", title: "I. KẾT QUẢ THU NSNN", groupCode: null, columns: [], rows: [], content: null },
      {
        id: "b2",
        code: "M",
        kind: "METRIC_GROUP",
        title: "Tổng hợp số thu",
        groupCode: "THU",
        columns,
        content: null,
        rows: [
          {
            name: "Thu NSNN",
            level: 0,
            values: columns.map((c) => (c.key === "month" ? "265.075.753.626" : c.key === "year" ? "1.363.106.886.324" : "—")),
            target: "200.000.000.000",
            percent: "132,54%",
            note: "Đạt kế hoạch tháng",
          },
          {
            name: "Thu bằng USD (quy đổi)",
            level: 0,
            values: columns.map((c) => (c.key === "month" ? "17.126.815,76" : c.key === "year" ? "236.643.983,94" : "—")),
            target: "—",
            percent: "—",
            note: "",
          },
          {
            name: "Hàng hóa khác",
            level: 0,
            values: columns.map((c) => (c.key === "year" ? "355.053.814.006" : "—")),
            target: "—",
            percent: "—",
            note: "Đã trừ Than cốc",
          },
          {
            name: "Than cốc",
            level: 0,
            values: columns.map((c) => (c.key === "year" ? "3.095.562.726" : "—")),
            target: "—",
            percent: "—",
            note: "",
          },
          {
            name: "Tổng năm (gồm Than cốc)",
            level: 0,
            values: columns.map((c) => (c.key === "year" ? "358.149.376.732" : "—")),
            target: "—",
            percent: "—",
            note: "",
          },
          {
            name: "So với tháng trước",
            level: 0,
            values: columns.map((c) => (c.key === "month" ? "57,19%" : "—")),
            target: "—",
            percent: "—",
            note: "",
          },
          {
            name: "So với cùng kỳ 2025",
            level: 0,
            values: columns.map((c) => (c.key === "month" ? "-26,92%" : "—")),
            target: "—",
            percent: "—",
            note: "",
          },
          {
            name: "Xe ô tô",
            level: 0,
            values: columns.map((c) => (c.key === "month" ? "604" : c.key === "year" ? "4.398" : "—")),
            target: "—",
            percent: "—",
            note: "",
          },
        ],
      },
    ],
  };

  const syntheticDocx = await renderReportDocx(synthetic);
  const syntheticPath = path.join(OUT_DIR, "bao-cao-giao-ban-thang-10-2026.docx");
  fs.writeFileSync(syntheticPath, syntheticDocx);

  check("Xuất được file DOCX", syntheticDocx.length > 10_000, syntheticDocx.length);
  check("File DOCX có chữ ký ZIP", syntheticDocx.subarray(0, 2).toString() === "PK");

  const text = documentText(syntheticDocx);
  check("Word có tiêu đề báo cáo", text.includes("BÁO CÁO GIAO BAN THÁNG 10 NĂM 2026"));
  check("Word có thời gian họp", text.includes("08:00 ngày 28/10/2026"));
  check("Word có bảng chỉ tiêu", text.includes("Chỉ tiêu") && text.includes("Tỷ lệ %"));

  for (const value of CURRENT_NUMBERS) {
    check(`Word giữ đúng số ${value}`, text.includes(value));
  }

  // 2. Snapshot thật từ CSDL local (chứng minh pipeline compose -> render chạy được)
  const real = await composeBriefingReport("MONTH", { year: 2026, weekNumber: 44, month: 10, quarter: 4 });
  const realDocx = await renderReportDocx(real);
  const realPath = path.join(OUT_DIR, "bao-cao-giao-ban-local-2026-10.docx");
  fs.writeFileSync(realPath, realDocx);
  check("Compose + render từ CSDL local", realDocx.length > 5_000, realDocx.length);
  check("Báo cáo local đúng kỳ", real.meta.periodKey === "2026-10");
  console.log(`   → Đã lưu: ${syntheticPath}`);
  console.log(`   → Đã lưu: ${realPath}`);

  // 3. Lưu / đọc lại phiên bản báo cáo (snapshot bất biến) rồi xoá
  const person = await prisma.person.findFirst({ orderBy: { fullName: "asc" }, select: { id: true, fullName: true } });
  if (!person) {
    console.log("[SKIP] CSDL local chưa có nhân sự để test lưu phiên bản");
  } else {
    const version = await saveReportVersion({
      periodType: "MONTH",
      anchors: { year: 2026, weekNumber: 44, month: 10, quarter: 4 },
      title: "Kiểm thử xuất báo cáo",
      subtitle: "Bản kiểm thử tự động",
      meetingStart: "08:00",
      meetingEnd: "09:00",
      createdById: person.id,
    });
    check("Lưu được phiên bản báo cáo", !!version.id && version.versionNo >= 1, version);

    const loaded = await getReportVersionSnapshot(version.id);
    check("Đọc lại được phiên bản đã lưu", !!loaded);
    check("Phiên bản giữ nguyên số khối", loaded?.snapshot.blocks.length === real.blocks.length);
    check("Phiên bản giữ nguyên mã kỳ", loaded?.snapshot.meta.periodKey === "2026-10");

    const versionDocx = await renderReportDocx(loaded!.snapshot);
    check("Xuất Word từ phiên bản đã lưu", versionDocx.length > 5_000, versionDocx.length);
    check("Word phiên bản có tiêu đề đã lưu", documentText(versionDocx).includes("Kiểm thử xuất báo cáo"));

    const removed = await deleteReportVersion(version.id);
    check("Xoá được phiên bản kiểm thử", removed);
  }

  console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

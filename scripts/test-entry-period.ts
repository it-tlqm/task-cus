import fs from "node:fs";
import path from "node:path";
import {
  entryPeriodBounds,
  metricEntryPeriod,
  shiftPeriodAnchor,
} from "../src/lib/metric-entry-period";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) {
    pass++;
    console.log(`[PASS] ${name}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}`);
  }
};
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const day = entryPeriodBounds("DAY", "2026-10-26");
const week = entryPeriodBounds("WEEK", "2026-10-26");
const month = entryPeriodBounds("MONTH", "2026-10-26");
const quarter = entryPeriodBounds("QUARTER", "2026-10-26");
const year = entryPeriodBounds("YEAR", "2026-10-26");

check("Ngày đúng", day.start === "2026-10-26" && day.end === "2026-10-26");
check("Tuần 44 đúng Thứ Hai - Chủ Nhật", week.key === "2026-W44" && week.start === "2026-10-26" && week.end === "2026-11-01");
check("Tháng 10 đúng", month.start === "2026-10-01" && month.end === "2026-10-31");
check("Quý 4 đúng", quarter.start === "2026-10-01" && quarter.end === "2026-12-31");
check("Năm đúng", year.start === "2026-01-01" && year.end === "2026-12-31");
check("Lùi tháng", shiftPeriodAnchor("MONTH", "2026-10-26", -1) === "2026-09-01");
check("Tiến tuần", shiftPeriodAnchor("WEEK", "2026-10-26", 1) === "2026-11-02");

check(
  "Fallback Thu NSNN theo ngày",
  metricEntryPeriod({ code: "THU_NSNN", valueKind: "FLOW" }) === "DAY"
);
check(
  "Fallback số dư theo tháng",
  metricEntryPeriod({ code: "NO_THUE", valueKind: "BALANCE" }) === "MONTH"
);
check(
  "Fallback chỉ tiêu khác theo tuần",
  metricEntryPeriod({ code: "XNK_TK", valueKind: "FLOW" }) === "WEEK"
);
check(
  "Cấu hình kỳ nhập thắng fallback",
  metricEntryPeriod({ code: "XNK_TK", valueKind: "FLOW", derivation: { entryPeriod: "QUARTER" } }) === "QUARTER"
);

const apiEntries = read("src/app/api/metrics/entries/route.ts");
const page = read("src/app/giao-ban/nhap/page.tsx");
const adminApi = read("src/app/api/metrics/admin/route.ts");
const adminPage = read("src/app/giao-ban/cau-hinh/page.tsx");
const summary = read("src/server/metrics.ts");
const giaoBan = read("src/app/giao-ban/page.tsx");

check(
  "API lọc chỉ tiêu theo kỳ nhập",
  apiEntries.includes("metricEntryPeriod(m) === entryPeriod") &&
    apiEntries.includes("entryPeriodBounds(entryPeriod")
);
check(
  "API lưu tại ngày cuối kỳ + chặn nhập chồng",
  apiEntries.includes("periodEnd") &&
    apiEntries.includes("không nhập chồng số kỳ")
);
check(
  "Trang nhập có 5 tab kỳ",
  page.includes("data-testid=\"entry-period-tabs\"") &&
    page.includes("ENTRY_PERIODS.map")
);
check(
  "Trang nhập hiển thị tổng phát sinh trong kỳ",
  page.includes("tổng phát sinh trong kỳ")
);
check(
  "Admin API lưu entryPeriod",
  adminApi.includes("entryPeriod") && adminApi.includes("metricEntryPeriod")
);
check(
  "Admin UI có chọn kỳ nhập",
  adminPage.includes("Kỳ nhập:") && adminPage.includes("ENTRY_PERIODS")
);
check(
  "Summary trả entryPeriod",
  summary.includes("entryPeriod: metricEntryPeriod(m)") && summary.includes("entryPeriod: EntryPeriod")
);
check(
  "Giao ban ẩn cột không áp dụng",
  giaoBan.includes("entryPeriodColumnAllowed") && giaoBan.includes("Kỳ:")
);

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

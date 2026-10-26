import fs from "node:fs";
import path from "node:path";
import { fmtMetricCompact } from "../src/lib/metric-format";

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
const page = read("src/app/giao-ban/nhap/page.tsx");
const api = read("src/app/api/metrics/entries/cumulative/route.ts");
const taxSummary = read("src/components/dashboard/TaxSummarySection.tsx");
const v4 = read("src/components/dashboard/DashboardV4.tsx");
const comparison = read("src/components/dashboard/RevenueComparisonSection.tsx");

check(
  "API lũy kế nhận kỳ nhập",
  api.includes("entryPeriod") && api.includes("entryPeriodBounds")
);
check(
  "API lấy lũy kế đến ngày trước kỳ",
  api.includes("periodStart") && api.includes("previousDate(periodStart)")
);
check(
  "Trang nhập cho dùng lũy kế cả kỳ",
  page.includes('m.valueKind !== "BALANCE"') && page.includes("Lũy kế đến cuối kỳ")
);
check(
  "Modal có lũy kế kỳ trước và công thức kỳ",
  page.includes("Lũy kế cuối kỳ trước") &&
    page.includes("Số phát sinh trong kỳ = lũy kế cuối kỳ − lũy kế cuối kỳ trước")
);
check(
  "Dashboard chính dùng số rút gọn",
  taxSummary.includes("fmtMetricCompact") && taxSummary.includes("title={fmtMetric")
);
check("V4 dùng số rút gọn", v4.includes("fmtMetricCompact"));
check("So sánh dùng số rút gọn", comparison.includes("fmtMetricCompact"));

const style = { displayScale: 1, decimals: 0, unitLabel: "đồng" };
check("2.651 tỷ hiển thị gọn", fmtMetricCompact(2_651_813_870_360, style).includes("2.651,81 tỷ"));
check("134 triệu hiển thị gọn", fmtMetricCompact(134_872_416, style).includes("134,87 triệu"));
check("Số nhỏ giữ nguyên", fmtMetricCompact(5_000, style).includes("5.000 đồng"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

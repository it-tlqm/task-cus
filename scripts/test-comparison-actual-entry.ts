import fs from "node:fs";
import path from "node:path";
import { shiftComparisonDate } from "../src/lib/comparison-dates";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ""}`); }
  else { fail++; console.log(`[FAIL] ${name}${detail ? ` - ${detail}` : ""}`); }
};
const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

check("24/10/2026 lùi 1 tháng", shiftComparisonDate("2026-10-24", -1, 0) === "2026-09-24");
check("31/03/2026 lùi 1 tháng clamp 28/02", shiftComparisonDate("2026-03-31", -1, 0) === "2026-02-28");
check("29/02/2024 lùi 1 năm clamp 28/02/2023", shiftComparisonDate("2024-02-29", 0, -1) === "2023-02-28");
check("Ngày không hợp lệ trả null", shiftComparisonDate("not-a-date", -1, 0) === null);

const comparison = read("src/components/dashboard/RevenueComparisonSection.tsx");
const nhap = read("src/app/giao-ban/nhap/page.tsx");
check("Có nút nhập số thực tế trong So sánh", comparison.includes("Nhập số thực tế"));
check("Link mở đúng ngày và chỉ tiêu", comparison.includes("/giao-ban/nhap?date=") && comparison.includes("metric=THU_NSNN"));
check("Trang nhập đọc tham số date", nhap.includes('params.get("date")'));
check("Trang nhập đọc tham số metric", nhap.includes('params.get("metric")'));
check("Trang nhập cuộn tới chỉ tiêu", nhap.includes("scrollIntoView") && nhap.includes("data-metric-code"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

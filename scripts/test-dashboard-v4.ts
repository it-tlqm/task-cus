/**
 * Dashboard V4 — static regression checks.
 * Chạy: npx tsx scripts/test-dashboard-v4.ts
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;

function check(name: string, condition: boolean) {
  if (condition) {
    pass++;
    console.log(`[PASS] ${name}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}`);
  }
}

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const page = read("src/app/dashboard/v4/page.tsx");
const component = read("src/components/dashboard/DashboardV4.tsx");
const oldDashboard = read("src/app/dashboard/page.tsx");
const kpiRoute = read("src/app/api/dashboard/kpi/route.ts");
const comparison = read("src/components/dashboard/RevenueComparisonSection.tsx");
const targetManager = read("src/components/metrics/MetricTargetManager.tsx");
const configPage = read("src/app/giao-ban/cau-hinh/page.tsx");

check("Có route /dashboard/v4", page.includes("DashboardV4"));
check("Dùng Recharts", component.includes("recharts"));
check("Có BarChart", component.includes("BarChart"));
check("Có PieChart", component.includes("PieChart"));
check("Có 4 KPI", component.includes("Thu NSNN / chỉ tiêu") && component.includes("Chất lượng kết quả"));
check("Có view Tổng quan/Biểu đồ/Bảng/So sánh", ["Tổng quan", "Biểu đồ", "Bảng", "So sánh"].every((v) => component.includes(`\"${v}\"`)));
check("Có link về dashboard cũ", component.includes('href="/dashboard"'));
check("Dashboard cũ có link thử V4", oldDashboard.includes('href="/dashboard/v4"'));
check("KPI API hỗ trợ period=year", kpiRoute.includes('targetPeriodKey === "year"'));
check("Không thay thế route /dashboard cũ", oldDashboard.includes("export default function DashboardPage"));
check("Có empty state chưa cấu hình", component.includes("Chưa cấu hình chỉ tiêu"));
check("Có link nhập chỉ tiêu đối chiếu", comparison.includes("/giao-ban/cau-hinh?tab=TARGET&metric=THU_NSNN"));
check("Target manager nhận mã chỉ tiêu", targetManager.includes("initialMetricCode"));
check("Cấu hình đọc tab/metric từ URL", configPage.includes('params.get("tab")') && configPage.includes('params.get("metric")'));

const detailIndex = component.indexOf('title="Số liệu giao ban"');
const comparisonIndex = component.indexOf('title="So sánh thu NSNN"');
const taskIndex = component.indexOf('title="Nhiệm vụ theo trạng thái"');
check(
  "V4 đưa Số liệu giao ban + So sánh lên trước các khối khác",
  detailIndex >= 0 && comparisonIndex > detailIndex && taskIndex > comparisonIndex
);
check(
  "V4 có bảng so sánh kết quả thu",
  component.includes("RevenueComparisonSection") && component.includes("summary?.comparison")
);

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

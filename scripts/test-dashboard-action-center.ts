import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const component = read("src/components/dashboard/DashboardActionCenter.tsx");
const page = read("src/app/dashboard/page.tsx");

check("Có action center", component.includes('data-testid="dashboard-action-center"'));
check("Có chờ duyệt", component.includes("Chờ duyệt") && component.includes("urgentReview"));
check("Có quá hạn", component.includes("Quá hạn") && component.includes("overdue"));
check("Có cần chú ý", component.includes("Cần chú ý") && component.includes("attention"));
check("Link tới duyệt hồ sơ", component.includes('href="/approvals"'));
check("Link tới nhiệm vụ", component.includes('href="/tasks"'));
check("Dashboard dùng action center", page.includes("DashboardActionCenter"));
check("Truyền dữ liệu KPI", page.includes("waitingReview={kpis.waitingReview}") && page.includes("attention={attentionTasks.length}"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

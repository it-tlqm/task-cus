/**
 * Cấu hình chỉ tiêu hiển thị trong So sánh thu NSNN.
 * Chạy: npx tsx scripts/test-comparison-config.ts
 */
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

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20261025110000_v3_metric_show_in_comparison/migration.sql");
const metrics = read("src/server/metrics.ts");
const admin = read("src/app/api/metrics/admin/route.ts");
const configPage = read("src/app/giao-ban/cau-hinh/page.tsx");
const comparison = read("src/components/dashboard/RevenueComparisonSection.tsx");
const v4 = read("src/components/dashboard/DashboardV4.tsx");

check("Schema có showInComparison", schema.includes("showInComparison"));
check("Migration thêm cột", migration.includes("show_in_comparison"));
check("Migration bật THU_NSNN", /THU_NSNN/.test(migration) && migration.includes("= true"));
check("API so sánh lọc theo cờ", metrics.includes("if (!m.showInComparison) continue"));
check("API admin trả cờ", admin.includes("showInComparison: m.showInComparison"));
check("API admin lưu cờ", admin.includes("showInComparison: boolOf(data.showInComparison"));
check("UI có checkbox cấu hình", configPage.includes("Hiện trong So sánh thu NSNN"));
check("Không còn filter hard-code trong component", !comparison.includes("selectRevenueComparisonRows"));
check("V4 không ép cứng THU_NSNN", !v4.includes('rows?.find((r) => r.code === "THU_NSNN")'));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

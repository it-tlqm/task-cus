/**
 * Cấu hình chỉ tiêu hiển thị trong So sánh thu NSNN.
 * Không dùng migration: lưu trong system_configs.
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
const systemConfig = read("src/server/system-config.ts");
const metrics = read("src/server/metrics.ts");
const admin = read("src/app/api/metrics/admin/route.ts");
const configPage = read("src/app/giao-ban/cau-hinh/page.tsx");
const comparison = read("src/components/dashboard/RevenueComparisonSection.tsx");
const v4 = read("src/components/dashboard/DashboardV4.tsx");

check("Không thêm cột schema", !schema.includes("showInComparison"));
check("Có key cấu hình", systemConfig.includes("metric.comparison.visibleCodes"));
check("Mặc định THU_NSNN", systemConfig.includes('["THU_NSNN"]'));
check("Có helper đọc cấu hình", systemConfig.includes("getMetricComparisonVisibleCodes"));
check("API so sánh lọc theo cấu hình", metrics.includes("getMetricComparisonVisibleCodes") && metrics.includes("comparisonVisibleCodes.has"));
check("API admin trả danh sách", admin.includes("comparisonVisibleCodes"));
check("API admin lưu entity comparison", admin.includes('entity === "comparison"'));
check("API admin lưu SystemConfig", admin.includes("METRIC_COMPARISON_VISIBLE_CODES_KEY"));
check("UI có tab cấu hình", configPage.includes("So sánh thu NSNN") && configPage.includes("comparisonCodes"));
check("Không còn filter hard-code trong component", !comparison.includes("selectRevenueComparisonRows"));
check("V4 không ép cứng THU_NSNN", !v4.includes('rows?.find((r) => r.code === "THU_NSNN")'));
check("Bỏ cột Nguồn / Kỳ", !comparison.includes("Nguồn / Kỳ"));
check("Bỏ công thức cuối bảng", !comparison.includes("Công thức:"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

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

const modal = read("src/components/dashboard/ComparisonTargetQuickModal.tsx");
const section = read("src/components/dashboard/RevenueComparisonSection.tsx");

check("Có modal nhập nhanh", modal.includes('data-testid="comparison-target-quick-modal"'));
check("Có 3 loại chỉ tiêu", modal.includes("BTC_YEAR") && modal.includes("UBND_YEAR") && modal.includes("MONTH_PLAN"));
check("Có nhập số định dạng", modal.includes("FormattedNumberInput"));
check("Có nguồn/căn cứ bắt buộc", modal.includes("nguồn/căn cứ") && modal.includes("sourceNote"));
check("Lưu rồi xác nhận", modal.includes('action: "confirm"') && modal.includes("Lưu & xác nhận"));
check("Khối So sánh dùng modal", section.includes("ComparisonTargetQuickModal"));
check("Nút mở modal", section.includes("setQuickTargetOpen(true)"));
check("Có fallback cấu hình đầy đủ", section.includes("Cấu hình chỉ tiêu"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

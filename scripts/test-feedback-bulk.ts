import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};
const page = fs.readFileSync(path.join(root, "src/app/admin/feedback/page.tsx"), "utf8");

check("Có chọn nhiều góp ý", page.includes("selectedIds"));
check("Có chọn cả trang", page.includes("feedback-select-all"));
check("Có ghi chú chung", page.includes("bulkNote"));
check("Có xử lý hàng loạt", page.includes("bulkResolve"));
check("PATCH từng góp ý", page.includes("action: \"resolve\"") && page.includes("/api/feedback/${id}"));
check("Có nút bỏ chọn", page.includes("Bỏ chọn"));
check("Checkbox chỉ góp ý mới", page.includes('f.status === "NEW"'));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

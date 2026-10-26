import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};
const page = fs.readFileSync(path.join(root, "src/app/approvals/page.tsx"), "utf8");

check("Có khóa hồ sơ đang xem", page.includes("previewItemKey"));
check("Có hàm key ổn định", page.includes("approvalItemKey"));
check("Sau quyết định tìm hồ sơ kế tiếp", page.includes("filteredItems.find"));
check("Tự mở hồ sơ tiếp theo", page.includes("Đang mở hồ sơ tiếp theo") && page.includes("openPreview(next"));
check("Không mở lại chính hồ sơ vừa xử lý", page.includes("approvalItemKey(item) !== previewItemKey"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

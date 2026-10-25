import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};
const plans = fs.readFileSync(path.join(root, "src/app/plans/page.tsx"), "utf8");

check("Tiêu đề và thao tác tách hàng", plans.includes("border-t border-border-default/40 pt-space-md"));
check("Metadata dùng chip", plans.includes("Kế hoạch cấp đơn vị") && plans.includes("Dữ liệu theo phân quyền"));
check("Có xóa lọc", plans.includes("clearWorkItemFilters") && plans.includes("Xóa lọc"));
check("Nhãn lọc ngắn", plans.includes(">Phụ trách:<") && plans.includes(">Ưu tiên:<"));
check("Không còn '0 cán bộ'", !plans.includes("Tất cả cán bộ ({planOfficers.length} cán bộ)"));
check("Empty state đúng ngữ cảnh", plans.includes("Kế hoạch này chưa có đầu việc") && plans.includes("Bấm “Xóa lọc”"));
check("Cột C ngắn gọn", plans.includes("Đầu việc / Danh mục"));
check("Quy tắc C thu gọn", plans.includes("<details") && plans.includes("Quy tắc nghiệp vụ Cột C"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

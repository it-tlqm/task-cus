import { selectRevenueComparisonRows } from "../src/lib/comparison-rows";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};

const rows = [
  { code: "PHAN_BON", name: "Mặt hàng phân bón" },
  { code: "THU_NSNN", name: "Thu NSNN (số thuế phát sinh)" },
  { code: "OTO", name: "Ô tô" },
];
const filtered = selectRevenueComparisonRows(rows);
check("Chỉ giữ dòng Thu NSNN", filtered.length === 1);
check("Đúng mã THU_NSNN", filtered[0]?.code === "THU_NSNN");
check("Không còn phân bón", filtered.every((r) => !r.name.includes("phân bón")));
check("Fallback ẩn phân bón khi không có THU_NSNN", selectRevenueComparisonRows([
  { code: "PHAN_BON", name: "Mặt hàng phân bón" },
  { code: "OTO", name: "Ô tô" },
]).map((r) => r.code).join(",") === "OTO");
check("Danh sách rỗng", selectRevenueComparisonRows([]).length === 0);

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

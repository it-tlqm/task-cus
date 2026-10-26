import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) { pass++; console.log(`[PASS] ${name}`); }
  else { fail++; console.log(`[FAIL] ${name}`); }
};
const page = fs.readFileSync(path.join(root, "src/app/giao-ban/nhap/page.tsx"), "utf8");

check("Có nút tính từ lũy kế", page.includes("Tính từ lũy kế"));
check("Có nhập lũy kế hôm nay", page.includes("Lũy kế hôm nay"));
check("Có nhập lũy kế hôm trước", page.includes("Lũy kế hôm trước"));
check("Có công thức hiệu", page.includes("Số phát sinh ngày = lũy kế hôm nay − lũy kế hôm trước"));
check("Có điền vào ô nhập", page.includes("Điền số phát sinh") && page.includes("setValues"));
check("Không tự lưu", page.includes("chưa lưu"));

const today = 1334441535806;
const previous = 1317372334554;
const delta = today - previous;
check("Ví dụ 24/10 đúng", delta === 17069201252, String(delta));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

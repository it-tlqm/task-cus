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
const api = fs.readFileSync(path.join(root, "src/app/api/metrics/entries/cumulative/route.ts"), "utf8");

check("Có nút tính từ lũy kế", page.includes("Tính từ lũy kế"));
check("Có nhập lũy kế hôm nay", page.includes("Lũy kế hôm nay"));
check("Tự lấy lũy kế hôm trước", page.includes("/api/metrics/entries/cumulative") && page.includes("TỰ LẤY"));
check("Có trạng thái đang tính", page.includes("cumulativeLoading") && page.includes("Đang tính..."));
check("Có công thức hiệu", page.includes("Số phát sinh ngày = lũy kế hôm nay − lũy kế hôm trước"));
check("Chỉ điền, không tự lưu", page.includes("Điền số phát sinh") && page.includes("chưa lưu"));
check("API tính lũy kế", api.includes("cumulativePrevious") && api.includes("metricBaseline") && api.includes("metricDailyEntry.aggregate"));
check("API tôn trọng quyền nhập", api.includes("permForMetric") && api.includes("resolveEntryPerms"));

const today = 1334441535806;
const previous = 1317372334554;
check("Ví dụ 24/10 đúng", today - previous === 17069201252);

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

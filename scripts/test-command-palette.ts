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

const palette = read("src/components/layout/CommandPalette.tsx");
const header = read("src/components/layout/Header.tsx");

check("Có command palette", palette.includes('data-testid="command-palette"'));
check("Mở bằng Ctrl+K", header.includes('event.key.toLowerCase() === "k"'));
check("Có nút tìm nhanh desktop", header.includes('title="Tìm nhanh (Ctrl+K)"'));
check("Có nút tìm nhanh mobile", header.includes('aria-label="Tìm nhanh và hành động"'));
check("Có điều hướng module", palette.includes("Bảng điều hành") && palette.includes("Kế hoạch công tác"));
check("Có hành động giao việc", palette.includes("Giao nhiệm vụ mới"));
check("Có hành động nhập số liệu", palette.includes("Nhập số liệu giao ban"));
check("Có tìm nhiệm vụ theo từ khóa", palette.includes('/tasks?q='));
check("Có phím lên/xuống/enter", palette.includes("ArrowDown") && palette.includes("ArrowUp") && palette.includes('event.key === "Enter"'));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

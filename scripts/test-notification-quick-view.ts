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

const header = read("src/components/layout/Header.tsx");
const modal = read("src/components/notifications/NotificationQuickView.tsx");

check("Header import modal", header.includes("NotificationQuickView"));
check("Header có state mở modal", header.includes("quickNotificationsOpen"));
check("Header mở modal từ nút chuông", header.includes("setQuickNotificationsOpen(true)"));
check("Modal dùng portal", modal.includes("createPortal"));
check("Modal có role dialog", modal.includes('role="dialog"'));
check("Modal tải thông báo", modal.includes("/api/notifications?limit=8"));
check("Modal đánh dấu đã đọc", modal.includes("/api/notifications/${id}/read"));
check("Modal đọc tất cả", modal.includes("/api/notifications/read-all"));
check("Modal có link trang đầy đủ", modal.includes('href="/notifications"'));
check("Modal có đóng bằng Escape", modal.includes('event.key === "Escape"'));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

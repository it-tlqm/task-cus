import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
}
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const tour = read("src/components/v5/ProductTour.tsx");
console.log("=== Product Tour ===");
check("Có đủ 6 bước", (tour.match(/route: "/g) || []).length === 6, (tour.match(/route: "/g) || []).length);
check("Bước 1 là Tổng quan", tour.includes('route: "/v5"') && tour.includes("dashboard-summary"));
check("Bước 2 là Giao ban", tour.includes('route: "/v5/giao-ban"') && tour.includes("giao-ban-summary"));
check("Bước 3 là Nhập số liệu", tour.includes('route: "/v5/giao-ban/nhap"') && tour.includes("entry-modes"));
check("Bước 4 là Công việc", tour.includes('route: "/my-work"') && tour.includes("task-list"));
check("Bước 5 là Báo cáo", tour.includes('route: "/reports"') && tour.includes("export-btns"));
check("Bước 6 là Thông báo", tour.includes("notifications"));
check("Có spotlight", tour.includes("boxShadow") && tour.includes("border-v5-gold"));
check("Có tiến độ bước", tour.includes("stepIndex + 1") && tour.includes("STEPS.length"));
check("Có Bỏ qua", tour.includes("Bỏ qua"));
check("Có Quay lại / Tiếp tục", tour.includes("Quay lại") && tour.includes("Tiếp tục"));
check("Có Hoàn tất", tour.includes("Hoàn tất"));
check("Lưu trạng thái theo tài khoản", tour.includes("talung.productTour.v1.") && tour.includes("user?.username"));
check("Tự chạy lần đầu", tour.includes("readCompleted(storageKey)") && tour.includes("1400"));
check("Mở lại bằng ?tour=1", tour.includes('get("tour") === "1"'));
check("Có sự kiện mở tour", tour.includes("talung:start-tour"));
check("Điều hướng theo bước", tour.includes("router.push(step.route)"));
check("Bám theo cuộn/resize", tour.includes('window.addEventListener("scroll"') && tour.includes('window.addEventListener("resize"'));
check("Đóng bằng Escape", tour.includes('event.key === "Escape"'));

console.log("\n=== Gắn vào giao diện ===");
const shell = read("src/components/v5/V5Shell.tsx");
check("Shell render ProductTour", shell.includes("<ProductTour />"));
check("Chuông thông báo có điểm neo", shell.includes('data-tour="notifications"'));
const dashboard = read("src/app/v5/page.tsx");
check("Tổng quan có điểm neo", dashboard.includes('data-tour="dashboard-summary"'));
const giaoBan = read("src/app/v5/giao-ban/page.tsx");
check("Giao ban có điểm neo", giaoBan.includes('data-tour="giao-ban-summary"'));
const entry = read("src/app/v5/giao-ban/nhap/page.tsx");
check("Nhập liệu có điểm neo", entry.includes('data-tour="entry-modes"'));
const help = read("src/app/huong-dan/page.tsx");
check("Hướng dẫn có nút bắt đầu tour", help.includes("/v5?tour=1") && help.includes("Bắt đầu tour"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

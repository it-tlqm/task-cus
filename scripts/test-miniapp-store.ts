import fs from "node:fs";
import path from "node:path";
import {
  findMiniappByPath,
  MINIAPP_ACCENTS,
  MINIAPP_CATEGORIES,
  MINIAPPS,
} from "../src/config/miniapps";

const root = process.cwd();
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
}
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

console.log("=== Danh mục miniapp ===");
check("Có ít nhất 8 ứng dụng", MINIAPPS.length >= 8, MINIAPPS.length);
check("Mã ứng dụng không trùng", new Set(MINIAPPS.map((app) => app.id)).size === MINIAPPS.length);
check("Đường dẫn không trùng", new Set(MINIAPPS.map((app) => app.href)).size === MINIAPPS.length);
check(
  "Mọi ứng dụng có nhóm hợp lệ",
  MINIAPPS.every((app) => MINIAPP_CATEGORIES.some((category) => category.id === app.category))
);
check("Mọi ứng dụng có tiền tố URL", MINIAPPS.every((app) => app.paths.length > 0));
check("Mọi ứng dụng có màu nhận diện", MINIAPPS.every((app) => !!MINIAPP_ACCENTS[app.accent]));
check("Mọi ứng dụng có từ khóa tìm kiếm", MINIAPPS.every((app) => app.keywords.length > 0));

console.log("\n=== Nhận diện app theo URL ===");
check("/v5 → Tổng quan", findMiniappByPath("/v5")?.id === "tong-quan");
check("/v5/giao-ban → Giao ban", findMiniappByPath("/v5/giao-ban")?.id === "giao-ban");
check("/v5/giao-ban/nhap → Giao ban", findMiniappByPath("/v5/giao-ban/nhap")?.id === "giao-ban");
check("/giao-ban/cau-hinh → Giao ban", findMiniappByPath("/giao-ban/cau-hinh")?.id === "giao-ban");
check("/my-work → Công việc", findMiniappByPath("/my-work")?.id === "cong-viec");
check("/tasks/abc → Công việc", findMiniappByPath("/tasks/abc")?.id === "cong-viec");
check("/admin/organization → Nhân sự (tiền tố dài nhất)", findMiniappByPath("/admin/organization")?.id === "nhan-su");
check("/admin/audit → Quản trị", findMiniappByPath("/admin/audit")?.id === "quan-tri");
check("/reports → Báo cáo", findMiniappByPath("/reports")?.id === "bao-cao");
check("/store không thuộc app nào", findMiniappByPath("/store") === null);
check("URL lạ trả null", findMiniappByPath("/khong-ton-tai") === null);

console.log("\n=== Quyền hiển thị ===");
const routine = MINIAPPS.find((app) => app.id === "nhat-ky");
check("Nhật ký ca trực ẩn với lãnh đạo đơn vị", !!routine?.roles && !routine.roles.includes("UNIT_LEADER"));
const adminApps = MINIAPPS.filter((app) => app.category === "quan-tri" && app.id !== "huong-dan");
check("App quản trị đều khai báo quyền", adminApps.every((app) => (app.permissions || []).length > 0));

console.log("\n=== Giao diện Kho ứng dụng ===");
const store = read("src/app/store/page.tsx");
check("Có tìm kiếm ứng dụng", store.includes('aria-label="Tìm ứng dụng"'));
check("Có lọc theo nhóm", store.includes("MINIAPP_CATEGORIES.map"));
check("Có ghim ứng dụng", store.includes("PIN_KEY") && store.includes("Đã ghim"));
check("Có dùng gần đây", store.includes("RECENT_KEY") && store.includes("Dùng gần đây"));
check("Có thẻ ứng dụng", store.includes('data-testid="miniapp-card"'));
check("Có trạng thái rỗng", store.includes("Không tìm thấy ứng dụng phù hợp"));
check("Có ghi chú quyền", store.includes("Ứng dụng hiển thị theo quyền"));

const shell = read("src/components/v5/V5Shell.tsx");
check("Sidebar có Kho ứng dụng", shell.includes("<StoreLink"));
check("Top bar có app switcher", shell.includes("Đổi ứng dụng"));
check("Shell nhận diện app hiện tại", shell.includes("findMiniappByPath(pathname)"));
check("Mobile có nút Kho ứng dụng", shell.includes('aria-label="Kho ứng dụng"'));
check("Menu lọc theo app đang mở", shell.includes("navItemAppId(item.href) === appId"));
check("Store không hiện menu nghiệp vụ", shell.includes('pathname === "/store"'));

const login = read("src/app/login/page.tsx");
check("Đăng nhập mặc định vào Store", login.includes('let dest = "/store"'));
const home = read("src/app/page.tsx");
check("Trang gốc chuyển về Store", home.includes('redirect("/store")'));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

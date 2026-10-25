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

const api = read("src/app/api/admin/permissions/route.ts");
const page = read("src/app/admin/permissions/page.tsx");

check("Có nhận diện SYSTEM_ADMIN", api.includes("isSystemAdmin"));
check("Có đếm admin đang hiệu lực", api.includes("activeSystemAdminGrantCount"));
check("API trả canGrantSystemAdmin", api.includes("canGrantSystemAdmin"));
check("Chỉ SYSTEM_ADMIN cấp được", api.includes("Chỉ Quản trị hệ thống hiện hữu mới được cấp"));
check("Bắt buộc lý do tối thiểu 10 ký tự", api.includes("tối thiểu 10 ký tự"));
check("Bắt buộc phạm vi toàn tổ chức", api.includes("chỉ được cấp ở phạm vi toàn tổ chức"));
check("Chặn thu hồi admin cuối cùng", api.includes("Không thể thu hồi Quản trị hệ thống cuối cùng"));
check("Thu hồi admin phải có lý do", api.includes("Thu hồi Quản trị hệ thống phải có lý do"));
check("UI có cảnh báo quản trị cao nhất", page.includes("quản trị cao nhất") && page.includes("admin cuối cùng"));
check("UI buộc phạm vi ORGANIZATION", page.includes('setGScope("ORGANIZATION")'));
check("UI xác nhận trước khi cấp", page.includes("window.confirm"));
check("UI hỏi lý do thu hồi", page.includes("window.prompt"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

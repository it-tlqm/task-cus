/**
 * UX Phase 3B — Kiểm thử TĨNH: ẩn/thu gọn "Khai báo đầu việc trong ca" theo vai trò.
 *
 * Chạy KHÔNG cần DB / server:
 *   npx tsx scripts/test-ux-phase3b-routine-declaration.ts
 *
 * Phạm vi:
 *  1. Mapping vai trò → HIDDEN | COLLAPSED (UNIT_LEADER/SYSTEM_ADMIN ẩn,
 *     DEPARTMENT_LEADER/STAFF thu gọn).
 *  2. Nút mở/đóng có aria-expanded + aria-controls; panel ẩn mặc định.
 *  3. "Xác nhận không phát sinh" vẫn bấm được khi panel đang đóng.
 *  4. Danh sách/empty state luôn hiển thị; ngày/ca ẩn cùng form với lãnh đạo.
 *  5. Chưa đổi API /api/routine — đây là thay đổi UI-only.
 */
import fs from "fs";
import path from "path";

import {
  ROUTINE_DECLARATION_MODE_BY_ROLE,
  canDeclareRoutine,
  getRoutineDeclarationMode,
} from "../src/lib/routine-declaration";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`[PASS] ${name}${detail ? " - " + detail : ""}`);
  } else {
    failed++;
    failures.push(`${name}${detail ? " - " + detail : ""}`);
    console.log(`[FAIL] ${name}${detail ? " - " + detail : ""}`);
  }
}

// ---------------------------------------------------------------- 1. Mapping
check(
  "1. UNIT_LEADER ẩn form khai báo",
  getRoutineDeclarationMode("UNIT_LEADER") === "HIDDEN" &&
    canDeclareRoutine("UNIT_LEADER") === false
);
check(
  "1. SYSTEM_ADMIN ẩn form khai báo",
  getRoutineDeclarationMode("SYSTEM_ADMIN") === "HIDDEN" &&
    canDeclareRoutine("SYSTEM_ADMIN") === false
);
check(
  "1. DEPARTMENT_LEADER thấy form thu gọn",
  getRoutineDeclarationMode("DEPARTMENT_LEADER") === "COLLAPSED" &&
    canDeclareRoutine("DEPARTMENT_LEADER") === true
);
check(
  "1. STAFF thấy form thu gọn",
  getRoutineDeclarationMode("STAFF") === "COLLAPSED" && canDeclareRoutine("STAFF") === true
);
check(
  "1. Vai trò chưa rõ/đang tải mặc định thu gọn (không chặn oan)",
  getRoutineDeclarationMode(undefined) === "COLLAPSED" &&
    getRoutineDeclarationMode(null) === "COLLAPSED" &&
    getRoutineDeclarationMode("") === "COLLAPSED" &&
    getRoutineDeclarationMode("VIEWER") === "COLLAPSED"
);
check(
  "1. Bảng mapping chỉ gồm 4 vai trò nghiệp vụ",
  JSON.stringify(Object.keys(ROUTINE_DECLARATION_MODE_BY_ROLE).sort()) ===
    JSON.stringify(["DEPARTMENT_LEADER", "STAFF", "SYSTEM_ADMIN", "UNIT_LEADER"])
);

// ---------------------------------------------------------------- 2. Trang /routine
const pagePath = path.resolve("src/app/routine/page.tsx");
const apiPath = path.resolve("src/app/api/routine/route.ts");
const helperPath = path.resolve("src/lib/routine-declaration.ts");
const page = fs.readFileSync(pagePath, "utf8");
const api = fs.readFileSync(apiPath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");

check(
  "2. Trang dùng helper mapping dùng chung",
  page.includes('from "@/lib/routine-declaration"') &&
    page.includes("getRoutineDeclarationMode(permissionUser?.role)")
);
check(
  "2. Trang lấy vai trò từ usePermissions (không tự đoán role)",
  page.includes("user: permissionUser") && page.includes("permissionUser?.role")
);
check(
  "2. Trang không hardcode lại mã vai trò cho khai báo",
  !page.includes("UNIT_LEADER") && !page.includes("SYSTEM_ADMIN") && !page.includes("DEPARTMENT_LEADER")
);
check(
  "2. Form khai báo chỉ render với vai trò được khai báo",
  /\{canDeclare \? \(/.test(page) && page.includes('const canDeclare = declarationMode !== "HIDDEN"')
);
check(
  "3. Trạng thái panel mặc định đóng",
  /const \[isDeclarationOpen, setIsDeclarationOpen\] = useState\(false\)/.test(page)
);
check(
  "3. Nút khai báo có aria-expanded theo trạng thái panel",
  page.includes("aria-expanded={isDeclarationOpen}")
);
check(
  "3. Nút khai báo trỏ tới panel qua aria-controls",
  page.includes('aria-controls="routine-declaration-panel"') &&
    page.includes('data-testid="routine-declaration-toggle"')
);
check(
  "3. Panel có id/testid và bị ẩn khi đóng",
  page.includes('id="routine-declaration-panel"') &&
    page.includes('data-testid="routine-declaration-panel"') &&
    page.includes("hidden={!isDeclarationOpen}")
);
check(
  "3. Bấm nút đảo trạng thái mở/đóng, nhãn đổi theo trạng thái",
  page.includes("onClick={() => setIsDeclarationOpen((open) => !open)}") &&
    page.includes('"Thu gọn khai báo"') &&
    page.includes('"Khai báo đầu việc"')
);

// Nút xác nhận 1-chạm phải nằm NGOÀI panel để dùng được khi form đang đóng.
const panelStart = page.indexOf('id="routine-declaration-panel"');
const formEnd = page.indexOf("</form>", panelStart);
const panelClose = page.indexOf("</div>", formEnd);
const quickViolation = page.indexOf('data-testid="routine-no-violation"');
const quickActivity = page.indexOf('data-testid="routine-no-activity"');
check(
  "4. Có panel khai báo và thẻ form đóng đúng thứ tự",
  panelStart > -1 && formEnd > panelStart && panelClose > formEnd
);
check(
  "4. 'Xác nhận không phát sinh' vẫn hiện khi panel đóng",
  quickViolation > panelClose && quickActivity > panelClose
);
check(
  "4. Nút 1-chạm full-width trên mobile, không tràn ngang",
  (page.match(/w-full sm:w-auto px-4 py-2/g) || []).length >= 2
);

// Lãnh đạo: không có ngày/ca của bản ghi mới, không có form, chỉ còn danh sách.
const declareGuard = page.indexOf("{canDeclare && (");
const entryDate = page.indexOf('data-testid="routine-entry-date"');
check(
  "5. Ngày ghi nhận/ca làm việc nằm trong guard canDeclare",
  declareGuard > -1 && entryDate > declareGuard && page.includes('data-testid="routine-work-shift"')
);
check(
  "5. Lãnh đạo thấy thông báo thay cho form khai báo",
  page.includes('data-testid="routine-declaration-hidden"') &&
    page.includes("Tài khoản lãnh đạo đơn vị không khai báo đầu việc trong ca")
);
const hiddenNote = page.indexOf('data-testid="routine-declaration-hidden"');
const listTitle = page.indexOf('data-testid="routine-list-title"');
check(
  "5. Danh sách nhật ký vẫn render sau nhánh ẩn form",
  hiddenNote > -1 && listTitle > hiddenNote
);
check(
  "5. Empty state vẫn hiển thị cho mọi vai trò",
  page.includes("Chưa có nhật ký nào được ghi nhận")
);
const emptyHint = page.indexOf("Đồng chí có thể nhập nội dung thực tế ở form trên");
const emptyHintGuard = emptyHint > -1 ? page.lastIndexOf("{canDeclare && (", emptyHint) : -1;
check(
  "5. Gợi ý nhập form trong empty state chỉ hiện với vai trò khai báo",
  emptyHint > -1 && emptyHintGuard > -1 && emptyHint - emptyHintGuard < 200
);
check(
  "5. Header form xuống dòng trên mobile (không tràn)",
  page.includes("flex flex-col gap-2 border-b border-surface-container") &&
    page.includes("sm:flex-row sm:items-center sm:justify-between")
);

// ---------------------------------------------------------------- 3. UI-only
check(
  "6. Helper ghi rõ đây là quy tắc giao diện tạm thời",
  helper.includes("API `/api/routine` vẫn cho phép khai báo")
);
check(
  "6. API /api/routine chưa áp mapping vai trò trong task này (UI-only)",
  !api.includes("routine-declaration") &&
    !api.includes("UNIT_LEADER") &&
    !api.includes("SYSTEM_ADMIN")
);

// ---------------------------------------------------------------- Kết quả
console.log(`\n=== KẾT QUẢ: ${passed} pass / ${failed} fail ===`);
if (failed > 0) {
  console.error("\nCác kiểm tra THẤT BẠI:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log("Tất cả kiểm tra PASS");

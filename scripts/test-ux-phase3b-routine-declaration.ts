/**
 * UX Phase 3B — Kiểm thử TĨNH: ẩn/thu gọn "Khai báo đầu việc trong ca" theo vai trò.
 *
 * Chạy KHÔNG cần DB / server:
 *   npx tsx scripts/test-ux-phase3b-routine-declaration.ts
 *
 * Phạm vi:
 *  1. Mapping vai trò → HIDDEN | COLLAPSED (UNIT_LEADER/SYSTEM_ADMIN ẩn,
 *     DEPARTMENT_LEADER/STAFF thu gọn).
 *  2. Cổng tải quyền: khi `loading` chỉ có placeholder, không lộ form/nút 1-chạm;
 *     tải xong mới áp mapping (chống flash cho lãnh đạo ở lần tải nguội).
 *  3. Nút mở/đóng có aria-expanded + aria-controls; panel ẩn mặc định.
 *  4. "Xác nhận không phát sinh" vẫn bấm được khi panel đang đóng và KHÔNG dùng
 *     bản nháp ẩn; thông báo ẩn dùng câu trung tính theo vai trò.
 *  5. Danh sách/empty state luôn hiển thị; ngày/ca ẩn cùng form với lãnh đạo.
 *  6. Chưa đổi API /api/routine — đây là thay đổi UI-only.
 */
import fs from "fs";
import path from "path";

import {
  ROUTINE_DECLARATION_MODE_BY_ROLE,
  canDeclareRoutine,
  getRoutineDeclarationMode,
  resolveRoutineDeclarationState,
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
  "1. Vai trò lạ mặc định thu gọn (không chặn oan)",
  getRoutineDeclarationMode("VIEWER") === "COLLAPSED" &&
    getRoutineDeclarationMode(undefined) === "COLLAPSED" &&
    getRoutineDeclarationMode(null) === "COLLAPSED" &&
    getRoutineDeclarationMode("") === "COLLAPSED"
);
check(
  "1. Bảng mapping chỉ gồm 4 vai trò nghiệp vụ",
  JSON.stringify(Object.keys(ROUTINE_DECLARATION_MODE_BY_ROLE).sort()) ===
    JSON.stringify(["DEPARTMENT_LEADER", "STAFF", "SYSTEM_ADMIN", "UNIT_LEADER"])
);

// ---------------------------------------------------------------- 2. Cổng tải quyền
check(
  "2. Đang tải quyền luôn là LOADING dù role cache là gì",
  resolveRoutineDeclarationState(true, undefined) === "LOADING" &&
    resolveRoutineDeclarationState(true, null) === "LOADING" &&
    resolveRoutineDeclarationState(true, "UNIT_LEADER") === "LOADING" &&
    resolveRoutineDeclarationState(true, "SYSTEM_ADMIN") === "LOADING" &&
    resolveRoutineDeclarationState(true, "STAFF") === "LOADING"
);
check(
  "2. Tải xong mới áp mapping: lãnh đạo ẩn, công chức thu gọn",
  resolveRoutineDeclarationState(false, "UNIT_LEADER") === "HIDDEN" &&
    resolveRoutineDeclarationState(false, "SYSTEM_ADMIN") === "HIDDEN" &&
    resolveRoutineDeclarationState(false, "STAFF") === "COLLAPSED" &&
    resolveRoutineDeclarationState(false, "DEPARTMENT_LEADER") === "COLLAPSED"
);
check(
  "2. Tải xong nhưng không có user/vai trò → UNKNOWN, không đoán bừa",
  resolveRoutineDeclarationState(false, null) === "UNKNOWN" &&
    resolveRoutineDeclarationState(false, undefined) === "UNKNOWN" &&
    resolveRoutineDeclarationState(false, "") === "UNKNOWN"
);
check(
  "2. Không chặn công chức sau khi tải xong",
  resolveRoutineDeclarationState(false, "STAFF") === "COLLAPSED"
);

// ---------------------------------------------------------------- 3. Trang /routine
const pagePath = path.resolve("src/app/routine/page.tsx");
const apiPath = path.resolve("src/app/api/routine/route.ts");
const helperPath = path.resolve("src/lib/routine-declaration.ts");
const page = fs.readFileSync(pagePath, "utf8");
const api = fs.readFileSync(apiPath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");

check(
  "3. Trang dùng helper trạng thái dùng chung",
  page.includes('from "@/lib/routine-declaration"') &&
    page.includes("resolveRoutineDeclarationState(") &&
    page.includes("permissionsLoading") &&
    page.includes("permissionUser?.role")
);
check(
  "3. Trang lấy cả loading + user từ usePermissions",
  page.includes("user: permissionUser") && page.includes("loading: permissionsLoading")
);
check(
  "3. Trang không hardcode lại mã vai trò cho khai báo",
  !page.includes("UNIT_LEADER") && !page.includes("SYSTEM_ADMIN") && !page.includes("DEPARTMENT_LEADER")
);
check(
  "3. Form khai báo chỉ render ở trạng thái COLLAPSED",
  page.includes('const canDeclare = declarationState === "COLLAPSED"') &&
    page.includes(") : canDeclare ? (")
);
const loadingStart = page.indexOf('data-testid="routine-declaration-loading"');
const unknownStart = page.indexOf('data-testid="routine-declaration-unavailable"');
const toggleStart = page.indexOf('data-testid="routine-declaration-toggle"');
const panelStart = page.indexOf('id="routine-declaration-panel"');
check(
  "3. Thứ tự nhánh: LOADING → UNKNOWN → form thu gọn",
  loadingStart > -1 && unknownStart > loadingStart && toggleStart > unknownStart && panelStart > toggleStart
);
const loadingBlock = page.slice(Math.max(0, loadingStart - 160), unknownStart);
check(
  "3. Placeholder LOADING không có form/field/nút 1-chạm",
  loadingBlock.length > 0 &&
    !loadingBlock.includes("<form") &&
    !loadingBlock.includes('data-testid="routine-title"') &&
    !loadingBlock.includes('data-testid="routine-no-violation"') &&
    !loadingBlock.includes('data-testid="routine-declaration-toggle"')
);
const unknownBlock = page.slice(unknownStart, toggleStart);
check(
  "3. Nhánh UNKNOWN không có form/field/nút 1-chạm",
  unknownBlock.length > 0 &&
    !unknownBlock.includes("<form") &&
    !unknownBlock.includes('data-testid="routine-title"') &&
    !unknownBlock.includes('data-testid="routine-no-violation"') &&
    unknownBlock.includes("Chưa xác định được quyền khai báo")
);
check(
  "3. Placeholder LOADING có aria-busy/role=status",
  loadingBlock.includes('role="status"') && loadingBlock.includes("aria-busy")
);

check(
  "4. Trạng thái panel mặc định đóng",
  /const \[isDeclarationOpen, setIsDeclarationOpen\] = useState\(false\)/.test(page)
);
check(
  "4. Nút khai báo có aria-expanded theo trạng thái panel",
  page.includes("aria-expanded={isDeclarationOpen}")
);
check(
  "4. Nút khai báo trỏ tới panel qua aria-controls",
  page.includes('aria-controls="routine-declaration-panel"') &&
    page.includes('data-testid="routine-declaration-toggle"')
);
check(
  "4. Panel có id/testid và bị ẩn khi đóng",
  page.includes('data-testid="routine-declaration-panel"') &&
    page.includes("hidden={!isDeclarationOpen}")
);
check(
  "4. Bấm nút đảo trạng thái mở/đóng, nhãn đổi theo trạng thái",
  page.includes("onClick={() => setIsDeclarationOpen((open) => !open)}") &&
    page.includes('"Thu gọn khai báo"') &&
    page.includes('"Khai báo đầu việc"')
);

// Nút xác nhận 1-chạm phải nằm NGOÀI panel để dùng được khi form đang đóng.
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
  "4. Một chạm khi panel đóng bỏ qua bản nháp ẩn (title/notes)",
  page.includes('const draftTitle = isDeclarationOpen && !isNoActivity ? newTitle.trim() : "";') &&
    page.includes('const draftNotes = isDeclarationOpen ? newNotes.trim() : "";') &&
    page.includes("notes: draftNotes || defaultNotes")
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
  "5. Thông báo ẩn dùng câu trung tính, không gán 'lãnh đạo đơn vị'",
  page.includes('data-testid="routine-declaration-hidden"') &&
    page.includes("Tài khoản này không khai báo đầu việc trong ca") &&
    !page.includes("Tài khoản lãnh đạo đơn vị")
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

// ---------------------------------------------------------------- 6. UI-only
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

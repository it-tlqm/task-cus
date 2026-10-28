import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
};
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

console.log("=== My Work: một bộ khung dùng chung ===");
const myWork = read("src/app/my-work/page.tsx");
check("Chỉ còn một PageHeader", (myWork.match(/<PageHeader/g) || []).length === 1, (myWork.match(/<PageHeader/g) || []).length);
check("Chỉ còn một bộ lọc thời gian", (myWork.match(/data-tour="time-filter"/g) || []).length === 1);
check("Chỉ còn một JournalFilterBar", (myWork.match(/<JournalFilterBar/g) || []).length === 1);
check("Chỉ còn một MyWorkItemsSection", (myWork.match(/<MyWorkItemsSection/g) || []).length === 1);
check("Có tìm kiếm trên mobile", myWork.includes("Tìm kiếm công việc"));
check("Bảng desktop có chiều rộng tối thiểu", myWork.includes('min-w-[1220px]'));
check("Bộ lọc cuộn ngang trên mobile", myWork.includes("[&>div:first-child]:overflow-x-auto"));

console.log("\n=== Báo cáo: drawer & so sánh bản chụp ===");
const reports = read("src/app/reports/page.tsx");
check("Bộ lọc có lớp phủ mobile", reports.includes("Bộ lọc báo cáo") && reports.includes("fixed inset-0 z-40"));
check("Bộ lọc là dialog trên mobile", reports.includes('role={filterExpanded ? "dialog" : undefined}'));
check("Desktop luôn hiện bộ lọc", reports.includes('"hidden lg:grid grid-cols-1 gap-space-md md:grid-cols-3"'));
check("Có so sánh bản chụp với hiện tại", reports.includes("So sánh với số liệu hiện tại"));
check("So sánh có chênh lệch", reports.includes("Chênh lệch = số liệu hiện tại"));
check("Bảng báo cáo có header dính", reports.includes("sticky top-14 z-10 bg-v5-surface"));

console.log("\n=== Kế hoạch: Gantt ===");
const plans = read("src/app/plans/page.tsx");
check("Gantt có mốc hôm nay", plans.includes("ganttData.todayPct"));
check("Thanh lọc kế hoạch dính", plans.includes("sticky top-14 z-20"));
check("Có chuyển góc nhìn Gantt", plans.includes('switchView("gantt")'));

console.log("\n=== Chi tiết công việc: điều hướng nhanh ===");
const task = read("src/app/tasks/[id]/page.tsx");
check("Có thanh điều hướng trong hồ sơ", task.includes('aria-label="Điều hướng nhanh trong hồ sơ"'));
check("Có mục Tiến độ", task.includes('id="task-progress"'));
check("Có mục Nhật ký", task.includes('id="task-timeline"'));
check("Có mục Trao đổi", task.includes('id="task-comments"'));
check("Có mục Tệp đính kèm", task.includes('id="task-attachments"'));
check("Có thanh thao tác cố định mobile", task.includes("Thanh thao tác cố định trên mobile"));

console.log("\n=== Nhập Excel chỉ tiêu ===");
const entry = read("src/app/v5/giao-ban/nhap/page.tsx");
check("Trang nhập có nút Nhập Excel", entry.includes("<MetricExcelImport"));
const component = read("src/components/metrics/MetricExcelImport.tsx");
check("Có tải file mẫu", component.includes("Tải file mẫu"));
check("Có kiểm tra trước khi nhập", component.includes("Hợp lệ {rows.length} ô"));
check("Gọi API nhập hiện có", component.includes('fetch("/api/metrics/entries"'));
check("Chia lô tối đa 200 dòng", component.includes("i += 200"));

console.log("\n=== Quản trị: phân công chính ===");
const org = read("src/app/admin/organization/page.tsx");
check("Hồ sơ cán bộ hiện phân công chính", org.includes("Phân công chính"));
check("Cảnh báo khi chưa có phân công chính", org.includes("Cán bộ chưa có phân công chính"));
check("Có nút bổ sung phân công", org.includes("Bổ sung phân công chính"));
check("Chặn điều chuyển trùng đơn vị/chức vụ", org.includes("Đơn vị và chức vụ chưa thay đổi"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

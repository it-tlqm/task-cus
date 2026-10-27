import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  if (ok) {
    pass++;
    console.log(`[PASS] ${name}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}`);
  }
};
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const pkg = read("package.json");
const tailwind = read("tailwind.config.ts");
const shell = read("src/components/layout/AppShell.tsx");
const v5Shell = read("src/components/v5/V5Shell.tsx");
const v5Page = read("src/app/v5/page.tsx");
const v5Layout = read("src/app/v5/layout.tsx");
const v5GiaoBan = read("src/app/v5/giao-ban/page.tsx");
const v5Entry = read("src/app/v5/giao-ban/nhap/page.tsx");
const button = read("src/components/v5/ui/button.tsx");
const card = read("src/components/v5/ui/card.tsx");
const badge = read("src/components/v5/ui/badge.tsx");

check("Có shadcn dependency CVA", pkg.includes("class-variance-authority"));
check("Có Radix Slot", pkg.includes("@radix-ui/react-slot"));
check("Có token V5 trong Tailwind", tailwind.includes("v5-bg") && tailwind.includes("v5-accent"));
check(
  "Đúng bộ màu Hải quan",
  tailwind.includes("#1B3461") && tailwind.includes("#C62222") && tailwind.includes("#F2C41D")
);
check("AppShell bỏ qua chrome cũ cho /v5", shell.includes("isV5Route") && shell.includes('pathname === "/v5"'));
check("V5 có shell riêng", v5Shell.includes("export function V5Shell"));
check("AppShell dùng V5Shell cho toàn bộ màn hình cũ", shell.includes("<V5Shell>"));
check(
  "Mobile dùng sidebar drawer, không dùng tabbar",
  v5Shell.includes("mobileOpen") && v5Shell.includes("fixed inset-0 z-50") && !v5Shell.includes("overflow-x-auto border-t")
);
check("Sidebar section thu gọn/mở rộng", v5Shell.includes("collapsed") && v5Shell.includes("aria-expanded"));
check(
  "Tìm kiếm toàn cục hoạt động",
  v5Shell.includes("CommandPalette") &&
    v5Shell.includes("setCommandOpen(true)") &&
    v5Shell.includes('event.key.toLowerCase() === "k"')
);
check(
  "Tổng quan đạt chỉ tiêu xanh, chưa đạt/chưa nhập đỏ",
  v5Page.includes("revenueTone") && v5Page.includes("text-v5-success") && v5Page.includes("text-v5-danger")
);
check(
  "Chỉ tiêu Thu NSNN khớp kỳ đang chọn",
  v5Page.includes('period === "month"') &&
    v5Page.includes("comparisonRow?.btc") &&
    v5Page.includes("Chưa có chỉ tiêu") &&
    !v5Page.includes("V5 preview")
);
check("V5 layout dùng shell", v5Layout.includes("V5Shell"));
check("V5 dashboard dùng widget, không bảng", v5Page.includes("MetricWidget") && !v5Page.includes("<table"));
check(
  "V5 có bảng tổng hợp số thu ở đầu",
  v5Page.includes("RevenueSummaryTable") &&
    v5Page.indexOf("<RevenueSummaryTable") < v5Page.indexOf("<KpiTile") &&
    fs.existsSync(path.join(root, "src/components/v5/RevenueSummaryTable.tsx"))
);
check("V5 dashboard dùng token mới", v5Page.includes("bg-v5-bg") && v5Page.includes("text-v5-ink"));
check("V5 dashboard dùng shadcn primitives", v5Page.includes("Card") && v5Page.includes("Badge") && v5Page.includes("Button"));
check("Button có variant", button.includes("buttonVariants") && button.includes("asChild"));
check("Card có compound primitives", card.includes("CardHeader") && card.includes("CardContent"));
check("Badge có variant", badge.includes("badgeVariants"));
check("Có design system doc", fs.existsSync(path.join(root, "docs/V5/DESIGN_SYSTEM.md")));
check("Có link V5 từ giao diện cũ", read("src/app/dashboard/page.tsx").includes('href="/v5"'));
check(
  "V5 có trang Giao ban và nav ưu tiên",
  v5Shell.includes('href: "/v5/giao-ban"') &&
    v5GiaoBan.includes("RevenueSummaryTable") &&
    v5GiaoBan.includes("MetricsSummaryTable")
);
check(
  "Có lối vào Chỉ tiêu giao / Phân công nhập",
  v5Shell.includes("tab=TARGET") &&
    v5Shell.includes("tab=ASSIGN") &&
    v5GiaoBan.includes("Chỉ tiêu giao") &&
    v5GiaoBan.includes("Phân công nhập")
);
check(
  "V5 có màn hình nhập số liệu tối ưu",
  v5Entry.includes("Cần nhập") &&
    v5Entry.includes("Tính từ lũy kế") &&
    v5Entry.includes("/api/metrics/entries/cumulative") &&
    v5Entry.includes("Lưu")
);
check(
  "Nhập số liệu có tìm kiếm, cảnh báo chưa lưu và lưu mobile",
  v5Entry.includes("Tìm chỉ tiêu") &&
    v5Entry.includes("thay đổi chưa lưu") &&
    v5Entry.includes("beforeunload") &&
    v5Entry.includes("fixed inset-x-0 bottom-0") &&
    !v5Entry.includes(">V5</Badge>")
);
check(
  "Tab V5 có hành vi thật",
  v5Page.includes("setTab") && v5Page.includes("scrollIntoView") && v5GiaoBan.includes("setTab")
);
check(
  "Giao ban có biểu đồ",
  v5GiaoBan.includes("RevenueCharts") && fs.existsSync(path.join(root, "src/components/v5/RevenueCharts.tsx"))
);
const narrativePanel = read("src/components/v5/GiaoBanNarrativePanel.tsx");
const configPage = read("src/app/giao-ban/cau-hinh/page.tsx");
const reportPage = read("src/app/giao-ban/bao-cao/page.tsx");
check(
  "Giao ban V5 có nhận xét thật",
  v5GiaoBan.includes("GiaoBanNarrativePanel") &&
    narrativePanel.includes("/api/narratives") &&
    narrativePanel.includes("Lưu nhận xét")
);
check(
  "Cấu hình và báo cáo giao ban dùng header V5",
  configPage.includes("Cấu hình giao ban") &&
    configPage.includes("/v5/giao-ban") &&
    configPage.includes("text-2xl") &&
    reportPage.includes("Báo cáo giao ban") &&
    reportPage.includes("/v5/giao-ban") &&
    reportPage.includes("text-2xl")
);
check(
  "Cấu hình và báo cáo giao ban dùng token V5",
  !configPage.includes("bg-surface-container-lowest") &&
    !configPage.includes("border-border-default") &&
    !configPage.includes("text-on-surface") &&
    !reportPage.includes("bg-surface-container-lowest") &&
    !reportPage.includes("border-border-default") &&
    !reportPage.includes("text-on-surface")
);
check(
  "Giao ban V5 bỏ nút chết và link bản cũ",
  !v5GiaoBan.includes("ListFilter") &&
    !v5GiaoBan.includes("Mở bản đầy đủ") &&
    !v5GiaoBan.includes('href="/giao-ban"')
);
const tasksPage = read("src/app/tasks/page.tsx");
const approvalsPage = read("src/app/approvals/page.tsx");
check(
  "Công việc dùng header/KPI/lọc V5",
  tasksPage.includes("Công việc chỉ đạo") &&
    tasksPage.includes("Giao nhiệm vụ") &&
    tasksPage.includes("Tìm mã việc") &&
    tasksPage.includes("<Card") &&
    !tasksPage.includes("min-h-screen bg-app-bg")
);
check(
  "Chặn giao việc khi tài khoản thiếu bộ phận chính",
  read("src/app/api/tasks/route.ts").includes("Tài khoản chưa được gán bộ phận chính") &&
    tasksPage.includes("chưa được gán bộ phận chính")
);
check(
  "Phê duyệt dùng header/KPI/tab V5",
  approvalsPage.includes("Hồ sơ của tôi") &&
    approvalsPage.includes("Làm mới") &&
    approvalsPage.includes("<Card") &&
    !approvalsPage.includes("max-w-2xl") &&
    !approvalsPage.includes("TRUNG TÂM PHÊ DUYỆT")
);
const myWorkPage = read("src/app/my-work/page.tsx");
const plansPage = read("src/app/plans/page.tsx");
check(
  "Công chức nhận việc dùng header/KPI V5",
  myWorkPage.includes("Công việc của tôi") &&
    myWorkPage.includes("<Card") &&
    !myWorkPage.includes("Audit Trail") &&
    !myWorkPage.includes("bg-surface-container-lowest")
);
check(
  "Kế hoạch dùng token V5",
  plansPage.includes("Tạo kế hoạch") &&
    plansPage.includes("text-2xl font-semibold tracking-tight text-v5-ink") &&
    !plansPage.includes("bg-surface-container-lowest") &&
    !plansPage.includes("border-border-default")
);
const reportsPage = read("src/app/reports/page.tsx");
check(
  "Báo cáo dùng header/tab V5 và bỏ từ kỹ thuật",
  reportsPage.includes("text-2xl font-semibold tracking-tight text-v5-ink") &&
    reportsPage.includes("<Button") &&
    reportsPage.includes("Filter") &&
    reportsPage.includes("Table2") &&
    reportsPage.includes("snapshotsList.length") &&
    !reportsPage.includes("TALUNG-CUS-WORK") &&
    !reportsPage.includes("Locked Snapshots") &&
    !reportsPage.includes("MD5:") &&
    !reportsPage.includes("bg-surface-container-lowest")
);
const monthlyResults = read("src/app/monthly-results/page.tsx");
check(
  "Kết quả tháng dùng header/KPI/token V5",
  monthlyResults.includes("Kết quả công tác tháng") &&
    monthlyResults.includes("<Card") &&
    !monthlyResults.includes("bg-white") &&
    !monthlyResults.includes("slate-") &&
    !monthlyResults.includes("teal-")
);
const routine = read("src/app/routine/page.tsx");
check(
  "Nhật ký responsive mobile và bỏ từ kỹ thuật",
  routine.includes("grid w-full grid-cols-1 gap-2 sm:grid-cols-2") &&
    routine.includes("Thiết kế biểu mẫu") &&
    !routine.includes("No-Code v") &&
    !routine.includes("Audit Trail")
);

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

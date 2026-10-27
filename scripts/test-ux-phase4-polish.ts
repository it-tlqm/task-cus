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

const plans = read("src/app/plans/page.tsx");
const giaoBan = read("src/app/giao-ban/page.tsx");
const routine = read("src/lib/routine-declaration.ts");
const dashboard = read("src/app/dashboard/page.tsx");
const targetEditor = read("src/components/metrics/MetricTargetDraftEditor.tsx");
const targetManager = read("src/components/metrics/MetricTargetManager.tsx");
const targetService = read("src/server/metric-targets.ts");
const targetRoute = read("src/app/api/metrics/targets/[id]/route.ts");

check(
  "#10 Cảnh báo phân công dùng details thu gọn",
  plans.includes("data-testid=\"plan-assignment-warning\"") &&
    plans.includes("<details") &&
    plans.includes("Cảnh báo phân công (")
);
check("#10 Có đếm số dòng chưa phân nhóm", plans.includes("unassignedItemCount"));
check(
  "#17 Cột lũy kế tháng/quý/năm in đậm + màu",
  giaoBan.includes("bg-primary/5 font-bold text-primary") &&
    giaoBan.includes("lũy kế")
);
check(
  "#6 Lãnh đạo bộ phận không thấy form khai báo",
  routine.includes("DEPARTMENT_LEADER: \"HIDDEN\"")
);
check(
  "#16 Kỳ Hôm nay/Tuần/Tháng/Tất cả cùng hàng, có aria-pressed",
  (dashboard.match(/aria-pressed=\{period ===/g) || []).length === 4 &&
    dashboard.includes("whitespace-nowrap px-2 py-1.5") &&
    dashboard.includes("sm:min-w-[440px]")
);
check(
  "#7 Có lối mở kế hoạch trùng để sửa/xóa",
  plans.includes("open-duplicate-plan-btn") &&
    plans.includes("duplicatePlanId") &&
    plans.includes("Mở kế hoạch trùng để sửa/xóa")
);
check(
  "#11 Không tự ý đổi đơn vị target đã chốt",
  !targetEditor.includes("vndTargetLooksTooSmall") &&
    !targetEditor.includes("Nhân 1.000") &&
    targetEditor.includes("Nhập số tiền bằng đồng")
);
check(
  "#11b Có luồng điều chỉnh chỉ tiêu đã chốt, bắt buộc lý do",
  targetEditor.includes("Điều chỉnh chỉ tiêu đã chốt") &&
    targetEditor.includes("onCorrect") &&
    targetEditor.includes("Lý do điều chỉnh (bắt buộc)") &&
    targetManager.includes('action: "correct"') &&
    targetService.includes("correctMetricTarget") &&
    targetService.includes('action: "CORRECT"') &&
    targetRoute.includes('action === "correct"')
);

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

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
check("AppShell bỏ qua chrome cũ cho /v5", shell.includes("isV5Preview") && shell.includes('pathname === "/v5"'));
check("V5 có shell riêng", v5Shell.includes("V5Shell") && v5Shell.toLowerCase().includes("v5 preview"));
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

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

import fs from "node:fs";
import path from "node:path";
import { metricInputMode } from "../src/lib/metric-input-mode";

const root = process.cwd();
let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${name}`);
  if (ok) pass++;
  else fail++;
};
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

check(
  "Mặc định là số phát sinh",
  metricInputMode({ derivation: { entryPeriod: "DAY" } }) === "INCREMENTAL"
);
check(
  "Đọc được kiểu lũy kế ngày",
  metricInputMode({ derivation: { entryPeriod: "DAY", inputMode: "CUMULATIVE" } }) === "CUMULATIVE"
);

const metrics = read("src/server/metrics.ts");
check("Summary xử lý lũy kế ngày", metrics.includes('metricInputMode(metric) === "CUMULATIVE"'));
check("Summary trừ số mở đầu kỳ", metrics.includes("openingFor(metricId, classificationId, range.start)"));

const entries = read("src/app/api/metrics/entries/route.ts");
check("API nhập liệu trả kiểu nhập", entries.includes("inputMode: metricInputMode(m)"));
check("API nhập liệu chặn phân loại sai", entries.includes("classificationKeys.has"));

const entryPage = read("src/app/v5/giao-ban/nhap/page.tsx");
check("Trang nhập hiển thị lũy kế ngày", entryPage.includes("Lũy kế ngày"));
check("Trang nhập đổi placeholder lũy kế", entryPage.includes("Nhập lũy kế đến ngày"));

const adminApi = read("src/app/api/metrics/admin/route.ts");
check("Cấu hình lưu kiểu nhập", adminApi.includes('data.inputMode === "CUMULATIVE"'));

const configPage = read("src/app/giao-ban/cau-hinh/page.tsx");
check("Cấu hình có chọn kiểu nhập", configPage.includes('value="CUMULATIVE"'));
check("Cấu hình có mốc mở đầu kỳ", configPage.includes("OPENING:"));

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

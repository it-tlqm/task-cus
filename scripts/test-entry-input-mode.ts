import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";
import {
  cumulativeBaseBefore,
  incrementalYtdAt,
  normalizeEntryValue,
  periodOpeningBalance,
} from "../src/server/metric-entry-normalize";
import { computeMetricSummary } from "../src/server/metrics";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "[PASS]" : "[FAIL]"} ${label}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (ok) pass++;
  else fail++;
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const D = Prisma.Decimal;

async function main() {
  console.log("=== Quy đổi 4 tổ hợp nhập/lưu ===");
  check(
    "Lưu phát sinh + nhập phát sinh: giữ nguyên",
    normalizeEntryValue({
      storageMode: "INCREMENTAL",
      inputMode: "INCREMENTAL",
      base: new D(1000),
      value: new D(250),
    }).toString() === "250"
  );
  check(
    "Lưu phát sinh + nhập lũy kế: trừ lũy kế đầu kỳ",
    normalizeEntryValue({
      storageMode: "INCREMENTAL",
      inputMode: "CUMULATIVE",
      base: new D(1000),
      value: new D(1250),
    }).toString() === "250"
  );
  check(
    "Lưu lũy kế + nhập phát sinh: cộng lũy kế đầu kỳ",
    normalizeEntryValue({
      storageMode: "CUMULATIVE",
      inputMode: "INCREMENTAL",
      base: new D(1000),
      value: new D(250),
    }).toString() === "1250"
  );
  check(
    "Lưu lũy kế + nhập lũy kế: giữ nguyên",
    normalizeEntryValue({
      storageMode: "CUMULATIVE",
      inputMode: "CUMULATIVE",
      base: new D(1000),
      value: new D(1250),
    }).toString() === "1250"
  );

  console.log("\n=== Lũy kế đầu kỳ (CSDL local) ===");
  const suffix = Date.now().toString(36);
  const group = await prisma.metricGroup.findFirst({ orderBy: { sortOrder: "asc" } });
  const person = await prisma.person.findFirst({ select: { id: true } });
  if (!group || !person) {
    console.log("[SKIP] CSDL local thiếu nhóm chỉ tiêu hoặc nhân sự");
  } else {
    const metric = await prisma.metricDefinition.create({
      data: {
        groupId: group.id,
        code: `TEST_INPUT_${suffix}`.toUpperCase(),
        name: "Chỉ tiêu kiểm thử 2 kiểu nhập",
        valueKind: "FLOW",
        active: true,
        derivation: { entryPeriod: "DAY", inputMode: "INCREMENTAL" },
      },
    });
    try {
      const yearBaseline = await prisma.metricBaseline.create({
        data: {
          metricId: metric.id,
          classificationId: "",
          cumKind: "YEAR",
          asOfDate: new Date("2026-09-30T00:00:00.000Z"),
          valueNumeric: new D(1000),
          status: "CONFIRMED",
        },
      });
      const sepEntry = await prisma.metricDailyEntry.create({
        data: {
          metricId: metric.id,
          classificationId: "",
          entryDate: new Date("2026-10-10T00:00:00.000Z"),
          valueNumeric: new D(100),
          enteredById: person.id,
        },
      });
      check(
        "Lũy kế năm = mốc YEAR + phát sinh sau mốc",
        (await incrementalYtdAt(metric.id, "", new Date("2026-10-20T00:00:00.000Z"))).toString() === "1100"
      );
      check(
        "Lũy kế đầu kỳ tháng 11 = hết ngày 31/10",
        (await periodOpeningBalance(metric, "", new Date("2026-11-01T00:00:00.000Z"))).toString() === "1100"
      );

      const dailyBase = await periodOpeningBalance(metric, "", new Date("2026-10-28T00:00:00.000Z"));
      const converted = normalizeEntryValue({
        storageMode: "INCREMENTAL",
        inputMode: "CUMULATIVE",
        base: dailyBase,
        value: new D(1150),
      });
      check("Nhập lũy kế 1.150 với đầu kỳ 1.100 → phát sinh 50", converted.toString() === "50");

      const octEntry = await prisma.metricDailyEntry.create({
        data: {
          metricId: metric.id,
          classificationId: "",
          entryDate: new Date("2026-10-28T00:00:00.000Z"),
          valueNumeric: converted,
          enteredById: person.id,
        },
      });
      const summary = await computeMetricSummary(
        { year: 2026, weekNumber: 44, month: 10, quarter: 4 },
        "full"
      );
      const summaryRow = summary.groups.flatMap((g) => g.metrics).find((m) => m.id === metric.id);
      check("Báo cáo tháng cộng đúng phát sinh đã quy đổi", summaryRow?.cols.month === 150, summaryRow?.cols.month);
      await prisma.metricDailyEntry.delete({ where: { id: octEntry.id } });

      const cumulativeMetric = {
        ...metric,
        derivation: { entryPeriod: "MONTH", inputMode: "CUMULATIVE" },
      };
      const opening = await prisma.metricBaseline.create({
        data: {
          metricId: metric.id,
          classificationId: "cum-class",
          cumKind: "OPENING",
          asOfDate: new Date("2026-01-01T00:00:00.000Z"),
          valueNumeric: new D(500),
          status: "CONFIRMED",
        },
      });
      check(
        "Chỉ tiêu lưu lũy kế lấy mốc mở đầu kỳ",
        (await cumulativeBaseBefore(metric.id, "cum-class", new Date("2026-10-01T00:00:00.000Z"))).toString() ===
          "500"
      );
      check(
        "Lũy kế đầu kỳ theo đúng dạng lưu",
        (await periodOpeningBalance(cumulativeMetric, "cum-class", new Date("2026-10-01T00:00:00.000Z"))).toString() ===
          "500"
      );
      await prisma.metricBaseline.delete({ where: { id: opening.id } });
      await prisma.metricDailyEntry.delete({ where: { id: sepEntry.id } });
      await prisma.metricBaseline.delete({ where: { id: yearBaseline.id } });
    } finally {
      await prisma.metricDefinition.delete({ where: { id: metric.id } }).catch(() => null);
    }
  }

  console.log("\n=== API & giao diện ===");
  const api = read("src/app/api/metrics/entries/route.ts");
  check("API nhận kiểu nhập từng dòng", api.includes('it.inputMode === "INCREMENTAL"'));
  check("API quy đổi theo dạng lưu", api.includes("normalizeEntryValue({"));
  check("API trả lũy kế đầu kỳ", api.includes("openingBalanceBase"));
  check("API cho mọi chỉ tiêu FLOW", api.includes('row.metric.valueKind !== "FLOW"'));
  check("Không thêm cột CSDL", !read("prisma/schema.prisma").includes('@map("input_mode")'));

  const page = read("src/app/v5/giao-ban/nhap/page.tsx");
  check("Trang nhập có chọn Phát sinh", page.includes("Phát sinh"));
  check("Trang nhập có chọn Lũy kế", page.includes("Lũy kế"));
  check("Trang nhập gửi inputMode", page.includes("inputMode: mode"));
  check("Chọn kiểu cho mọi chỉ tiêu FLOW", page.includes('const canChooseMode = metric.valueKind === "FLOW"'));
  check("Hiện lũy kế trước kỳ khi nhập lũy kế", page.includes("Lũy kế trước kỳ"));

  console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

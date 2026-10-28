import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/server/db";
import {
  cumulativeBaseBefore,
  cumulativePeriodValue,
  normalizeCumulativeValue,
} from "../src/server/metric-entry-normalize";

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
  console.log("=== Quy đổi số liệu ===");
  check(
    "Nhập phát sinh: lũy kế = trước kỳ + phát sinh",
    normalizeCumulativeValue({ base: new D(1000), inputMode: "INCREMENTAL", value: new D(250) }).toString() === "1250"
  );
  check(
    "Nhập lũy kế: giữ nguyên tổng",
    normalizeCumulativeValue({ base: new D(1000), inputMode: "CUMULATIVE", value: new D(1250) }).toString() === "1250"
  );
  check(
    "Chưa có mốc đầu kỳ: cộng từ 0",
    normalizeCumulativeValue({ base: new D(0), inputMode: "INCREMENTAL", value: new D(7.5) }).toString() === "7.5"
  );

  console.log("\n=== Mốc lũy kế trước kỳ (CSDL local) ===");
  const suffix = Date.now().toString(36);
  const group = await prisma.metricGroup.findFirst({ orderBy: { sortOrder: "asc" } });
  const person = await prisma.person.findFirst({ select: { id: true } });
  if (!group || !person) {
    console.log("[SKIP] CSDL local thiếu nhóm chỉ tiêu hoặc nhân sự");
  } else {
    const metric = await prisma.metricDefinition.create({
      data: {
        groupId: group.id,
        code: `TEST_CUM_${suffix}`.toUpperCase(),
        name: "Chỉ tiêu kiểm thử lũy kế",
        valueKind: "FLOW",
        active: false,
        derivation: { entryPeriod: "MONTH", inputMode: "CUMULATIVE" },
      },
    });
    try {
      const opening = await prisma.metricBaseline.create({
        data: {
          metricId: metric.id,
          classificationId: "",
          cumKind: "OPENING",
          asOfDate: new Date("2020-01-01T00:00:00.000Z"),
          valueNumeric: new D(1000),
          status: "CONFIRMED",
        },
      });
      check(
        "Lấy mốc mở đầu kỳ",
        (await cumulativeBaseBefore(metric.id, "", new Date("2026-10-31T00:00:00.000Z"))).toString() === "1000"
      );
      check(
        "Trước mốc mở đầu kỳ trả 0",
        (await cumulativeBaseBefore(metric.id, "", new Date("2019-12-31T00:00:00.000Z"))).toString() === "0"
      );

      const entry = await prisma.metricDailyEntry.create({
        data: {
          metricId: metric.id,
          classificationId: "",
          entryDate: new Date("2026-09-30T00:00:00.000Z"),
          valueNumeric: new D(1500),
          enteredById: person.id,
        },
      });
      check(
        "Ưu tiên bản ghi gần nhất trước kỳ",
        (await cumulativeBaseBefore(metric.id, "", new Date("2026-10-31T00:00:00.000Z"))).toString() === "1500"
      );
      check(
        "Số phát sinh của kỳ = lũy kế hiện tại − trước kỳ",
        (
          await cumulativePeriodValue(
            metric.id,
            "",
            new Date("2026-10-31T00:00:00.000Z"),
            new D(1750)
          )
        ).toString() === "250"
      );
      await prisma.metricDailyEntry.delete({ where: { id: entry.id } });
      await prisma.metricBaseline.delete({ where: { id: opening.id } });
    } finally {
      await prisma.metricDefinition.delete({ where: { id: metric.id } }).catch(() => null);
    }
  }

  console.log("\n=== API & giao diện ===");
  const api = read("src/app/api/metrics/entries/route.ts");
  check("API nhận kiểu nhập từng dòng", api.includes('it.inputMode === "INCREMENTAL"'));
  check("API chuẩn hoá trước khi lưu", api.includes("normalizeCumulativeValue({"));
  check("API trả số phát sinh của kỳ", api.includes("periodValueByEntry"));
  check("Không thêm cột CSDL", !read("prisma/schema.prisma").includes('@map("input_mode")'));

  const page = read("src/app/v5/giao-ban/nhap/page.tsx");
  check("Trang nhập có chọn Phát sinh", page.includes("Phát sinh"));
  check("Trang nhập có chọn Lũy kế", page.includes("Lũy kế"));
  check("Trang nhập gửi inputMode", page.includes("inputMode: mode"));
  check("Chuyển kiểu nhập giữ lại số đã có", page.includes("baseToInput(value.valueBase, metric)"));

  console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

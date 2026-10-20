/**
 * test-yc33-scoring-parity.ts — Kiểm thử bộ máy tính điểm YC-33 (Bảng 1).
 *
 * PARITY FIXTURE — trích trực tiếp từ workbook gốc
 * `Dữ liệu.zip` → "3. Nguyễn Hải Yên Nhân viên/Bảng theo dõi, đánh giá  tháng 9 Yên.xlsx"
 *   sheet "Bảng 1 (tính điểm CC)" dòng 12–20 và sheet "Biểu 01A (CC)" dòng 28–39.
 *
 * Kiểm thử:
 *  1. Tổng cộng Bảng 1 khớp file gốc: G19=1719.16, H19=660, I19=1719.16,
 *     L19=1396.01, M19=0, N19=1719.16.
 *  2. Điểm % khớp file gốc: I20=100, L20=81.203029, N20=100.
 *  3. Biểu 01A khớp file gốc: D34=100, D35=L20, D36=100, D37=93.734343,
 *     D38=65.61404, C31=D28=28.5, D39=94.11404.
 *  4. Trạng thái: thiếu hệ số / thiếu số lượng → INSUFFICIENT_DATA;
 *     chưa có quy tắc → PENDING_RULE; không có dòng / G=0 → NOT_APPLICABLE.
 *  5. Không tính trùng khi cùng id xuất hiện 2 lần.
 *  6. Không phát sinh điểm khi thiếu căn cứ (official=false).
 */
import {
  computeBang1,
  computeForm01A,
  BANG1_FORMULA_VERSION,
  type ScoreRowInput,
} from "../src/server/scoring/bang1";

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

function near(a: number | null, b: number, tol = 1e-6): boolean {
  if (a === null) return false;
  return Math.abs(a - b) <= tol;
}

/** 7 dòng công việc đúng như sheet "Bảng 1 (tính điểm CC)" dòng 12–18 của file gốc. */
const FIXTURE_ROWS: ScoreRowInput[] = [
  { id: "r1", title: "Sinh hoạt Chi bộ", factor: 0.2, factorSource: "QD1277_PRODUCT", assignedQty: 1, completedQty: 1, lateDays: 0, reworkCount: 0 },
  { id: "r2", title: "Kiểm tra, giám sát PTVT đường bộ/đường sắt xuất cảnh", factor: 5.4, factorSource: "QD1277_PRODUCT", assignedQty: 3, completedQty: 3, lateDays: 0, reworkCount: 0 },
  { id: "r3", title: "Kiểm tra hồ sơ; phê duyệt tờ khai vận chuyển độc", factor: 5, factorSource: "QD1277_PRODUCT", assignedQty: 17, completedQty: 17, lateDays: 0, reworkCount: 0 },
  { id: "r4", title: "Soi chiếu hành lý của hành khách XNC", factor: 2.04, factorSource: "QD1277_PRODUCT", assignedQty: 29, completedQty: 29, lateDays: 0, reworkCount: 0 },
  { id: "r5", title: "Quản lý, theo dõi trang thiết bị chuyên dùng", factor: 6, factorSource: "QD1277_PRODUCT", assignedQty: 26, completedQty: 26, lateDays: 0, reworkCount: 0 },
  { id: "r6", title: "Xử lý các văn bản được giao trên CCES", factor: 2.3, factorSource: "QD1277_PRODUCT", assignedQty: 562, completedQty: 562, lateDays: 1, reworkCount: 0 },
  { id: "r7", title: "Kiểm tra hồ sơ; phê duyệt tờ khai vận chuyển độc (lần 2)", factor: 5, factorSource: "QD1277_PRODUCT", assignedQty: 22, completedQty: 22, lateDays: 0, reworkCount: 0 },
];

function main() {
  console.log("=== YC-33 — PARITY với workbook gốc (Bảng 1 + Biểu 01A) ===\n");

  const res = computeBang1(FIXTURE_ROWS);

  check("Trạng thái tổng thể = KNOWN", res.status === "KNOWN", res.status);
  check("Phiên bản công thức", res.formulaVersion === BANG1_FORMULA_VERSION, res.formulaVersion);
  check("Tổng G19 = 1719.16", near(res.totals.g, 1719.16), String(res.totals.g));
  check("Tổng H19 = 660", near(res.totals.h, 660), String(res.totals.h));
  check("Tổng I19 = 1719.16", near(res.totals.i, 1719.16), String(res.totals.i));
  check("Tổng L19 = 1396.01", near(res.totals.l, 1396.01), String(res.totals.l));
  check("Tổng M19 = 0", res.totals.m === 0, String(res.totals.m));
  check("Tổng N19 = 1719.16", near(res.totals.n, 1719.16), String(res.totals.n));

  check("I20 (Điểm % số lượng) = 100", near(res.ratios.a, 100), String(res.ratios.a));
  check(
    "L20 (Điểm % tiến độ) = 81.203029",
    near(res.ratios.b, 81.203029, 1e-5),
    String(res.ratios.b)
  );
  check("N20 (Điểm % chất lượng) = 100", near(res.ratios.c, 100), String(res.ratios.c));
  check(
    "d = (a+b+c)/3 = 93.734343",
    near(res.ratios.d, 93.734343, 1e-5),
    String(res.ratios.d)
  );
  check(
    "Điểm tiêu chí kết quả = d*70/100 = 65.61404",
    near(res.ratios.score70, 65.61404, 1e-5),
    String(res.ratios.score70)
  );
  check("official = true khi đủ căn cứ", res.official === true);

  // Kiểm tra từng dòng với công thức gốc
  const r6 = res.rows[5];
  check(
    "Dòng 6 (CCES): I = E*H = 1292.6",
    near(r6.i, 1292.6),
    String(r6.i)
  );
  check(
    "Dòng 6 (CCES): L = I − K×25%×I = 969.45",
    near(r6.l, 969.45),
    String(r6.l)
  );
  check(
    "Dòng 6 (CCES): N = I − M×25%×I = 1292.6",
    near(r6.n, 1292.6),
    String(r6.n)
  );

  // Biểu 01A
  const form = computeForm01A({ ratios: res.ratios, commonCriteriaScore: 28.5 });
  check("01A: D34 = a = 100", near(form.d34, 100), String(form.d34));
  check("01A: D35 = b = L20", near(form.d35, 81.203029, 1e-5), String(form.d35));
  check("01A: D36 = c = 100", near(form.d36, 100), String(form.d36));
  check("01A: D37 = 93.734343", near(form.d37, 93.734343, 1e-5), String(form.d37));
  check("01A: D38 = 65.61404", near(form.d38, 65.61404, 1e-5), String(form.d38));
  check("01A: C31 = 28.5", near(form.c31, 28.5), String(form.c31));
  check("01A: D39 = 94.11404", near(form.d39, 94.11404, 1e-5), String(form.d39));
  check("01A: trạng thái KNOWN", form.status === "KNOWN", form.status);

  // ---------------------------------------------------------------- trạng thái
  console.log("\n--- Trạng thái dữ liệu thiếu ---");

  const missingFactor = computeBang1([
    { ...FIXTURE_ROWS[0], factor: null, factorSource: "MISSING" },
  ]);
  check(
    "Thiếu hệ số → INSUFFICIENT_DATA",
    missingFactor.status === "INSUFFICIENT_DATA",
    missingFactor.status
  );
  check(
    "Thiếu hệ số → KHÔNG phát sinh điểm",
    missingFactor.official === false && missingFactor.ratios.a === null
  );
  check(
    "Thiếu hệ số → có lý do rõ ràng",
    missingFactor.rows[0].reasons.length > 0,
    missingFactor.rows[0].reasons[0]
  );

  const missingQty = computeBang1([
    { ...FIXTURE_ROWS[0], completedQty: null },
  ]);
  check(
    "Thiếu số lượng hoàn thành → INSUFFICIENT_DATA",
    missingQty.status === "INSUFFICIENT_DATA",
    missingQty.status
  );

  const pendingRule = computeBang1([
    { ...FIXTURE_ROWS[0], factor: null, factorSource: "PENDING_RULE" },
  ]);
  check(
    "Chưa có quy tắc ánh xạ hệ số → PENDING_RULE",
    pendingRule.status === "PENDING_RULE",
    pendingRule.status
  );

  const empty = computeBang1([]);
  check("Không có dòng → NOT_APPLICABLE", empty.status === "NOT_APPLICABLE", empty.status);

  const zeroG = computeBang1([
    { ...FIXTURE_ROWS[0], factor: 0, assignedQty: 10, completedQty: 10 },
  ]);
  check(
    "Tổng quy đổi = 0 → NOT_APPLICABLE (không chia 0)",
    zeroG.status === "NOT_APPLICABLE",
    zeroG.status
  );
  check("Tổng quy đổi = 0 → không có tỷ lệ", zeroG.ratios.a === null);

  // Chống tính trùng
  const dup = computeBang1([...FIXTURE_ROWS, FIXTURE_ROWS[0]]);
  check(
    "Cùng id 2 lần → chỉ tính 1 lần",
    dup.rows.length === 7,
    `${dup.rows.length} dòng`
  );
  check("Bỏ dòng lặp → có lý do", dup.reasons.length > 0, dup.reasons[0]);
  check("Tổng G không đổi khi có dòng lặp", near(dup.totals.g, 1719.16), String(dup.totals.g));

  // Phân biệt hệ số TX vs QĐ1277
  const txRow = computeBang1([
    { ...FIXTURE_ROWS[0], factorSource: "TX_CATALOG" },
  ]);
  check(
    "Nguồn hệ số được ghi rõ (TX_CATALOG)",
    txRow.rows[0].factorSource === "TX_CATALOG",
    txRow.rows[0].factorSource
  );

  // Ổn định kết quả
  const again = computeBang1(FIXTURE_ROWS);
  check(
    "Tính lại cho kết quả giống hệt (decimal-safe)",
    JSON.stringify(again.totals) === JSON.stringify(res.totals) &&
      JSON.stringify(again.ratios) === JSON.stringify(res.ratios)
  );

  console.log("\n========================================");
  console.log(`KẾT QUẢ YC-33 (parity): ${passed} pass / ${failed} fail`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nCác mục lỗi:");
    for (const f of failures) console.log(" - " + f);
    process.exit(1);
  }
  process.exit(0);
}

main();

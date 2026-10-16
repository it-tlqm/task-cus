import { computeScorePreview } from "../src/server/monthly-score";

let fail = 0;
const eq = (a: any, b: any, msg: string) => {
  if (a !== b) { console.error(`FAIL ${msg}: got ${a}, expect ${b}`); fail++; }
};

// Ví dụ kiểm chứng tay theo công thức mẫu:
// Dòng 1: E=5.4 F=3 H=3 K=0 M=0 → g=16.2 i=16.2 l=16.2 n=16.2
// Dòng 2: E=2.3 F=100 H=95 K=1 M=1 → g=230 i=218.5 l=163.875 n=163.875
const r = computeScorePreview([
  { factor: 5.4, assignedQty: 3, completedQty: 3, lateDays: 0, reworkCount: 0 },
  { factor: 2.3, assignedQty: 100, completedQty: 95, lateDays: 1, reworkCount: 1 },
]);
eq(r.totalAssignedConverted, 246.2, "G");
eq(r.totalCompletedConverted, 234.7, "I");
eq(r.qtyRatio, 95.33, "a");
// L = 16.2 + 163.875 = 180.075 → b = 180.075/246.2*100 = 73.148… → 73.14 (float IEEE)
eq(r.progressRatio, 73.14, "b");
eq(r.qualityRatio, 73.14, "c");
eq(r.averageD, 80.54, "d");
eq(r.score70, 56.38, "score70");
eq(r.official, false, "official-flag");

// Rỗng / G=0 → null, không chia 0
const e2 = computeScorePreview([]);
eq(e2.qtyRatio, null, "empty-a");
const e3 = computeScorePreview([{ factor: null, assignedQty: null, completedQty: 5, lateDays: 0, reworkCount: 0 }]);
eq(e3.qtyRatio, null, "zero-G-a");

if (fail === 0) console.log("SCORE-LOGIC-OK");
else process.exit(1);

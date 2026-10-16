import { isValidProgressStep, normalizeTitle } from "../src/server/idempotency";

const cases: Array<[unknown, boolean]> = [
  [0, true], [5, true], [15, true], [25, true], [95, true], [100, true],
  [3, false], [7, false], [99, false], [-5, false], [105, false],
  [NaN, false], ["50", false], [undefined, false], [50.5, false],
];
let fail = 0;
for (const [input, expected] of cases) {
  const got = isValidProgressStep(input);
  if (got !== expected) { console.error(`FAIL progress ${String(input)} => ${got}, expect ${expected}`); fail++; }
}
if (normalizeTitle("  Kiểm  tra   BARIE ") !== "kiểm tra barie") { console.error("FAIL normalize"); fail++; }
if (fail === 0) console.log("IDEMPOTENCY-LOGIC-OK");
else process.exit(1);

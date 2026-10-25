import { formatNumberInputDisplay, sanitizeNumberInput } from "../src/components/ui/FormattedNumberInput";

let pass = 0;
let fail = 0;
const check = (name: string, actual: string, expected: string) => {
  if (actual === expected) {
    pass++;
    console.log(`[PASS] ${name} = ${actual}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}: expected ${expected}, got ${actual}`);
  }
};

check("1000", formatNumberInputDisplay("1000"), "1.000");
check("1000000", formatNumberInputDisplay("1000000"), "1.000.000");
check("1000,5", formatNumberInputDisplay("1000,5"), "1.000,5");
check("1000.5 legacy", formatNumberInputDisplay("1000.5"), "1.000,5");
check("negative", formatNumberInputDisplay("-1000"), "-1.000");
check("grouped input", sanitizeNumberInput("1.000"), "1000");
check("decimal input", sanitizeNumberInput("1.000,5"), "1000,5");
check("invalid chars", sanitizeNumberInput("abc1.000xyz"), "1000");
check("multiple commas", sanitizeNumberInput("1.000,,5"), "1000,5");
check("empty", formatNumberInputDisplay(""), "");

console.log(`\nKẾT QUẢ: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);

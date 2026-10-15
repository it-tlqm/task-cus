/**
 * RED test Slice 3: mật khẩu demo123 và Talung@2026 không được chấp nhận chéo.
 * Chạy: npx tsx scripts/test-password-isolation.ts (không cần DB).
 */
import bcrypt from "bcryptjs";
import { verifyPassword } from "../src/server/auth";

async function main() {
const demoHash = await bcrypt.hash("demo123", 10);
const prodHash = await bcrypt.hash("Talung@2026", 10);

let pass = 0;
let fail = 0;
async function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) {
    pass++;
    console.log(`[PASS] ${name}`);
  } else {
    fail++;
    console.log(`[FAIL] ${name}: got ${actual}, kỳ vọng ${expected}`);
  }
}

await check("demo123 khớp hash demo123", await verifyPassword("demo123", demoHash), true);
await check("Talung@2026 khớp hash Talung@2026", await verifyPassword("Talung@2026", prodHash), true);
await check("Talung@2026 KHÔNG khớp hash demo123", await verifyPassword("Talung@2026", demoHash), false);
await check("demo123 KHÔNG khớp hash Talung@2026", await verifyPassword("demo123", prodHash), false);
await check("mật khẩu sai bị từ chối", await verifyPassword("sai-mat-khau", demoHash), false);

console.log(`\n== KẾT QUẢ: ${pass} PASS / ${fail} FAIL ==`);
process.exit(fail > 0 ? 1 : 0);
}

main();

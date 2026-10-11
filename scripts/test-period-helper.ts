import {
  getIsoWeekBounds,
  getIsoWeekFromDate,
  formatPeriodRangeFromDates,
  getDaysOfWeekFromStart,
  evaluatePeriodIsoCompliance,
} from '../src/lib/period-helper';
import { prisma } from '../src/server/db';

async function testPeriodHelper() {
  console.log('================================================================');
  console.log('KIỂM THỬ CHUẨN HÓA KỲ TUẦN ISO 8601 (ASIA/HO_CHI_MINH)');
  console.log('================================================================\n');

  // 1. Kiểm thử Tuần 41/2026
  console.log('--- 1. Kiểm thử Tuần 41/2026: ---');
  const w41 = getIsoWeekBounds(2026, 41);
  console.log('Tuần 41/2026:', {
    startAt_UTC: w41.startAt.toISOString(),
    endInclusive_UTC: w41.endInclusive.toISOString(),
    endExclusive_UTC: w41.endExclusive.toISOString(),
    displayRange: w41.displayRange,
    standardTitle: w41.standardTitle,
  });

  const isW41Pass =
    w41.startAt.toISOString() === '2026-10-04T17:00:00.000Z' &&
    w41.endExclusive.toISOString() === '2026-10-11T17:00:00.000Z' &&
    w41.displayRange === '05/10/2026 - 11/10/2026';
  console.log(`=> Tuần 41/2026: ${isW41Pass ? 'PASS' : 'FAIL'}`);

  // 2. Kiểm thử tuần chuyển tháng (Tuần 40: 28/09/2026 - 04/10/2026)
  console.log('\n--- 2. Kiểm thử tuần chuyển tháng (Tuần 40/2026): ---');
  const w40 = getIsoWeekBounds(2026, 40);
  console.log('Tuần 40/2026:', {
    startAt_UTC: w40.startAt.toISOString(),
    endExclusive_UTC: w40.endExclusive.toISOString(),
    displayRange: w40.displayRange,
  });
  const isW40Pass = w40.displayRange === '28/09/2026 - 04/10/2026';
  console.log(`=> Tuần chuyển tháng (Tuần 40): ${isW40Pass ? 'PASS' : 'FAIL'}`);

  // 3. Kiểm thử tuần chuyển năm (Tuần 1/2026: 29/12/2025 - 04/01/2026)
  console.log('\n--- 3. Kiểm thử tuần chuyển năm (Tuần 1/2026): ---');
  const w1 = getIsoWeekBounds(2026, 1);
  console.log('Tuần 1/2026:', {
    startAt_UTC: w1.startAt.toISOString(),
    endExclusive_UTC: w1.endExclusive.toISOString(),
    displayRange: w1.displayRange,
  });
  const isW1Pass = w1.displayRange === '29/12/2025 - 04/01/2026';
  console.log(`=> Tuần chuyển năm (Tuần 1): ${isW1Pass ? 'PASS' : 'FAIL'}`);

  // 4. Kiểm thử sinh 7 ngày trong tuần từ startAt
  console.log('\n--- 4. Kiểm thử danh sách 7 ngày trong tuần cho giao diện: ---');
  const days = getDaysOfWeekFromStart(w41.startAt);
  days.forEach((d) => console.log(`   ${d.dayLabel} | ${d.dateStr} | ${d.value}`));
  const isDaysPass =
    days.length === 7 &&
    days[0].dayLabel === 'Thứ 2' &&
    days[0].dateStr === '05/10/2026' &&
    days[6].dayLabel === 'Chủ nhật' &&
    days[6].dateStr === '11/10/2026';
  console.log(`=> Danh sách 7 ngày UI: ${isDaysPass ? 'PASS' : 'FAIL'}`);

  // 5. Kiểm tra kỳ thực tế trong PostgreSQL với evaluatePeriodIsoCompliance
  console.log('\n--- 5. Đánh giá tính chuẩn xác ISO các kỳ tuần trong PostgreSQL: ---');
  const periodsInDb = await prisma.reportingPeriod.findMany({
    where: { type: 'WEEK' },
    orderBy: { startAt: 'asc' },
  });

  periodsInDb.forEach((p) => {
    const comp = evaluatePeriodIsoCompliance(p);
    console.log(`  Kỳ "${p.title}" (ID: ${p.id}):`);
    console.log(`    - Chuẩn ISO: ${comp.isCompliant ? 'ĐẠT (COMPLIANT)' : 'KHÔNG ĐẠT (NON-COMPLIANT)'}`);
    console.log(`    - Hiển thị hiện tại trong DB: ${comp.currentDisplay}`);
    if (!comp.isCompliant) {
      console.log(`    - Chuẩn ISO kỳ vọng: ${comp.expectedDisplay}`);
      console.log(`    - Cảnh báo: ${comp.warningMessage}`);
    }
  });

  console.log('\n================================================================');
  console.log('HOÀN TẤT KIỂM THỬ PERIOD HELPER');
  console.log('================================================================');
}

testPeriodHelper().catch(console.error);

/**
 * Dịch ngày cutoff sang kỳ tháng trước/cùng kỳ năm trước.
 * Dùng UTC để không lệch ngày theo múi giờ máy người dùng.
 */
export function shiftComparisonDate(
  isoDate: string,
  monthDelta: number,
  yearDelta: number
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const year = Number(match[1]) + yearDelta;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const firstOfTarget = new Date(Date.UTC(year, month - 1 + monthDelta, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0)
  ).getUTCDate();
  firstOfTarget.setUTCDate(Math.min(day, lastDay));
  return firstOfTarget.toISOString().slice(0, 10);
}

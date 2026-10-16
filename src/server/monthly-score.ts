/**
 * GĐ4 (tham khảo) — Tính thử điểm Bảng 1 đúng công thức mẫu gốc:
 *  (7)=(5)*(6); (9)=(5)*(8); (12)=(9)-(11)*25%*(9); (14)=(9)-(13)*25%*(9);
 *  a=(9)/(7); b=(12)/(7); c=(14)/(7); d=(a+b+c)/3.
 * KHÔNG dùng để xếp loại/khóa số chính thức khi chưa xác nhận quy tắc.
 */
export interface ScoreInputRow {
  factor: number | null;
  assignedQty: number | null;
  completedQty: number | null;
  lateDays: number;
  reworkCount: number;
}

export interface ScorePreview {
  totalAssignedConverted: number;
  totalCompletedConverted: number;
  qtyRatio: number | null; // a
  progressRatio: number | null; // b
  qualityRatio: number | null; // c
  averageD: number | null; // d
  score70: number | null; // (d*70)/100
  official: false;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeScorePreview(rows: ScoreInputRow[]): ScorePreview {
  let G = 0, I = 0, L = 0, N = 0;
  for (const row of rows) {
    const E = row.factor ?? 0;
    const F = row.assignedQty ?? 0;
    const H = row.completedQty ?? 0;
    const g = E * F;
    const i = E * H;
    const l = i - (row.lateDays || 0) * 0.25 * i;
    const n = i - (row.reworkCount || 0) * 0.25 * i;
    G += g; I += i; L += l; N += n;
  }
  if (G <= 0) {
    return {
      totalAssignedConverted: r2(G), totalCompletedConverted: r2(I),
      qtyRatio: null, progressRatio: null, qualityRatio: null,
      averageD: null, score70: null, official: false,
    };
  }
  const a = (I / G) * 100;
  const b = (L / G) * 100;
  const c = (N / G) * 100;
  const d = (a + b + c) / 3;
  return {
    totalAssignedConverted: r2(G), totalCompletedConverted: r2(I),
    qtyRatio: r2(a), progressRatio: r2(b), qualityRatio: r2(c),
    averageD: r2(d), score70: r2((d * 70) / 100), official: false,
  };
}

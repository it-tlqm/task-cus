export interface CommonCriterion {
  code: string;
  group: "I" | "II" | "III";
  label: string;
  max: number;
}

/** 10 tiêu chí chung theo mẫu 01A/01B/02A/02B. */
export const COMMON_CRITERIA: CommonCriterion[] = [
  {
    code: "I.1",
    group: "I",
    label: "Phẩm chất chính trị, phẩm chất đạo đức, văn hóa thực thi công vụ",
    max: 5,
  },
  {
    code: "I.2",
    group: "I",
    label: "Ý thức kỷ luật, kỷ cương trong thực thi công vụ",
    max: 5,
  },
  {
    code: "II.1",
    group: "II",
    label: "Năng lực chuyên môn, nghiệp vụ theo yêu cầu của vị trí việc làm",
    max: 2.5,
  },
  {
    code: "II.2",
    group: "II",
    label: "Khả năng đáp ứng yêu cầu thực thi nhiệm vụ được giao thường xuyên, đột xuất",
    max: 2.5,
  },
  {
    code: "II.3",
    group: "II",
    label: "Tinh thần trách nhiệm trong thực thi công vụ",
    max: 2.5,
  },
  {
    code: "II.4",
    group: "II",
    label: "Thái độ phục vụ người dân, doanh nghiệp và khả năng phối hợp với đồng nghiệp",
    max: 2.5,
  },
  {
    code: "III.1",
    group: "III",
    label:
      "Có sản phẩm, giải pháp đột phá, sáng tạo đem lại giá trị, hiệu quả thiết thực, tác động tích cực đến kết quả thực hiện nhiệm vụ",
    max: 2.5,
  },
  {
    code: "III.2",
    group: "III",
    label:
      "Sẵn sàng tham gia thực hiện nhiệm vụ chính trị đặc biệt quan trọng, nhiệm vụ có tính chất đột xuất, phức tạp hoặc trong điều kiện khó khăn",
    max: 2.5,
  },
  {
    code: "III.3",
    group: "III",
    label:
      "Có tinh thần chịu trách nhiệm trước kết quả công việc; chủ động nhận trách nhiệm khi có sai sót và có biện pháp khắc phục rõ ràng, cụ thể",
    max: 2.5,
  },
  {
    code: "III.4",
    group: "III",
    label:
      "Chủ động đưa ra quyết định trong phạm vi thẩm quyền, không né tránh; có tinh thần tiên phong trong thực hiện những nhiệm vụ mới",
    max: 2.5,
  },
];

export const COMMON_CRITERIA_MAX = COMMON_CRITERIA.reduce((sum, c) => sum + c.max, 0);

export interface CommonCriterionScore {
  code: string;
  group: "I" | "II" | "III";
  label: string;
  max: number;
  selfScore: number | null;
}

/** Chuẩn hóa dữ liệu từ client; bỏ mã lạ, chặn vượt điểm tối đa. */
export function normalizeCommonCriteriaDetail(input: unknown): {
  detail: CommonCriterionScore[];
  total: number;
} {
  const raw = Array.isArray(input) ? input : [];
  const byCode = new Map<string, number | null>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const code = String((row as any).code || "");
    if (!COMMON_CRITERIA.some((c) => c.code === code)) continue;
    const value = (row as any).selfScore;
    const n = value === null || value === undefined || value === "" ? null : Number(value);
    byCode.set(code, n !== null && Number.isFinite(n) ? n : null);
  }
  const detail = COMMON_CRITERIA.map((c) => {
    const rawScore = byCode.get(c.code) ?? null;
    const selfScore = rawScore === null ? null : Math.max(0, Math.min(c.max, rawScore));
    return { ...c, selfScore };
  });
  const total = detail.reduce((sum, c) => sum + (c.selfScore ?? 0), 0);
  return { detail, total };
}

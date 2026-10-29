/**
 * YC-36 — Tự đánh giá, nhận xét lãnh đạo, mức xếp loại đề xuất.
 *
 * NGUYÊN TẮC (theo phản hồi Hải quan):
 * - Hệ thống GỢI Ý điểm tiêu chí chung khi có đủ căn cứ; cán bộ được sửa.
 *   Hiện CHƯA có quy tắc được phê duyệt → `commonCriteriaSuggested = NULL` + lý do
 *   PENDING_RULE. TUYỆT ĐỐI không tự đặt ngưỡng.
 * - Ưu điểm / hạn chế: để trống được, bổ sung sau.
 * - Nhận xét của người đánh giá (Đội trưởng): MẶC ĐỊNH ĐỂ TRỐNG; chỉ lãnh đạo mới sửa được.
 * - Mức xếp loại: hệ thống gợi ý khi đủ căn cứ; cán bộ chọn/sửa được.
 *   Lựa chọn lấy theo mẫu 02A (4 mức) — CHƯA có bảng ngưỡng điểm → mức xếp loại.
 * - Tự đánh giá KHÔNG phải kết quả đánh giá chính thức (`evaluationStatus` tách riêng).
 */

import { prisma } from "../db";
import { SessionUser } from "../auth";
import { getAuthorizedUnitIds } from "../guard";
import { recordAuditEvent } from "../audit";
import { normalizeCommonCriteriaDetail } from "@/config/evaluation-criteria";

export type EvaluationPeriodType = "MONTH" | "QUARTER";

/** 4 mức xếp loại theo mẫu 02A (bằng chứng mẫu — chưa có bảng ngưỡng điểm được phê duyệt). */
export const SELF_GRADE_OPTIONS = [
  "Hoàn thành xuất sắc",
  "Hoàn thành tốt",
  "Hoàn thành",
  "Không hoàn thành",
] as const;

export type SelfGrade = (typeof SELF_GRADE_OPTIONS)[number];

export const EVALUATION_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  REVIEWED: "REVIEWED",
  CONFIRMED: "CONFIRMED",
} as const;

export type EvaluationStatus =
  (typeof EVALUATION_STATUS)[keyof typeof EVALUATION_STATUS];

function periodBounds(
  periodType: EvaluationPeriodType,
  year: number,
  number: number
): { start: Date; end: Date } {
  if (periodType === "QUARTER") {
    const startMonth = (number - 1) * 3;
    return {
      start: new Date(year, startMonth, 1),
      end: new Date(year, startMonth + 3, 0, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(year, number - 1, 1),
    end: new Date(year, number, 0, 23, 59, 59, 999),
  };
}

/** Ngưỡng xếp loại tham chiếu lấy từ cấu hình hệ thống (nguồn CV 2431). */
export interface GradeLevelReference {
  grade: string;
  minScore: number | null;
  maxScore: number | null;
  extra: string | null;
}

export interface GradeReference {
  source: string;
  note: string;
  autoApply: boolean;
  levels: GradeLevelReference[];
}

export const GRADE_REFERENCE_CONFIG_KEY = "evaluation.grade.reference";
export const GRADE_AUTO_APPLY_CONFIG_KEY = "evaluation.grade.autoApply";

/** Đọc ngưỡng tham chiếu từ system_configs; không tự áp dụng. */
export async function loadGradeReference(): Promise<GradeReference | null> {
  try {
    const { getSystemConfig } = await import("../system-config");
    const raw = await getSystemConfig(GRADE_REFERENCE_CONFIG_KEY, "");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GradeReference;
    const autoRaw = await getSystemConfig(GRADE_AUTO_APPLY_CONFIG_KEY, "false");
    return { ...parsed, autoApply: autoRaw === "true" };
  } catch {
    return null;
  }
}

export interface AssessmentInput {
  subjectPersonId: string;
  periodType: EvaluationPeriodType;
  periodYear: number;
  periodNumber: number;
  roleAtPeriod?: string | null;
  isLeaderSubject?: boolean;
  commonCriteriaScore?: number | null;
  commonCriteriaDetail?: unknown;
  leaderD?: number | null;
  leaderDD?: number | null;
  leaderE?: number | null;
  taskResultScore?: number | null;
  selfGradeChoice?: string | null;
  strengths?: string | null;
  weaknesses?: string | null;
  reviewerComment?: string | null;
  /** Kết quả xếp loại cuối cùng (chỉ cấp có thẩm quyền mới ghi được). */
  finalGrade?: string | null;
  finalGradeNote?: string | null;
  evaluationStatus?: EvaluationStatus;
}

export interface AssessmentView {
  id: string;
  subjectPersonId: string;
  subjectName: string;
  periodType: EvaluationPeriodType;
  periodYear: number;
  periodNumber: number;
  roleAtPeriod: string | null;
  isLeaderSubject: boolean;
  commonCriteriaSuggested: number | null;
  commonCriteriaScore: number | null;
  commonCriteriaDetail: any[] | null;
  leaderD: number | null;
  leaderDD: number | null;
  leaderE: number | null;
  taskResultScore: number | null;
  selfGradeSuggestion: string | null;
  selfGradeChoice: string | null;
  /** Kết quả xếp loại CUỐI CÙNG do cấp có thẩm quyền quyết định (CV 2431). */
  finalGrade: string | null;
  finalGradeById: string | null;
  finalGradeAt: string | null;
  finalGradeNote: string | null;
  strengths: string | null;
  weaknesses: string | null;
  reviewerComment: string | null;
  reviewerId: string | null;
  reviewTimestamp: string | null;
  evaluationStatus: EvaluationStatus;
  formulaVersion: string | null;
  createdAt: string;
  updatedAt: string;
  /** Gợi ý của hệ thống + lý do khi CHƯA có gợi ý. */
  suggestions: {
    commonCriteria: { value: number | null; reason: string | null };
    selfGrade: { value: string | null; reason: string | null };
  };
  /** Nguong xep loai THAM CHIEU (nguon: CV 2431) - CHUA tu ap dung. */
  gradeReference: GradeReference | null;
  /** Quyền của người đang thao tác. */
  permissions: {
    canEditSelf: boolean;
    canEditReviewerComment: boolean;
    canSubmit: boolean;
    reason: string | null;
  };
}

/** Gợi ý của hệ thống — CHỈ có khi có quy tắc đã được phê duyệt. */
function buildSuggestions(input: {
  commonCriteriaScore: number | null;
  taskResultScore: number | null;
}): AssessmentView["suggestions"] {
  return {
    commonCriteria: {
      value: null,
      reason:
        "Chưa có quy tắc gợi ý điểm tiêu chí chung được Hải quan phê duyệt — hệ thống KHÔNG tự đặt điểm gợi ý.",
    },
    selfGrade: {
      value: null,
      reason:
        "Chưa có bảng ngưỡng điểm → mức xếp loại được phê duyệt — hệ thống KHÔNG tự gợi ý mức xếp loại.",
    },
  };
}

/** Lấy phiếu đánh giá (tạo nếu chưa có) cho 1 người trong 1 kỳ. */
export async function getOrCreateAssessment(
  subjectPersonId: string,
  periodType: EvaluationPeriodType,
  periodYear: number,
  periodNumber: number,
  actorAccountId: string
): Promise<AssessmentView> {
  const existing = await prisma.evaluationAssessment.findUnique({
    where: {
      subjectPersonId_periodType_periodYear_periodNumber: {
        subjectPersonId,
        periodType,
        periodYear,
        periodNumber,
      },
    },
  });

  if (!existing) {
    const { start, end } = periodBounds(periodType, periodYear, periodNumber);
    await prisma.evaluationAssessment.create({
      data: {
        subjectPersonId,
        periodType,
        periodYear,
        periodNumber,
        periodStart: start,
        periodEnd: end,
        evaluationStatus: EVALUATION_STATUS.DRAFT,
        reviewerComment: null, // MẶC ĐỊNH ĐỂ TRỐNG
        createdById: actorAccountId,
      },
    });
  }

  return getAssessment(
    subjectPersonId,
    periodType,
    periodYear,
    periodNumber,
    actorAccountId
  );
}

export async function getAssessment(
  subjectPersonId: string,
  periodType: EvaluationPeriodType,
  periodYear: number,
  periodNumber: number,
  actorAccountId: string
): Promise<AssessmentView> {
  const rec = await prisma.evaluationAssessment.findUnique({
    where: {
      subjectPersonId_periodType_periodYear_periodNumber: {
        subjectPersonId,
        periodType,
        periodYear,
        periodNumber,
      },
    },
  });
  if (!rec) {
    throw Object.assign(new Error("Chưa có phiếu đánh giá cho kỳ này"), { statusCode: 404 });
  }
  const person = await prisma.person.findUnique({
    where: { id: subjectPersonId },
    select: { fullName: true },
  });
  const view = toView(rec, person?.fullName ?? "", actorAccountId);
  view.gradeReference = await loadGradeReference();
  return view;
}

function toView(rec: any, subjectName: string, actorAccountId: string): AssessmentView {
  const suggestions = buildSuggestions({
    commonCriteriaScore: rec.commonCriteriaScore,
    taskResultScore: rec.taskResultScore,
  });
  return {
    id: rec.id,
    subjectPersonId: rec.subjectPersonId,
    subjectName,
    periodType: rec.periodType,
    periodYear: rec.periodYear,
    periodNumber: rec.periodNumber,
    roleAtPeriod: rec.roleAtPeriod,
    isLeaderSubject: rec.isLeaderSubject,
    commonCriteriaSuggested: rec.commonCriteriaSuggested,
    commonCriteriaScore: rec.commonCriteriaScore,
    commonCriteriaDetail: rec.commonCriteriaDetail ?? null,
    leaderD: rec.leaderD ?? null,
    leaderDD: rec.leaderDD ?? null,
    leaderE: rec.leaderE ?? null,
    taskResultScore: rec.taskResultScore,
    selfGradeSuggestion: rec.selfGradeSuggestion,
    selfGradeChoice: rec.selfGradeChoice,
    finalGrade: rec.finalGrade ?? null,
    finalGradeById: rec.finalGradeById ?? null,
    finalGradeAt: rec.finalGradeAt ? rec.finalGradeAt.toISOString() : null,
    finalGradeNote: rec.finalGradeNote ?? null,
    strengths: rec.strengths,
    weaknesses: rec.weaknesses,
    reviewerComment: rec.reviewerComment,
    reviewerId: rec.reviewerId,
    reviewTimestamp: rec.reviewTimestamp,
    evaluationStatus: rec.evaluationStatus,
    formulaVersion: rec.formulaVersion,
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
    suggestions,
    gradeReference: null,
    permissions: {
      canEditSelf: true, // quyền cụ thể được kiểm tra ở tầng API
      canEditReviewerComment: false,
      canSubmit: true,
      reason: null,
    },
  };
}

/** Người thao tác có phải lãnh đạo trong phạm vi của cán bộ được đánh giá không? */
export async function isReviewerFor(user: SessionUser, subjectPersonId: string): Promise<boolean> {
  if (user.role === "UNIT_LEADER") return true;
  if (user.role === "SYSTEM_ADMIN") return false;
  if (user.role !== "DEPARTMENT_LEADER") return false;
  const units = await getAuthorizedUnitIds(user);
  if (units === "ALL") return true;
  const subject = await prisma.person.findUnique({
    where: { id: subjectPersonId },
    select: { assignments: { select: { unitId: true } } },
  });
  if (!subject) return false;
  return subject.assignments.some((a) => units.includes(a.unitId));
}

export interface SaveResult {
  success: boolean;
  status?: number;
  error?: string;
  message?: string;
  data?: AssessmentView;
}

/** Lưu phiếu đánh giá. Phân quyền theo từng trường. */
export async function saveAssessment(
  user: SessionUser,
  input: AssessmentInput
): Promise<SaveResult> {
  const subjectPersonId = input.subjectPersonId;
  if (!subjectPersonId) {
    return { success: false, status: 400, error: "Thiếu cán bộ được đánh giá" };
  }

  const isSelf = user.personId === subjectPersonId;
  const isReviewer = await isReviewerFor(user, subjectPersonId);
  if (!isSelf && !isReviewer) {
    return {
      success: false,
      status: 403,
      error: "Bạn không có quyền ghi phiếu đánh giá của cán bộ này",
    };
  }

  const existing = await prisma.evaluationAssessment.findUnique({
    where: {
      subjectPersonId_periodType_periodYear_periodNumber: {
        subjectPersonId,
        periodType: input.periodType,
        periodYear: input.periodYear,
        periodNumber: input.periodNumber,
      },
    },
  });

  // Nhận xét của lãnh đạo: CHỈ lãnh đạo mới được sửa.
  if (input.reviewerComment !== undefined && !isReviewer) {
    return {
      success: false,
      status: 403,
      error: "Chỉ lãnh đạo trong phạm vi mới được ghi nhận xét đánh giá",
    };
  }
  // Điểm tiêu chí chung, ưu điểm/hạn chế, xếp loại: phần TỰ ĐÁNH GIÁ của cán bộ.
  if (
    !isSelf &&
    (input.commonCriteriaScore !== undefined ||
      input.commonCriteriaDetail !== undefined ||
      input.leaderD !== undefined ||
      input.leaderDD !== undefined ||
      input.leaderE !== undefined ||
      input.strengths !== undefined ||
      input.weaknesses !== undefined ||
      input.selfGradeChoice !== undefined)
  ) {
    return {
      success: false,
      status: 403,
      error: "Chỉ cán bộ được đánh giá mới được sửa phần tự đánh giá",
    };
  }

  const data: any = {};
  if (input.commonCriteriaDetail !== undefined) {
    const normalized = normalizeCommonCriteriaDetail(input.commonCriteriaDetail);
    data.commonCriteriaDetail = normalized.detail;
    data.commonCriteriaScore = normalized.total;
  }
  if (input.commonCriteriaScore !== undefined && input.commonCriteriaDetail === undefined) {
    if (input.commonCriteriaScore === null) data.commonCriteriaScore = null;
    else {
      const v = Number(input.commonCriteriaScore);
      if (!Number.isFinite(v) || v < 0 || v > 30) {
        return {
          success: false,
          status: 400,
          error: "Điểm tiêu chí chung phải trong khoảng 0…30 điểm (theo mẫu 01A)",
        };
      }
      data.commonCriteriaScore = v;
    }
  }
  for (const [key, raw] of [
    ["leaderD", input.leaderD],
    ["leaderDD", input.leaderDD],
    ["leaderE", input.leaderE],
  ] as const) {
    if (raw === undefined) continue;
    if (raw === null) {
      data[key] = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return {
        success: false,
        status: 400,
        error: "Điểm d/đ/e của lãnh đạo phải trong khoảng 0…100%",
      };
    }
    data[key] = n;
  }
  if (input.taskResultScore !== undefined) {
    data.taskResultScore =
      input.taskResultScore === null ? null : Number(input.taskResultScore);
  }
  if (input.selfGradeChoice !== undefined) {
    if (input.selfGradeChoice === null || input.selfGradeChoice === "") {
      data.selfGradeChoice = null;
    } else if (!(SELF_GRADE_OPTIONS as readonly string[]).includes(input.selfGradeChoice)) {
      return {
        success: false,
        status: 400,
        error: "Mức xếp loại không hợp lệ (theo mẫu 02A có 4 mức)",
      };
    } else {
      data.selfGradeChoice = input.selfGradeChoice;
    }
  }
  if (input.strengths !== undefined) data.strengths = input.strengths || null;
  // Kết quả xếp loại CUỐI CÙNG — chỉ cấp có thẩm quyền trong phạm vi mới quyết định.
  if (input.finalGrade !== undefined) {
    if (!isReviewer) {
      return {
        success: false,
        status: 403,
        error: "Chỉ lãnh đạo trong phạm vi mới được quyết định mức xếp loại cuối cùng",
      };
    }
    if (input.finalGrade === null || input.finalGrade === "") {
      data.finalGrade = null;
      data.finalGradeAt = null;
      data.finalGradeById = null;
      data.finalGradeNote = null;
    } else {
      if (!(SELF_GRADE_OPTIONS as readonly string[]).includes(input.finalGrade)) {
        return {
          success: false,
          status: 400,
          error: "Mức xếp loại không hợp lệ (theo mẫu 02A có 4 mức)",
        };
      }
      data.finalGrade = input.finalGrade;
      data.finalGradeById = user.personId ?? null;
      data.finalGradeAt = new Date();
      data.finalGradeNote = input.finalGradeNote || null;
    }
  }
  if (input.weaknesses !== undefined) data.weaknesses = input.weaknesses || null;
  if (input.reviewerComment !== undefined) {
    data.reviewerComment = input.reviewerComment || null;
    data.reviewerId = user.personId ?? null;
    data.reviewTimestamp = new Date();
    if (existing?.evaluationStatus === EVALUATION_STATUS.SUBMITTED) {
      data.evaluationStatus = EVALUATION_STATUS.REVIEWED;
    }
  }
  if (input.evaluationStatus !== undefined) {
    if (input.evaluationStatus === EVALUATION_STATUS.CONFIRMED && !isReviewer) {
      return {
        success: false,
        status: 403,
        error: "Chỉ lãnh đạo mới chốt được phiếu đánh giá",
      };
    }
    if (input.evaluationStatus === EVALUATION_STATUS.SUBMITTED && !isSelf && !isReviewer) {
      return { success: false, status: 403, error: "Không có quyền trình duyệt" };
    }
    data.evaluationStatus = input.evaluationStatus;
  }
  if (input.roleAtPeriod !== undefined) data.roleAtPeriod = input.roleAtPeriod || null;
  if (input.isLeaderSubject !== undefined) data.isLeaderSubject = !!input.isLeaderSubject;

  if (Object.keys(data).length === 0) {
    return { success: false, status: 400, error: "Không có nội dung cần lưu" };
  }

  const { start, end } = periodBounds(input.periodType, input.periodYear, input.periodNumber);

  const rec = existing
    ? await prisma.evaluationAssessment.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.evaluationAssessment.create({
        data: {
          subjectPersonId,
          periodType: input.periodType,
          periodYear: input.periodYear,
          periodNumber: input.periodNumber,
          periodStart: start,
          periodEnd: end,
          reviewerComment: null,
          createdById: user.id,
          ...data,
        },
      });

  await recordAuditEvent({
    actorId: user.id,
    action: "EVALUATION_ASSESSMENT_SAVE",
    resourceType: "EvaluationAssessment",
    resourceId: rec.id,
    oldData: existing
      ? {
          commonCriteriaScore: existing.commonCriteriaScore,
          selfGradeChoice: existing.selfGradeChoice,
          evaluationStatus: existing.evaluationStatus,
          hasReviewerComment: !!existing.reviewerComment,
        }
      : null,
    newData: {
      commonCriteriaScore: rec.commonCriteriaScore,
      selfGradeChoice: rec.selfGradeChoice,
      evaluationStatus: rec.evaluationStatus,
      hasReviewerComment: !!rec.reviewerComment,
    },
  });

  const person = await prisma.person.findUnique({
    where: { id: subjectPersonId },
    select: { fullName: true },
  });
  const view = toView(rec, person?.fullName ?? "", user.id);
  view.gradeReference = await loadGradeReference();
  return {
    success: true,
    message: "Đã lưu phiếu đánh giá",
    data: view,
  };
}



/**
 * S3 — Phase C: test mapping layer B-C-2 → S3 (D3–D7).
 *
 * Không DB/API. Chạy:
 *   npx tsx scripts/test-phase-c-bc2-mapping.ts
 */
import {
  OFFICIAL_PERCENT_POLICY,
  computePercent,
  deriveActualState,
  deriveTargetState,
  formatPercentVi,
  type Period,
} from "../src/lib/metrics-contract";
import {
  mapBaselineScope,
  mapBc2StatusToS3,
  mapBc2TargetToS3,
  mapBc2TargetToTargetDraft,
  mapComparisonKindToLabelCode,
  mapDirection,
  mapLabelCodeToComparisonKind,
  mapMeasureMode,
  mapS3StatusToBc2,
  mapTargetDraftToBc2CreateInput,
  type Bc2TargetDto,
} from "../src/lib/metrics-bc2-mapping";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`FAIL  ${name}${detail === undefined ? "" : ` :: ${JSON.stringify(detail)}`}`);
  }
}

const BASE_DTO: Bc2TargetDto = {
  id: "target-1",
  metricId: "metric-thu-nsnn",
  classificationId: "",
  comparisonKind: "BTC_YEAR",
  label: "Chỉ tiêu BTC năm 2026",
  periodType: "YEAR",
  year: 2026,
  periodNo: null,
  valueBase: "1685000000000",
  unitType: "VND",
  dataSource: "REAL",
  isOfficial: true,
  status: "PROPOSED",
  direction: "HIGHER_IS_BETTER",
  measureMode: "PERIOD_FLOW",
  baselineScope: "YEAR_START",
  sourceNote: "Mock: quyết định giao chỉ tiêu",
  note: "",
  proposedByName: "Người đề xuất",
  confirmedByName: null,
  confirmedAt: null,
  revisionNo: 1,
};

const ACTUAL_VND = (value: number) =>
  deriveActualState({
    applicable: true,
    value,
    valueSource: "ENTRY",
    unitType: "VND",
    measureMode: "PERIOD_FLOW",
    locked: false,
    noActivityConfirmed: false,
    expectedSlots: 1,
    coveredSlots: 1,
    entries: [{ value, status: "CONFIRMED" }],
    classificationComplete: true,
  });

// ============================================================
// A. STATUS D3
// ============================================================
console.log("\n[A] D3 — STATUS PROPOSED ↔ DRAFT");
check("A1. PROPOSED → DRAFT", mapBc2StatusToS3("PROPOSED") === "DRAFT");
check("A2. CONFIRMED → CONFIRMED", mapBc2StatusToS3("CONFIRMED") === "CONFIRMED");
check("A3. LOCKED → LOCKED", mapBc2StatusToS3("LOCKED") === "LOCKED");
check("A4. VOID → VOID", mapBc2StatusToS3("VOID") === "VOID");
check("A5. SUPERSEDED → SUPERSEDED", mapBc2StatusToS3("SUPERSEDED") === "SUPERSEDED");
check("A6. Status lạ → null", mapBc2StatusToS3("UNKNOWN") === null);
check("A7. DRAFT → PROPOSED", mapS3StatusToBc2("DRAFT") === "PROPOSED");
check("A8. CONFIRMED → CONFIRMED", mapS3StatusToBc2("CONFIRMED") === "CONFIRMED");
check("A9. LOCKED → LOCKED", mapS3StatusToBc2("LOCKED") === "LOCKED");

// ============================================================
// B. COMPARISON KIND D4
// ============================================================
console.log("\n[B] D4 — comparisonKind → labelCode");
check("B1. BTC_YEAR → BTC", mapComparisonKindToLabelCode("BTC_YEAR") === "BTC");
check("B2. UBND_YEAR → UBND", mapComparisonKindToLabelCode("UBND_YEAR") === "UBND");
check("B3. MONTH_PLAN → KH_THANG", mapComparisonKindToLabelCode("MONTH_PLAN") === "KH_THANG");
check("B4. KHAC không phải comparisonKind B-C-2 → null", mapComparisonKindToLabelCode("KHAC") === null);
check("B5. NONE → null", mapComparisonKindToLabelCode("NONE") === null);
check("B6. Kind lạ → null (không đoán từ nhãn)", mapComparisonKindToLabelCode("SOMETHING") === null);
check("B7. BTC → BTC_YEAR", mapLabelCodeToComparisonKind("BTC") === "BTC_YEAR");
check("B8. UBND → UBND_YEAR", mapLabelCodeToComparisonKind("UBND") === "UBND_YEAR");
check("B9. KH_THANG → MONTH_PLAN", mapLabelCodeToComparisonKind("KH_THANG") === "MONTH_PLAN");
check("B10. KHAC → NONE (không đối chiếu)", mapLabelCodeToComparisonKind("KHAC") === "NONE");
check("B11. KH_QUY chưa có kind B-C-2 → null", mapLabelCodeToComparisonKind("KH_QUY") === null);
check("B12. KH_NAM chưa có kind B-C-2 → null", mapLabelCodeToComparisonKind("KH_NAM") === null);

// ============================================================
// C. DIRECTION / MEASURE MODE / BASELINE SCOPE D5
// ============================================================
console.log("\n[C] D5 — direction/measureMode/baselineScope");
check("C1. direction hợp lệ giữ nguyên", mapDirection("LOWER_IS_BETTER") === "LOWER_IS_BETTER");
check("C2. direction thiếu → NOT_SET", mapDirection(undefined) === "NOT_SET");
check("C3. direction lạ → NOT_SET", mapDirection("BAD") === "NOT_SET");
check("C4. measureMode hợp lệ giữ nguyên", mapMeasureMode("CUMULATIVE") === "CUMULATIVE");
check("C5. measureMode thiếu → PENDING_BUSINESS_INPUT", mapMeasureMode(null) === "PENDING_BUSINESS_INPUT");
check("C6. measureMode lạ → PENDING_BUSINESS_INPUT", mapMeasureMode("BAD") === "PENDING_BUSINESS_INPUT");
check("C7. baselineScope hợp lệ giữ nguyên", mapBaselineScope("YEAR_START") === "YEAR_START");
check("C8. baselineScope thiếu → PENDING_BUSINESS_INPUT", mapBaselineScope(undefined) === "PENDING_BUSINESS_INPUT");
check("C9. baselineScope lạ → PENDING_BUSINESS_INPUT", mapBaselineScope("BAD") === "PENDING_BUSINESS_INPUT");

// ============================================================
// D. MAP DTO → S3 TARGET
// ============================================================
console.log("\n[D] Map B-C-2 target → S3 target");
const mapped = mapBc2TargetToS3(BASE_DTO);
check("D1. Map được target", mapped.value !== null);
check("D2. PROPOSED → DRAFT", mapped.value?.status === "DRAFT");
check("D3. BTC_YEAR → labelCode BTC", mapped.value?.labelCode === "BTC");
check("D4. valueBase string → number", mapped.value?.value === 1685000000000);
check("D5. dataSource REAL → official", mapped.value?.isOfficial === true);
check("D6. direction giữ nguyên", mapped.value?.direction === "HIGHER_IS_BETTER");
check("D7. measureMode giữ nguyên", mapped.value?.measureMode === "PERIOD_FLOW");
check("D8. baselineScope giữ nguyên", mapped.value?.baselineScope === "YEAR_START");
check("D9. sourceNote/revision giữ nguyên", mapped.value?.sourceNote === BASE_DTO.sourceNote && mapped.value?.revisionNo === 1);

const demoTarget = mapBc2TargetToS3({ ...BASE_DTO, dataSource: "DEMO", isOfficial: true });
check("D10. dataSource DEMO thắng isOfficial=true", demoTarget.value?.isOfficial === false);
const realTarget = mapBc2TargetToS3({ ...BASE_DTO, dataSource: "REAL", isOfficial: false });
check("D11. dataSource REAL thắng isOfficial=false", realTarget.value?.isOfficial === true);

const missingOfficial = mapBc2TargetToS3({ ...BASE_DTO, dataSource: null, isOfficial: null });
check("D12. Thiếu dataSource/isOfficial → không official + warning", missingOfficial.value?.isOfficial === false && missingOfficial.issues.some((i) => i.code === "OFFICIAL_FLAG_MISSING"));

const missingD5 = mapBc2TargetToS3({ ...BASE_DTO, direction: null, measureMode: null, baselineScope: null });
check("D13. Thiếu D5 → NOT_SET/PENDING + warning", missingD5.value?.direction === "NOT_SET" && missingD5.value?.measureMode === "PENDING_BUSINESS_INPUT" && missingD5.value?.baselineScope === "PENDING_BUSINESS_INPUT");
check("D14. Thiếu D5 có warning tương ứng", ["DIRECTION_MISSING", "MEASURE_MODE_MISSING", "BASELINE_SCOPE_MISSING"].every((code) => missingD5.issues.some((i) => i.code === code)));

const unknownStatus = mapBc2TargetToS3({ ...BASE_DTO, status: "BAD" });
check("D15. Status lạ → value null + STATUS_UNKNOWN", unknownStatus.value === null && unknownStatus.issues.some((i) => i.code === "STATUS_UNKNOWN"));
const badValue = mapBc2TargetToS3({ ...BASE_DTO, valueBase: "abc" });
check("D16. valueBase lỗi → value null + VALUE_INVALID", badValue.value === null && badValue.issues.some((i) => i.code === "VALUE_INVALID"));
const unknownKind = mapBc2TargetToS3({ ...BASE_DTO, comparisonKind: "OTHER" });
check("D17. comparisonKind lạ → warning, không đoán label", unknownKind.value?.labelCode === "" && unknownKind.issues.some((i) => i.code === "COMPARISON_KIND_UNKNOWN"));
const badPeriod = mapBc2TargetToS3({ ...BASE_DTO, periodType: "MONTH", periodNo: 13 });
check("D18. Tháng 13 → value null + MONTH_INVALID", badPeriod.value === null && badPeriod.issues.some((i) => i.code === "MONTH_INVALID"));
const badPeriodType = mapBc2TargetToS3({ ...BASE_DTO, periodType: "WEEK" as any });
check("D19. periodType lạ → value null + PERIOD_TYPE_INVALID", badPeriodType.value === null && badPeriodType.issues.some((i) => i.code === "PERIOD_TYPE_INVALID"));
const noneKind = mapBc2TargetToS3({ ...BASE_DTO, comparisonKind: "NONE" });
check("D20. comparisonKind NONE → labelCode rỗng, không warning", noneKind.value?.labelCode === "" && !noneKind.issues.some((i) => i.code === "COMPARISON_KIND_UNKNOWN"));

// ============================================================
// E. MAP DTO → UI DRAFT
// ============================================================
console.log("\n[E] Map B-C-2 target → UI draft");
const draft = mapBc2TargetToTargetDraft(BASE_DTO);
check("E1. Map được draft", draft.value !== null);
check("E2. Status DRAFT", draft.value?.status === "DRAFT");
check("E3. Label code BTC", draft.value?.labelCode === "BTC");
check("E4. Value string", draft.value?.value === "1685000000000");
check("E5. isOfficial true", draft.value?.isOfficial === true);
check("E6. Giữ id/metric", draft.value?.id === BASE_DTO.id && draft.value?.metricId === BASE_DTO.metricId);
const draftDemo = mapBc2TargetToTargetDraft({ ...BASE_DTO, dataSource: "DEMO" });
check("E7. DEMO → isOfficial false", draftDemo.value?.isOfficial === false);
const draftNone = mapBc2TargetToTargetDraft({ ...BASE_DTO, comparisonKind: "NONE" });
check("E8. comparisonKind NONE → UI labelCode KHAC (để sửa được target không đối chiếu)", draftNone.value?.labelCode === "KHAC");

// ============================================================
// F. MAP UI DRAFT → B-C-2 CREATE INPUT
// ============================================================
console.log("\n[F] Map UI draft → B-C-2 create input");
const validDraft = draft.value!;
const create = mapTargetDraftToBc2CreateInput(validDraft, {
  unitType: "VND",
  measureMode: "PERIOD_FLOW",
  baselineScope: "YEAR_START",
});
check("F1. Map được create input", create.value !== null);
check("F2. DRAFT → PROPOSED", create.value?.status === "PROPOSED");
check("F3. BTC → BTC_YEAR", create.value?.comparisonKind === "BTC_YEAR");
check("F4. isOfficial true → dataSource REAL", create.value?.dataSource === "REAL");
check("F5. Value number", create.value?.valueBase === 1685000000000);
check("F6. direction giữ nguyên", create.value?.direction === "HIGHER_IS_BETTER");
check("F7. measureMode/baselineScope lấy context", create.value?.measureMode === "PERIOD_FLOW" && create.value?.baselineScope === "YEAR_START");

const createDemo = mapTargetDraftToBc2CreateInput({ ...validDraft, isOfficial: false }, { unitType: "VND" });
check("F8. isOfficial false → dataSource DEMO", createDemo.value?.dataSource === "DEMO");
const createUnsupported = mapTargetDraftToBc2CreateInput({ ...validDraft, labelCode: "KH_QUY" }, { unitType: "VND" });
check("F9. KH_QUY chưa hỗ trợ → value null + issue", createUnsupported.value === null && createUnsupported.issues.some((i) => i.code === "COMPARISON_KIND_UNSUPPORTED"));
const createUnitMismatch = mapTargetDraftToBc2CreateInput(validDraft, { unitType: "COUNT" });
check("F10. Lệch đơn vị → value null + UNIT_MISMATCH", createUnitMismatch.value === null && createUnitMismatch.issues.some((i) => i.code === "UNIT_MISMATCH"));
const createNegative = mapTargetDraftToBc2CreateInput({ ...validDraft, value: "-1" }, { unitType: "VND" });
check("F11. Giá trị âm → value null + VALUE_NEGATIVE", createNegative.value === null && createNegative.issues.some((i) => i.code === "VALUE_NEGATIVE"));
const createMissingYear = mapTargetDraftToBc2CreateInput({ ...validDraft, year: null }, { unitType: "VND" });
check("F12. Thiếu năm → value null + YEAR_INVALID", createMissingYear.value === null && createMissingYear.issues.some((i) => i.code === "YEAR_INVALID"));
const createKhac = mapTargetDraftToBc2CreateInput({ ...validDraft, labelCode: "KHAC" }, { unitType: "VND" });
check("F13. KHAC → comparisonKind NONE", createKhac.value?.comparisonKind === "NONE");

// ============================================================
// G. TÍCH HỢP VỚI STATE/% (D3–D5)
// ============================================================
console.log("\n[G] Tích hợp mapping với state/%");
const proposed = mapBc2TargetToS3(BASE_DTO).value!;
const proposedPeriod: Period = { year: proposed.year, periodType: proposed.periodType, periodNo: proposed.periodNo };
const proposedState = deriveTargetState(proposed, proposedPeriod);
check("G1. PROPOSED → state DRAFT", proposedState.state === "DRAFT");

const confirmedDto: Bc2TargetDto = { ...BASE_DTO, status: "CONFIRMED" };
const confirmed = mapBc2TargetToS3(confirmedDto).value!;
const confirmedPeriod: Period = { year: confirmed.year, periodType: confirmed.periodType, periodNo: confirmed.periodNo };
const confirmedState = deriveTargetState(confirmed, confirmedPeriod);
check("G2. CONFIRMED → state CONFIRMED", confirmedState.state === "CONFIRMED");

function percentFor(dto: Bc2TargetDto, actualValue: number) {
  const target = mapBc2TargetToS3(dto).value!;
  const actual = ACTUAL_VND(actualValue);
  return computePercent({
    actual,
    target: deriveTargetState(target, {
      year: target.year,
      periodType: target.periodType,
      periodNo: target.periodNo,
    }),
    targetValue: target.value,
    targetUnitType: target.unitType,
    actualUnitType: target.unitType,
    direction: target.direction,
    measureMode: target.measureMode ?? "PERIOD_FLOW",
    baselineScope: target.baselineScope ?? "PERIOD_START",
    policy: { ...OFFICIAL_PERCENT_POLICY, metricRequiresConfirm: false },
    mode: "OFFICIAL",
  });
}

const btc = percentFor({ ...confirmedDto, valueBase: 1685000000000 }, 1317372334554);
check("G3. BTC 78,18% (2 chữ số)", btc.state === "COMPUTED" && btc.displayValue === "78,18%");
const ubnd = percentFor({ ...confirmedDto, comparisonKind: "UBND_YEAR", valueBase: 1700000000000 }, 1317372334554);
check("G4. UBND 77,49% (2 chữ số)", ubnd.state === "COMPUTED" && ubnd.displayValue === "77,49%");
const month = percentFor({ ...confirmedDto, comparisonKind: "MONTH_PLAN", periodType: "MONTH", periodNo: 10, valueBase: 200000000000 }, 219341201856);
check("G5. KH tháng 109,67% (2 chữ số)", month.state === "COMPUTED" && month.displayValue === "109,67%");
check("G6. formatPercentVi 78,184 = 78,18%", formatPercentVi(78.184) === "78,18%");

const proposedPercent = percentFor({ ...confirmedDto, status: "PROPOSED" }, 1317372334554);
check("G7. PROPOSED không tính % chính thức", proposedPercent.reason === "TARGET_DRAFT");
const demoPercent = percentFor({ ...confirmedDto, dataSource: "DEMO" }, 1317372334554);
check("G8. DEMO không tính % chính thức", demoPercent.reason === "TARGET_NOT_OFFICIAL");
const missingMeasure = percentFor({ ...confirmedDto, measureMode: null }, 1317372334554);
check("G9. Thiếu measureMode → BUSINESS_RULE_PENDING", missingMeasure.reason === "BUSINESS_RULE_PENDING");

// ============================================================
// TỔNG HỢP
// ============================================================
console.log("\n[TỔNG HỢP]");
console.log(`PASS ${passed}/${passed + failed}, FAIL ${failed}`);
if (failed > 0) {
  console.log("Failures:", failures.join(" | "));
  process.exitCode = 1;
}

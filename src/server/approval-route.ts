/**
 * YC-11 Phase 3 — tuyến kiểm tra sơ bộ (pre-check) theo PersonSupervision.
 *
 * Nguyên tắc đã chốt:
 * - Một ApprovalCase/Task (S4); pre-check chỉ là sự kiện, không tạo case/stage.
 * - Nguồn tuyến: PersonSupervision CONFIRMED, còn hiệu lực. KHÔNG fallback đơn vị,
 *   KHÔNG seed, KHÔNG tự cấp quyền.
 * - Thiếu tuyến / tự phụ trách / vòng lặp / quá độ sâu => không READY; owner không
 *   được nộp chung, không ai được final.
 * - Pre-checker không được là participant hoặc người có thẩm quyền final của chính hồ sơ.
 *   Nhờ vậy tách bước 1 (pre-check) khỏi bước 2 (final) mà không cần role mới.
 * - Snapshot tuyến được ghi khi owner nộp chung; tuyến đổi sau đó không viết lại.
 * - Flag `V3_YC11_PRECHECK` mặc định TẮT.
 */
import { prisma } from "./db";
import { SessionUser, pickPrimaryGrant } from "./auth";
import { ParticipantError } from "./task-participant-error";

export type RouteStatus = "READY" | "WAITING_ASSIGNMENT" | "CYCLE" | "AMBIGUOUS";
export type PrecheckStatus = "PENDING" | "PASSED" | "RETURNED" | "NOT_REQUIRED";

export interface RoutePerson {
  personId: string;
  fullName: string;
  code: string | null;
  role: string | null;
  positionTitle: string | null;
  unitId: string | null;
  unitName: string | null;
}

export interface ParticipantRouteView {
  personId: string;
  fullName: string;
  role: string;
  partStatus: string;
  round: number;
  legacy: boolean;
  required: boolean;
  precheckStatus: PrecheckStatus;
  precheckNote: string | null;
  precheckedBy: RoutePerson | null;
  precheckedAt: string | null;
  /** Manager hợp lệ được phép pre-check phần này (không phải final approver). */
  eligiblePrecheckers: RoutePerson[];
  canPrecheck: boolean;
  routeStatus: RouteStatus;
  blockers: RouteBlocker[];
}

export interface RouteBlocker {
  code:
    | "MISSING_SUPERVISION"
    | "SELF_SUPERVISION"
    | "NO_ACTIVE_ACCOUNT"
    | "SYSTEM_ADMIN"
    | "FINAL_AUTHORITY_ONLY"
    | "CYCLE"
    | "AMBIGUOUS"
    | "NO_FINAL_AUTHORITY"
    | "PART_NOT_SUBMITTED"
    | "NOT_PRECHECKED"
    | "PRE_CHECKER_IS_FINAL";
  personId: string;
  personName: string;
  message: string;
}

export interface ResolvedTaskRoute {
  taskId: string;
  taskCode: string;
  taskStatus: string;
  ownerId: string;
  ownerUnitId: string;
  required: boolean;
  legacyOnly: boolean;
  status: RouteStatus;
  ready: boolean;
  allPrechecked: boolean;
  participants: ParticipantRouteView[];
  finalCandidates: RoutePerson[];
  blockers: RouteBlocker[];
  actualPrecheckerIds: string[];
  resolvedAt: string;
  source: "PersonSupervision";
  maxDepth: number;
}

const DEFAULT_MAX_DEPTH = 5;
const PRECHECK_EVENTS = ["PRECHECK_PASS", "PRECHECK_RETURN"] as const;

export function isPrecheckEnabled(): boolean {
  const raw = (process.env.V3_YC11_PRECHECK || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function routePerson(info: any): RoutePerson {
  return {
    personId: info.personId,
    fullName: info.fullName,
    code: info.code ?? null,
    role: info.role ?? null,
    positionTitle: info.positionTitle ?? null,
    unitId: info.unitId ?? null,
    unitName: info.unitName ?? null,
  };
}

/** Thông tin tài khoản/vai trò đang hiệu lực — dùng chung cho manager + final candidates. */
async function loadAuthorityPeople(
  tx: any,
  opts: { personIds?: string[]; now: Date }
): Promise<Map<string, any>> {
  const accounts = await tx.account.findMany({
    where: {
      status: "ACTIVE",
      ...(opts.personIds ? { personId: { in: opts.personIds } } : {}),
    },
    include: {
      person: {
        include: {
          assignments: {
            where: {
              isPrimary: true,
              effectiveFrom: { lte: opts.now },
              OR: [{ effectiveTo: null }, { effectiveTo: { gte: opts.now } }],
            },
            include: { unit: true, position: true },
            take: 1,
          },
        },
      },
      roleGrants: {
        where: {
          validFrom: { lte: opts.now },
          OR: [{ validTo: null }, { validTo: { gte: opts.now } }],
        },
        include: { role: true },
      },
    },
  });

  const map = new Map<string, any>();
  for (const account of accounts) {
    if (!account.person || account.person.status !== "ACTIVE") continue;
    const grant = pickPrimaryGrant(account.roleGrants as any[]);
    const assignment = account.person.assignments?.[0] ?? null;
    map.set(account.personId, {
      personId: account.personId,
      fullName: account.person.fullName,
      code: account.person.code,
      role: grant?.role?.code ?? null,
      scopeType: grant?.scopeType ?? null,
      scopeUnitId: grant?.scopeUnitId ?? null,
      positionTitle: assignment?.position?.title ?? null,
      unitId: assignment?.unitId ?? null,
      unitName: assignment?.unit?.name ?? null,
      hasActiveAccount: true,
    });
  }
  return map;
}

function isSystemAdmin(info: any): boolean {
  return info?.role === "SYSTEM_ADMIN";
}

/**
 * Người này có thẩm quyền quyết định cuối theo hành vi hiện hành không?
 * Giữ đúng `canDecide` của approval-case: UNIT_LEADER toàn cục; DEPARTMENT_LEADER
 * theo phạm vi grant. Không thu hẹp/mở rộng quyền (Q-RB1 vẫn chờ quyết định riêng).
 */
async function isFinalEligible(
  tx: any,
  info: any,
  taskUnitId: string,
  orgUnits?: Array<{ id: string; parentId: string | null }>
): Promise<boolean> {
  if (!info || !info.hasActiveAccount) return false;
  if (isSystemAdmin(info)) return false;
  if (info.role === "UNIT_LEADER") return true;
  if (info.role !== "DEPARTMENT_LEADER") return false;

  const scopeType = String(info.scopeType || "DEPARTMENT");
  if (scopeType === "ORGANIZATION") return true;
  const scopeUnitId = info.scopeUnitId || info.unitId || null;
  if (!scopeUnitId) return false;
  if (scopeUnitId === taskUnitId) return true;
  if (scopeType !== "SUBTREE") return false;

  const units = orgUnits ?? (await tx.orgUnit.findMany({ select: { id: true, parentId: true } }));
  let cursor: string | null = taskUnitId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    if (cursor === scopeUnitId) return true;
    seen.add(cursor);
    cursor = units.find((u: any) => u.id === cursor)?.parentId ?? null;
  }
  return false;
}

async function listFinalCandidates(
  tx: any,
  opts: { taskUnitId: string; excludePersonIds: Set<string>; now: Date }
): Promise<RoutePerson[]> {
  const all = await loadAuthorityPeople(tx, { now: opts.now });
  const orgUnits = await tx.orgUnit.findMany({ select: { id: true, parentId: true } });
  const out: RoutePerson[] = [];
  for (const info of all.values()) {
    if (opts.excludePersonIds.has(info.personId)) continue;
    if (await isFinalEligible(tx, info, opts.taskUnitId, orgUnits)) {
      out.push(routePerson(info));
    }
  }
  out.sort((a, b) => {
    const byRole = String(a.role || "").localeCompare(String(b.role || ""));
    if (byRole !== 0) return byRole;
    return String(a.fullName || "").localeCompare(String(b.fullName || ""), "vi");
  });
  return out;
}

interface ActiveSupervision {
  managerPersonId: string;
  subordinatePersonId: string;
}

async function loadActiveSupervisions(tx: any, now: Date): Promise<ActiveSupervision[]> {
  const rows = await tx.personSupervision.findMany({
    where: {
      status: "CONFIRMED",
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    select: { managerPersonId: true, subordinatePersonId: true },
  });
  return rows;
}

function buildSupervisionMap(rows: ActiveSupervision[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.subordinatePersonId) ?? [];
    if (!list.includes(row.managerPersonId)) list.push(row.managerPersonId);
    map.set(row.subordinatePersonId, list);
  }
  return map;
}

/**
 * Phát hiện vòng lặp / vượt độ sâu trên chuỗi quản lý.
 * Chỉ dùng để chặn route, không tự chọn cấp trên thay thế.
 */
function detectChainProblem(
  personId: string,
  supervisionMap: Map<string, string[]>,
  maxDepth: number
): "CYCLE" | "AMBIGUOUS" | null {
  const walk = (current: string, path: string[], depth: number): "CYCLE" | "AMBIGUOUS" | null => {
    if (depth > maxDepth) return "AMBIGUOUS";
    const managers = supervisionMap.get(current) ?? [];
    for (const manager of managers) {
      if (manager === current) continue;
      if (path.includes(manager)) return "CYCLE";
      const problem = walk(manager, [...path, manager], depth + 1);
      if (problem) return problem;
    }
    return null;
  };
  return walk(personId, [personId], 0);
}

function latestPrecheckEvent(
  events: any[],
  participantResultId: string,
  round: number
): any | null {
  return (
    events.find(
      (e) => e.participantResultId === participantResultId && Number(e.round) === Number(round)
    ) ?? null
  );
}

/**
 * Resolve tuyến hiện tại của Task. Hàm chỉ đọc, không tạo participant/snapshot.
 * `viewer` chỉ dùng để tính canPrecheck; không ảnh hưởng route.
 */
export async function resolveTaskRoute(
  taskId: string,
  opts: { tx?: any; now?: Date; viewer?: SessionUser | null; maxDepth?: number } = {}
): Promise<ResolvedTaskRoute> {
  const tx = opts.tx ?? prisma;
  const now = opts.now ?? new Date();
  const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;

  const task = await tx.task.findUnique({
    where: { id: taskId },
    include: {
      owner: { select: { id: true, fullName: true } },
      unit: { select: { id: true, name: true } },
      participantResults: {
        include: { person: { select: { id: true, fullName: true, code: true } } },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!task) throw new ParticipantError("Nhiệm vụ không tồn tại.", 404);

  const rows = (task.participantResults ?? []).filter(
    (r: any) => String(r.role) !== "VIEWER"
  );
  const requiredRows = rows.filter((r: any) => !r.legacy);
  const legacyOnly = requiredRows.length === 0;

  const events = await tx.taskParticipantEvent.findMany({
    where: { taskId, eventType: { in: [...PRECHECK_EVENTS] } },
    orderBy: { createdAt: "desc" },
  });

  const supervisionMap = buildSupervisionMap(await loadActiveSupervisions(tx, now));
  const participantIds = new Set<string>(rows.map((r: any) => r.personId));
  const managerIds = new Set<string>();
  for (const personId of participantIds) {
    for (const managerId of supervisionMap.get(personId) ?? []) {
      if (managerId !== personId) managerIds.add(managerId);
    }
  }
  const authority = await loadAuthorityPeople(tx, {
    personIds: [...new Set([...participantIds, ...managerIds])],
    now,
  });
  const finalCandidates = legacyOnly
    ? []
    : await listFinalCandidates(tx, {
        taskUnitId: task.unitId,
        excludePersonIds: participantIds,
        now,
      });
  const blockers: RouteBlocker[] = [];
  const participants: ParticipantRouteView[] = [];
  const actualPrecheckerIds = new Set<string>();
  let allPrechecked = true;
  let worst: RouteStatus = "READY";

  const raise = (status: RouteStatus) => {
    const rank: Record<RouteStatus, number> = {
      READY: 0,
      WAITING_ASSIGNMENT: 1,
      AMBIGUOUS: 2,
      CYCLE: 3,
    };
    if (rank[status] > rank[worst]) worst = status;
  };

  if (!legacyOnly && finalCandidates.length === 0) {
    blockers.push({
      code: "NO_FINAL_AUTHORITY",
      personId: task.ownerId,
      personName: task.owner?.fullName ?? "—",
      message:
        "Chưa xác định được người có thẩm quyền quyết định cuối cho đơn vị chủ trì (ngoài người chủ trì/pre-checker).",
    });
    raise("WAITING_ASSIGNMENT");
  }

  for (const row of rows) {
    const personId = String(row.personId);
    const personName = row.person?.fullName ?? personId;
    const required = !row.legacy;
    const partStatus = String(row.partStatus);
    const exemptOrAccepted = partStatus === "ACCEPTED" || partStatus === "EXEMPT";
    const event = latestPrecheckEvent(events, row.id, Number(row.round || 1));
    const precheckStatus: PrecheckStatus = exemptOrAccepted
      ? "NOT_REQUIRED"
      : partStatus !== "SUBMITTED"
        ? "PENDING"
        : event?.eventType === "PRECHECK_PASS"
          ? "PASSED"
          : event?.eventType === "PRECHECK_RETURN"
            ? "RETURNED"
            : "PENDING";
    if (event?.eventType === "PRECHECK_PASS" && event.actorPersonId) {
      actualPrecheckerIds.add(String(event.actorPersonId));
    }

    const participantBlockers: RouteBlocker[] = [];
    let participantStatus: RouteStatus = "READY";

    if (!required) {
      participants.push({
        personId,
        fullName: personName,
        role: String(row.role),
        partStatus: String(row.partStatus),
        round: Number(row.round || 1),
        legacy: true,
        required: false,
        precheckStatus: "NOT_REQUIRED",
        precheckNote: event?.note ?? null,
        precheckedBy: null,
        precheckedAt: toIso(event?.createdAt),
        eligiblePrecheckers: [],
        canPrecheck: false,
        routeStatus: "READY",
        blockers: [],
      });
      continue;
    }

    // Chuỗi quản lý: vòng lặp / quá sâu.
    const chainProblem = detectChainProblem(personId, supervisionMap, maxDepth);
    if (chainProblem) {
      participantBlockers.push({
        code: chainProblem,
        personId,
        personName,
        message:
          chainProblem === "CYCLE"
            ? "Phát hiện chu trình trong tuyến phụ trách — chờ phân tuyến lại."
            : `Tuyến phụ trách vượt quá ${maxDepth} cấp — chờ phân tuyến lại.`,
      });
      participantStatus = chainProblem;
      raise(chainProblem);
    }

    // Manager trực tiếp; loại self, participant, tài khoản không hoạt động,
    // SYSTEM_ADMIN và người có thẩm quyền final của chính hồ sơ.
    const directManagers = (supervisionMap.get(personId) ?? []).filter(
      (x) => x !== personId
    );
    const eligiblePrecheckers: RoutePerson[] = [];
    const candidateIssues: RouteBlocker[] = [];
    for (const managerId of directManagers) {
      const info = authority.get(managerId);
      if (!info || !info.hasActiveAccount) {
        candidateIssues.push({
          code: "NO_ACTIVE_ACCOUNT",
          personId,
          personName,
          message: "Người phụ trách trực tiếp không có tài khoản đang hoạt động.",
        });
        continue;
      }
      if (isSystemAdmin(info)) {
        candidateIssues.push({
          code: "SYSTEM_ADMIN",
          personId,
          personName,
          message: "Quản trị kỹ thuật không có quyền nghiệp vụ pre-check/final.",
        });
        continue;
      }
      if (participantIds.has(managerId)) {
        // Manager đồng thời là participant: không được tự pre-check phần mình
        // hoặc dùng vai trò participant để pre-check người khác.
        candidateIssues.push({
          code: "SELF_SUPERVISION",
          personId,
          personName,
          message: "Người phụ trách trực tiếp là người tham gia nhiệm vụ — cần tuyến khác.",
        });
        continue;
      }
      if (await isFinalEligible(tx, info, task.unitId)) {
        candidateIssues.push({
          code: "FINAL_AUTHORITY_ONLY",
          personId,
          personName,
          message:
            "Người phụ trách trực tiếp là người có thẩm quyền quyết định cuối — cần pre-checker khác để tách bước.",
        });
        continue;
      }
      eligiblePrecheckers.push(routePerson(info));
    }

    if (eligiblePrecheckers.length === 0) {
      if (candidateIssues.length > 0) {
        participantBlockers.push(...candidateIssues);
      } else if (!chainProblem) {
        participantBlockers.push({
          code: "MISSING_SUPERVISION",
          personId,
          personName,
          message: "Chưa có tuyến phụ trách đang hiệu lực — chờ phân tuyến (không fallback).",
        });
      }
      if (participantStatus === "READY") participantStatus = "WAITING_ASSIGNMENT";
      raise("WAITING_ASSIGNMENT");
    }

    // Trạng thái phần việc / pre-check.
    if (!exemptOrAccepted) {
      if (partStatus !== "SUBMITTED") {
        participantBlockers.push({
          code: "PART_NOT_SUBMITTED",
          personId,
          personName,
          message: "Phần việc chưa được người thực hiện báo hoàn thành.",
        });
        allPrechecked = false;
      } else if (precheckStatus !== "PASSED") {
        participantBlockers.push({
          code: "NOT_PRECHECKED",
          personId,
          personName,
          message:
            precheckStatus === "RETURNED"
              ? "Phần việc đã bị pre-check trả lại — cần báo lại."
              : "Phần việc chưa được kiểm tra sơ bộ.",
        });
        allPrechecked = false;
      }
    }

    const viewer = opts.viewer ?? null;
    const viewerEligible = !!viewer?.personId &&
      eligiblePrecheckers.some((p) => p.personId === viewer.personId);
    const canPrecheck =
      isPrecheckEnabled() &&
      viewerEligible &&
      String(task.status) === "IN_PROGRESS" &&
      partStatus === "SUBMITTED" &&
      precheckStatus !== "PASSED";

    const precheckerInfo = event?.actorPersonId
      ? authority.get(String(event.actorPersonId))
      : null;

    participants.push({
      personId,
      fullName: personName,
      role: String(row.role),
      partStatus,
      round: Number(row.round || 1),
      legacy: false,
      required: true,
      precheckStatus,
      precheckNote: event?.note ?? null,
      precheckedBy: precheckerInfo ? routePerson(precheckerInfo) : null,
      precheckedAt: toIso(event?.createdAt),
      eligiblePrecheckers,
      canPrecheck,
      routeStatus: participantStatus,
      blockers: participantBlockers,
    });
    blockers.push(...participantBlockers);
  }

  if (legacyOnly) allPrechecked = true;
  if (!legacyOnly && participants.some((p) => p.required && p.precheckStatus !== "PASSED" && p.partStatus !== "ACCEPTED" && p.partStatus !== "EXEMPT")) {
    allPrechecked = false;
  }
  if (!legacyOnly && participants.some((p) => p.blockers.some((b) => b.code === "NOT_PRECHECKED" || b.code === "PART_NOT_SUBMITTED"))) {
    allPrechecked = false;
  }
  const ready = legacyOnly || (worst === "READY" && allPrechecked);
  const status: RouteStatus = legacyOnly ? "READY" : worst;

  return {
    taskId: task.id,
    taskCode: task.code,
    taskStatus: task.status,
    ownerId: task.ownerId,
    ownerUnitId: task.unitId,
    required: !legacyOnly,
    legacyOnly,
    status,
    ready,
    allPrechecked,
    participants,
    finalCandidates,
    blockers,
    actualPrecheckerIds: [...actualPrecheckerIds],
    resolvedAt: now.toISOString(),
    source: "PersonSupervision",
    maxDepth,
  };
}

/** Lấy snapshot tuyến mới nhất của Task (nếu có). */
export async function getLatestRouteSnapshot(taskId: string, tx: any = prisma) {
  return tx.approvalRouteSnapshot.findFirst({
    where: { taskId },
    orderBy: { round: "desc" },
  });
}

function routeJsonForSnapshot(resolved: ResolvedTaskRoute) {
  return {
    version: 1,
    source: resolved.source,
    resolvedAt: resolved.resolvedAt,
    ownerUnitId: resolved.ownerUnitId,
    maxDepth: resolved.maxDepth,
    participants: resolved.participants.map((p) => ({
      personId: p.personId,
      fullName: p.fullName,
      role: p.role,
      partStatus: p.partStatus,
      round: p.round,
      precheckStatus: p.precheckStatus,
      precheckedBy: p.precheckedBy
        ? { personId: p.precheckedBy.personId, fullName: p.precheckedBy.fullName }
        : null,
      precheckedAt: p.precheckedAt,
      precheckNote: p.precheckNote,
      eligiblePrecheckers: p.eligiblePrecheckers.map((x) => ({
        personId: x.personId,
        fullName: x.fullName,
      })),
    })),
    final: {
      authority: "EXISTING_CAN_DECIDE",
      unitId: resolved.ownerUnitId,
      candidates: resolved.finalCandidates.map((x) => ({
        personId: x.personId,
        fullName: x.fullName,
        role: x.role,
        unitName: x.unitName,
      })),
      excludedPrecheckerIds: resolved.actualPrecheckerIds,
    },
    blockers: resolved.blockers,
  };
}

/**
 * Tạo snapshot tuyến khi owner nộp chung. Chỉ gọi trong transaction của
 * submitOverallResult sau khi S-ALL + pre-check đã đủ.
 */
export async function createRouteSnapshotForSubmission(
  tx: any,
  opts: { taskId: string; round: number; user: SessionUser }
) {
  const resolved = await resolveTaskRoute(opts.taskId, { tx, viewer: opts.user });
  if (resolved.legacyOnly) return null;
  if (resolved.status !== "READY" || !resolved.allPrechecked) {
    throw new ParticipantError(
      resolved.status === "READY"
        ? "Chưa đủ phần việc được kiểm tra sơ bộ trước khi nộp kết quả chung."
        : "Tuyến kiểm tra sơ bộ chưa sẵn sàng — chờ phân tuyến, không tự nộp chung.",
      409,
      {
        routeStatus: resolved.status,
        blockers: resolved.blockers,
        participants: resolved.participants.map((p) => ({
          personId: p.personId,
          fullName: p.fullName,
          precheckStatus: p.precheckStatus,
          partStatus: p.partStatus,
        })),
      }
    );
  }
  // Fail-closed: final phải có ít nhất một người không phải participant/pre-checker.
  if (resolved.finalCandidates.length === 0) {
    throw new ParticipantError(
      "Chưa xác định được người có thẩm quyền quyết định cuối — chờ phân tuyến.",
      409,
      { routeStatus: "WAITING_ASSIGNMENT", blockers: resolved.blockers }
    );
  }
  return tx.approvalRouteSnapshot.create({
    data: {
      taskId: opts.taskId,
      round: opts.round,
      routeStatus: "READY",
      routeJson: routeJsonForSnapshot(resolved) as any,
      createdById: opts.user.personId ?? null,
    },
  });
}

/** Gắn caseId vào snapshot của đúng vòng khi ApprovalCase được tạo (không đổi route). */
export async function linkRouteSnapshotToCase(
  tx: any,
  taskId: string,
  round: number,
  caseId: string
) {
  await tx.approvalRouteSnapshot.updateMany({
    where: { taskId, round, caseId: null },
    data: { caseId },
  });
}

function routeAllowsDecider(snapshot: any, personId: string | null | undefined): boolean {
  if (!personId) return false;
  const json: any = snapshot?.routeJson ?? {};
  const candidates: any[] = Array.isArray(json?.final?.candidates) ? json.final.candidates : [];
  if (candidates.length === 0) return false;
  if (!candidates.some((c) => c.personId === personId)) return false;
  const excluded: string[] = Array.isArray(json?.final?.excludedPrecheckerIds)
    ? json.final.excludedPrecheckerIds
    : [];
  if (excluded.includes(personId)) return false;
  return true;
}

/**
 * Gate final: nếu có snapshot tuyến thì người quyết định phải nằm trong danh sách
 * người có thẩm quyền cuối đã chốt, không phải pre-checker/participant.
 * Không có snapshot => legacy final-only (giữ hành vi S4).
 */
export async function assertFinalDecisionAllowed(
  user: SessionUser,
  taskId: string,
  tx: any = prisma
): Promise<{ snapshot: any | null; legacyFinalOnly: boolean }> {
  if (!isPrecheckEnabled()) return { snapshot: null, legacyFinalOnly: false };
  const snapshot = await getLatestRouteSnapshot(taskId, tx);
  if (!snapshot) {
    // Chỉ Task legacy (không có participant row) mới được final-only.
    // Task có participant row nhưng thiếu snapshot là bất thường/không an toàn => chặn.
    const route = await resolveTaskRoute(taskId, { tx });
    if (route.legacyOnly) {
      return { snapshot: null, legacyFinalOnly: true };
    }
    throw new ParticipantError(
      "Chưa có snapshot tuyến kiểm tra sơ bộ tại thời điểm nộp — không thể quyết định cuối.",
      409,
      { routeStatus: route.status, blockers: route.blockers }
    );
  }
  if (String(snapshot.routeStatus) !== "READY") {
    throw new ParticipantError(
      "Tuyến kiểm tra sơ bộ chưa sẵn sàng — không thể quyết định cuối.",
      409,
      { routeStatus: snapshot.routeStatus }
    );
  }
  if (!routeAllowsDecider(snapshot, user.personId)) {
    const json: any = snapshot.routeJson ?? {};
    const excluded: string[] = Array.isArray(json?.final?.excludedPrecheckerIds)
      ? json.final.excludedPrecheckerIds
      : [];
    throw new ParticipantError(
      excluded.includes(String(user.personId))
        ? "Bạn đã pre-check hồ sơ này — cần người có thẩm quyền khác quyết định cuối."
        : "Bạn không thuộc tuyến quyết định cuối đã chốt tại thời điểm nộp hồ sơ.",
      403,
      { routeStatus: snapshot.routeStatus }
    );
  }
  return { snapshot, legacyFinalOnly: false };
}

export interface PrecheckView {
  enabled: boolean;
  taskStatus?: string;
  route?: ResolvedTaskRoute;
  latestSnapshot?: {
    id: string;
    round: number;
    routeStatus: string;
    createdAt: string;
    routeJson: any;
    caseId: string | null;
  } | null;
  canSubmitOverall?: boolean;
  viewerCanPrecheckAny?: boolean;
}

/** Projection cho GET Task detail/participant API — chỉ đọc. */
export async function getTaskPrecheckView(
  taskId: string,
  user: SessionUser,
  tx: any = prisma
): Promise<PrecheckView> {
  if (!isPrecheckEnabled()) return { enabled: false };
  const route = await resolveTaskRoute(taskId, { tx, viewer: user });
  const snapshot = await getLatestRouteSnapshot(taskId, tx);
  return {
    enabled: true,
    taskStatus: route.taskStatus,
    route,
    latestSnapshot: snapshot
      ? {
          id: snapshot.id,
          round: snapshot.round,
          routeStatus: snapshot.routeStatus,
          createdAt: snapshot.createdAt?.toISOString?.() ?? String(snapshot.createdAt),
          routeJson: snapshot.routeJson,
          caseId: snapshot.caseId ?? null,
        }
      : null,
    canSubmitOverall:
      route.status === "READY" &&
      route.allPrechecked &&
      route.taskStatus === "IN_PROGRESS",
    viewerCanPrecheckAny: route.participants.some((p) => p.canPrecheck),
  };
}

export interface PrecheckActionInput {
  action: "PASS" | "RETURN";
  note?: string | null;
}

/**
 * Ghi nhận pre-check PASS/RETURN. Không đổi participant sang ACCEPTED (final mới
 * ACCEPTED), không mở ApprovalCase. Một pre-checker là đủ.
 */
export async function precheckParticipantPart(
  user: SessionUser,
  taskId: string,
  personId: string,
  input: PrecheckActionInput
) {
  if (!isPrecheckEnabled()) {
    throw new ParticipantError(
      "Tính năng kiểm tra sơ bộ (YC-11) đang tắt.",
      409,
      { enabled: false }
    );
  }
  if (user.role === "SYSTEM_ADMIN") {
    throw new ParticipantError("Quản trị kỹ thuật không có quyền nghiệp vụ.", 403);
  }
  const action = input.action;
  if (action !== "PASS" && action !== "RETURN") {
    throw new ParticipantError("Hành động kiểm tra sơ bộ không hợp lệ.", 422);
  }
  const note = (input.note || "").trim();
  if (action === "RETURN" && note.length < 3) {
    throw new ParticipantError("Vui lòng ghi rõ lý do trả lại phần việc.", 422);
  }

  const result = await prisma.$transaction(async (tx) => {
    const route = await resolveTaskRoute(taskId, { tx, viewer: user });
    const participant = route.participants.find((p) => p.personId === personId);
    if (!participant) throw new ParticipantError("Không tìm thấy phần việc.", 404);
    if (personId === user.personId) {
      throw new ParticipantError("Bạn không thể tự kiểm tra sơ bộ phần việc của chính mình.", 403);
    }
    if (route.legacyOnly) {
      throw new ParticipantError("Nhiệm vụ legacy không yêu cầu kiểm tra sơ bộ.", 409);
    }
    if (route.status !== "READY") {
      throw new ParticipantError(
        "Tuyến kiểm tra sơ bộ chưa sẵn sàng — chờ phân tuyến.",
        409,
        { routeStatus: route.status, blockers: route.blockers }
      );
    }
    if (!participant.required) {
      throw new ParticipantError("Phần việc này không yêu cầu kiểm tra sơ bộ.", 409);
    }
    if (!participant.eligiblePrecheckers.some((p) => p.personId === user.personId)) {
      throw new ParticipantError(
        "Bạn không thuộc tuyến kiểm tra sơ bộ của phần việc này.",
        403
      );
    }
    if (route.taskStatus !== "IN_PROGRESS") {
      throw new ParticipantError(
        "Chỉ kiểm tra sơ bộ khi nhiệm vụ đang thực hiện.",
        409
      );
    }
    if (participant.partStatus !== "SUBMITTED") {
      throw new ParticipantError(
        "Chỉ kiểm tra sơ bộ phần việc đã được báo hoàn thành.",
        409
      );
    }

    // Idempotent: một người PASS là đủ; người pre-checker khác không bị lỗi.
    if (action === "PASS" && participant.precheckStatus === "PASSED") {
      return { row: null, alreadyPassed: true, route };
    }

    const row = await tx.taskParticipantResult.findUnique({
      where: { taskId_personId: { taskId, personId } },
    });
    if (!row) throw new ParticipantError("Không tìm thấy phần việc.", 404);

    const event = await tx.taskParticipantEvent.create({
      data: {
        participantResultId: row.id,
        taskId,
        personId,
        eventType: action === "PASS" ? "PRECHECK_PASS" : "PRECHECK_RETURN",
        round: Number(row.round || 1),
        actorAccountId: user.id,
        actorPersonId: user.personId ?? null,
        note: note || null,
        resultTextSnapshot: row.partResultText,
        completedOnSnapshot: row.partCompletedOn,
      },
    });

    let updated = row;
    if (action === "RETURN") {
      updated = await tx.taskParticipantResult.update({
        where: { id: row.id },
        data: {
          partStatus: "RETURNED",
          decidedAt: new Date(),
          decidedById: user.personId ?? null,
          decisionNote: note,
        },
      });
    }

    await tx.taskUpdate.create({
      data: {
        taskId,
        authorId: user.personId,
        progressPercent: 0,
        statusBefore: null,
        statusAfter: null,
        kind: action === "PASS" ? "participant_precheck_pass" : "participant_precheck_return",
        notes:
          action === "PASS"
            ? `Kiểm tra sơ bộ đạt phần việc của ${row.personId === personId ? participant.fullName : participant.fullName}.`
            : `Kiểm tra sơ bộ trả lại phần việc của ${participant.fullName}: ${note}`,
        subjectPersonId: personId,
        participantEventId: event.id,
      },
    });

    return { row: updated, alreadyPassed: false, route };
  });

  if (!result.alreadyPassed) {
    await recordAuditForPrecheck(user, taskId, personId, action, note, result.route);
  }
  await notifyPrecheck(user, taskId, personId, action, note, result.route);
  return {
    success: true,
    alreadyPassed: result.alreadyPassed,
    participant: result.route.participants.find((p) => p.personId === personId) ?? null,
  };
}

async function recordAuditForPrecheck(
  user: SessionUser,
  taskId: string,
  personId: string,
  action: "PASS" | "RETURN",
  note: string,
  route: ResolvedTaskRoute
) {
  const { recordAuditEvent } = await import("./audit");
  await recordAuditEvent({
    actorId: user.id,
    action: action === "PASS" ? "TASK_PRECHECK_PASS" : "TASK_PRECHECK_RETURN",
    resourceType: "Task",
    resourceId: taskId,
    oldData: { routeStatus: route.status, participantPersonId: personId },
    newData: {
      personId,
      action,
      note: note || null,
      by: user.fullName,
      routeStatus: route.status,
      snapshotSource: route.source,
    },
  });
}

async function notifyPrecheck(
  user: SessionUser,
  taskId: string,
  personId: string,
  action: "PASS" | "RETURN",
  note: string,
  route: ResolvedTaskRoute
) {
  const { createNotification } = await import("./notifications");
  const participant = route.participants.find((p) => p.personId === personId);
  const recipients = new Set<string>([personId, route.ownerId]);
  recipients.delete(user.personId);
  for (const recipientId of recipients) {
    await createNotification({
      recipientId,
      category: "task",
      type: action === "PASS" ? "TASK_PRECHECK_PASS" : "TASK_PRECHECK_RETURN",
      title:
        action === "PASS"
          ? `Phần việc đạt kiểm tra sơ bộ: [${route.taskCode}]`
          : `Phần việc bị trả lại ở bước kiểm tra sơ bộ: [${route.taskCode}]`,
      content:
        action === "PASS"
          ? `${user.fullName} đã kiểm tra sơ bộ phần việc của ${participant?.fullName ?? "cán bộ"}. Chờ chủ trì tổng hợp, chưa phải quyết định cuối.`
          : `Lý do: ${note}`,
      tag: action === "PASS" ? "PRE-CHECK ĐẠT" : "PRE-CHECK TRẢ LẠI",
      tagType: action === "PASS" ? "success" : "warning",
      entityType: "TASK",
      entityId: taskId,
      actionUrl: `/tasks/${taskId}`,
      actionLabel: "Xem nhiệm vụ",
      taskCode: route.taskCode,
      idempotencyKey: `precheck-${action}:${taskId}:${personId}:${Date.now()}`,
    });
  }
}

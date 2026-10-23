import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth";
import { jsonError } from "@/server/guard";
import { recordAuditEvent } from "@/server/audit";
import {
  resolveEntryPerms,
  permForMetric,
  isEntryDateAllowed,
  parseNumberInput,
  dateOnlyFromStr,
  dateOnlyToStr,
  todayVnDateOnly,
  defaultUnitLabel,
  parseDerivation,
  detectSuspiciousEntryValues,
} from "@/server/metrics";

const D = Prisma.Decimal;

// ============================================================
// GET /api/metrics/entries?date=YYYY-MM-DD
//   -> danh sách chỉ tiêu người dùng được nhập/kiểm tra + giá trị hiện có của ngày
// GET /api/metrics/entries?history=<entryId>
//   -> lịch sử sửa của một bản ghi
// ============================================================

export async function GET(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const { searchParams } = new URL(req.url);
    const historyId = searchParams.get("history");
    const today = todayVnDateOnly();

    // ---- Lịch sử sửa ----
    if (historyId) {
      const entry = await prisma.metricDailyEntry.findUnique({ where: { id: historyId } });
      if (!entry) return jsonError("Bản ghi không tồn tại", 404);
      const perms = await resolveEntryPerms(user);
      const metric = await prisma.metricDefinition.findUnique({ where: { id: entry.metricId } });
      if (!metric) return jsonError("Chỉ tiêu không tồn tại", 404);
      const p = permForMetric(perms, metric);
      if (!perms.all && !p.canEnter && !p.canConfirm)
        return jsonError("Bạn không có quyền xem lịch sử chỉ tiêu này", 403);

      const revisions = await prisma.metricEntryRevision.findMany({
        where: { entryId: historyId },
        orderBy: { editedAt: "desc" },
        take: 100,
      });
      const ids = Array.from(new Set(revisions.map((r) => r.editedById)));
      const persons = ids.length
        ? await prisma.person.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })
        : [];
      const nameById = new Map(persons.map((x) => [x.id, x.fullName]));
      return NextResponse.json({
        success: true,
        metricName: metric.name,
        revisions: revisions.map((r) => ({
          id: r.id,
          action: r.action,
          oldValue: r.oldValue === null ? null : Number(r.oldValue),
          newValue: r.newValue === null ? null : Number(r.newValue),
          oldStatus: r.oldStatus,
          newStatus: r.newStatus,
          reason: r.reason,
          editedByName: nameById.get(r.editedById) || null,
          editedAt: r.editedAt.toISOString(),
        })),
      });
    }

    // ---- Danh sách nhập liệu theo ngày ----
    const dateStr = searchParams.get("date") || dateOnlyToStr(today);
    const date = dateOnlyFromStr(dateStr);
    if (!date) return jsonError("Ngày không hợp lệ (định dạng YYYY-MM-DD)", 400);

    const perms = await resolveEntryPerms(user);

    const [groups, metrics, classifications] = await Promise.all([
      prisma.metricGroup.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      prisma.metricDefinition.findMany({
        where: { active: true, valueKind: { in: ["FLOW", "BALANCE"] } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.metricClassification.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      }),
    ]);

    interface LineRow {
      metricId: string;
      classificationId: string;
      id: string;
      valueNumeric: Prisma.Decimal;
      status: string;
      dataSource: string;
      note: string | null;
      enteredById: string;
    }
    const entries: LineRow[] = metrics.length
      ? await prisma.metricDailyEntry.findMany({
          where: { entryDate: date, metricId: { in: metrics.map((m) => m.id) } },
          select: {
            id: true,
            metricId: true,
            classificationId: true,
            valueNumeric: true,
            status: true,
            dataSource: true,
            note: true,
            enteredById: true,
          },
        })
      : [];
    const entryKey = (m: string, c: string) => `${m}|${c}`;
    const entryMap = new Map<string, LineRow>();
    for (const e of entries) entryMap.set(entryKey(e.metricId, e.classificationId), e);

    // Tên người nhập cho dòng đã có
    const enteredByIds = Array.from(new Set(entries.map((e) => e.enteredById)));
    const persons = enteredByIds.length
      ? await prisma.person.findMany({ where: { id: { in: enteredByIds } }, select: { id: true, fullName: true } })
      : [];
    const nameById = new Map(persons.map((p) => [p.id, p.fullName]));

    const classesByMetric = new Map<string, { id: string; label: string }[]>();
    for (const c of classifications) {
      const arr = classesByMetric.get(c.metricId) || [];
      arr.push({ id: c.id, label: c.label });
      classesByMetric.set(c.metricId, arr);
    }

    const isoToday = dateOnlyToStr(today);
    const resultGroups = [];
    let anyEditable = false;

    for (const g of groups) {
      const gMetrics = metrics.filter((m) => m.groupId === g.id);
      const rows = [];
      for (const m of gMetrics) {
        const p = permForMetric(perms, m);
        if (!perms.all && !p.canEnter && !p.canConfirm) continue;

        const classes = classesByMetric.get(m.id) || [];
        const lines = classes.length > 0 ? classes.map((c) => ({ classificationId: c.id, label: c.label })) : [{ classificationId: "", label: "" }];

        const values = lines.map((ln) => {
          const e = entryMap.get(entryKey(m.id, ln.classificationId)) || null;
          const status = e?.status || "";
          const canEdit =
            perms.all ||
            (p.canEnter && (status === "" || status === "DRAFT" || status === "RECORDED" || status === "NEEDS_FIX"));
          const canSubmit =
            (perms.all || p.canEnter) && m.requireConfirm && (status === "" || status === "DRAFT" || status === "NEEDS_FIX" || status === "RECORDED");
          const canConfirm = (perms.all || p.canConfirm) && status === "SUBMITTED";
          const canFix = (perms.all || p.canConfirm) && (status === "SUBMITTED" || status === "CONFIRMED");
          if (canEdit) anyEditable = true;
          return {
            classificationId: ln.classificationId,
            label: ln.label,
            entryId: e?.id || null,
            valueBase: e ? Number(e.valueNumeric) : null,
            status,
            dataSource: e?.dataSource || null,
            isOfficial: e ? e.dataSource === "REAL" : false,
            note: e?.note || null,
            enteredByName: e ? nameById.get(e.enteredById) || null : null,
            canEdit,
            canSubmit,
            canConfirm,
            canFix,
          };
        });

        rows.push({
          id: m.id,
          code: m.code,
          name: m.name,
          unitType: m.unitType,
          unitLabel: defaultUnitLabel(m.unitType, m.displayScale, m.unitLabel),
          displayScale: m.displayScale || 1,
          decimals: m.decimals,
          valueKind: m.valueKind,
          requireConfirm: m.requireConfirm,
          note: m.note,
          canEnter: p.canEnter || perms.all,
          canConfirm: p.canConfirm || perms.all,
          backdateDays: perms.all ? -1 : p.backdateDays,
          values,
        });
      }
      if (rows.length > 0) {
        resultGroups.push({ id: g.id, code: g.code, name: g.name, metrics: rows });
      }
    }

    return NextResponse.json({
      success: true,
      date: dateOnlyToStr(date),
      today: isoToday,
      isToday: dateOnlyToStr(date) === isoToday,
      anyEditable,
      groups: resultGroups,
    });
  } catch (error: any) {
    console.error("GET /api/metrics/entries error:", error);
    return jsonError("Lỗi hệ thống khi tải số liệu", 500);
  }
}

// ============================================================
// POST — lưu một ngày: { entries: [{ metricId, classificationId, entryDate, value, note? }] }
// value nhập theo ĐƠN VỊ HIỂN THỊ (displayScale), lưu CSDL theo đơn vị gốc.
// ============================================================

export async function POST(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const body = await req.json().catch(() => null);
    const items: any[] | null = Array.isArray(body?.entries) ? body.entries : null;
    if (!items || items.length === 0) return jsonError("Không có số liệu để lưu", 400);
    if (items.length > 300) return jsonError("Một lần lưu tối đa 300 ô số liệu", 400);

    const perms = await resolveEntryPerms(user);
    const today = todayVnDateOnly();
    // B-C-2/Q9: tài khoản DEMO tạo dữ liệu DEMO; tài khoản thật mặc định REAL.
    // Không dò nhãn; bản ghi cũ giữ nguyên dataSource khi được sửa.
    const entryDataSource = (user.personCode || "").toUpperCase().startsWith("DEMO") ? "DEMO" : "REAL";

    const metricIds: string[] = Array.from(new Set(items.map((it: any) => String(it.metricId || "")))).filter(Boolean);
    const metrics = await prisma.metricDefinition.findMany({ where: { id: { in: metricIds } } });
    const metricById = new Map(metrics.map((m) => [m.id, m]));

    // ---- Kiểm tra từng dòng ----
    const prepared: {
      metric: (typeof metrics)[number];
      classificationId: string;
      entryDate: Date;
      valueBase: Prisma.Decimal;
      note: string | null;
    }[] = [];
    const errors: { index: number; message: string }[] = [];

    items.forEach((it: any, idx: number) => {
      const metric = metricById.get(String(it.metricId || ""));
      if (!metric || !metric.active) {
        errors.push({ index: idx, message: "Chỉ tiêu không tồn tại hoặc đã ẩn" });
        return;
      }
      if (metric.valueKind === "DERIVED") {
        errors.push({ index: idx, message: `"${metric.name}" là chỉ tiêu tự tính — không nhập trực tiếp` });
        return;
      }
      const p = permForMetric(perms, metric);
      if (!p.canEnter) {
        errors.push({ index: idx, message: `Bạn không được phân công nhập "${metric.name}"` });
        return;
      }
      const entryDate = dateOnlyFromStr(String(it.entryDate || dateOnlyToStr(today)));
      if (!entryDate) {
        errors.push({ index: idx, message: `"${metric.name}": ngày không hợp lệ` });
        return;
      }
      const allowed = isEntryDateAllowed(entryDate, today, p.backdateDays, perms, metric);
      if (!allowed.ok) {
        errors.push({ index: idx, message: `"${metric.name}": ${allowed.reason}` });
        return;
      }
      const parsed = parseNumberInput(it.value);
      if (parsed === null) {
        errors.push({ index: idx, message: `"${metric.name}": giá trị không hợp lệ ("${String(it.value)}")` });
        return;
      }
      const valueBase = new D(parsed).mul(metric.displayScale || 1);
      const classificationId = typeof it.classificationId === "string" ? it.classificationId : "";
      prepared.push({ metric, classificationId, entryDate, valueBase, note: it.note ? String(it.note).slice(0, 500) : null });
    });

    if (errors.length > 0) {
      return NextResponse.json({ success: false, error: "Có số liệu không hợp lệ — chưa lưu gì", errors }, { status: 400 });
    }

    // ---- P0: cảnh báo mềm giá trị bất thường (khả năng nhập số lũy kế) — KHÔNG chặn lưu ----
    const warnings = await detectSuspiciousEntryValues(
      prepared.map((p) => ({
        metric: p.metric,
        classificationId: p.classificationId,
        entryDate: p.entryDate,
        valueBase: p.valueBase,
      }))
    );

    // ---- Lưu (một giao dịch: hoặc tất cả, hoặc không gì) ----
    const savedIds = await prisma.$transaction(async (tx) => {
      const out: {
        metricId: string;
        classificationId: string;
        entryId: string;
        status: string;
        dataSource: string;
        isOfficial: boolean;
      }[] = [];
      for (const p of prepared) {
        const existing = await tx.metricDailyEntry.findUnique({
          where: {
            metricId_classificationId_entryDate: {
              metricId: p.metric.id,
              classificationId: p.classificationId,
              entryDate: p.entryDate,
            },
          },
        });

        if (existing && (existing.status === "SUBMITTED" || existing.status === "CONFIRMED") && !perms.all) {
          throw new Error(`ENTRY_LOCKED:${p.metric.name}`);
        }

        let nextStatus: string;
        if (p.metric.requireConfirm) {
          nextStatus = existing?.status === "CONFIRMED" && perms.all ? "CONFIRMED" : "DRAFT";
        } else {
          nextStatus = "RECORDED";
        }

        let entryId: string;
        if (existing) {
          const updated = await tx.metricDailyEntry.update({
            where: { id: existing.id },
            data: {
              valueNumeric: p.valueBase,
              note: p.note,
              dataSource: existing.dataSource,
              enteredById: user.personId,
              status: nextStatus,
              submittedAt: nextStatus === "CONFIRMED" ? existing.submittedAt : null,
              confirmedById: nextStatus === "CONFIRMED" ? existing.confirmedById : null,
              confirmedAt: nextStatus === "CONFIRMED" ? existing.confirmedAt : null,
            },
          });
          entryId = updated.id;
          await tx.metricEntryRevision.create({
            data: {
              entryId,
              action: "UPDATE",
              oldValue: existing.valueNumeric,
              newValue: p.valueBase,
              oldStatus: existing.status,
              newStatus: nextStatus,
              editedById: user.personId,
            },
          });
        } else {
          const created = await tx.metricDailyEntry.create({
            data: {
              metricId: p.metric.id,
              classificationId: p.classificationId,
              entryDate: p.entryDate,
              valueNumeric: p.valueBase,
              status: nextStatus,
              dataSource: entryDataSource,
              note: p.note,
              enteredById: user.personId,
            },
          });
          entryId = created.id;
          await tx.metricEntryRevision.create({
            data: {
              entryId,
              action: "CREATE",
              newValue: p.valueBase,
              newStatus: nextStatus,
              editedById: user.personId,
            },
          });
        }
        const savedDataSource = existing?.dataSource || entryDataSource;
        out.push({
          metricId: p.metric.id,
          classificationId: p.classificationId,
          entryId,
          status: nextStatus,
          dataSource: savedDataSource,
          isOfficial: savedDataSource === "REAL",
        });
      }
      return out;
    });

    await recordAuditEvent({
      actorId: user.id,
      action: "METRIC_ENTRIES_SAVED",
      resourceType: "MetricEntry",
      newData: {
        date: dateOnlyToStr(prepared[0].entryDate),
        count: savedIds.length,
        metrics: prepared.map((p) => p.metric.code),
        warnings: warnings.length,
      },
    });

    return NextResponse.json({ success: true, saved: savedIds.length, items: savedIds, warnings });
  } catch (error: any) {
    if (typeof error?.message === "string" && error.message.startsWith("ENTRY_LOCKED:")) {
      const name = error.message.slice("ENTRY_LOCKED:".length);
      return jsonError(`"${name}": số liệu đã gửi kiểm tra/xác nhận — chỉ lãnh đạo được sửa`, 403);
    }
    console.error("POST /api/metrics/entries error:", error);
    return jsonError("Lỗi hệ thống khi lưu số liệu", 500);
  }
}

// ============================================================
// PATCH — chuyển trạng thái: { id, action: submit | confirm | needs_fix | delete, reason? }
// ============================================================

export async function PATCH(req: NextRequest) {
  try {
    const user = await authenticateRequest(req);
    if (!user) return jsonError("Yêu cầu đăng nhập", 401);

    const body = await req.json().catch(() => null);
    const id = body?.id ? String(body.id) : null;
    const action = body?.action ? String(body.action) : null;
    const reason = body?.reason ? String(body.reason).slice(0, 500) : null;
    if (!id || !action) return jsonError("Thiếu thông tin thao tác", 400);

    const entry = await prisma.metricDailyEntry.findUnique({ where: { id } });
    if (!entry) return jsonError("Bản ghi không tồn tại", 404);
    const metric = await prisma.metricDefinition.findUnique({ where: { id: entry.metricId } });
    if (!metric) return jsonError("Chỉ tiêu không tồn tại", 404);

    const perms = await resolveEntryPerms(user);
    const p = permForMetric(perms, metric);
    const canAdmin = perms.all;

    const audit = (act: string) =>
      recordAuditEvent({
        actorId: user.id,
        action: act,
        resourceType: "MetricEntry",
        resourceId: id,
        newData: { metricCode: metric.code, status: action },
      });

    if (action === "submit") {
      if (!metric.requireConfirm) return jsonError("Chỉ tiêu này không bật quy trình kiểm tra", 400);
      if (!canAdmin && !p.canEnter) return jsonError("Bạn không có quyền gửi kiểm tra chỉ tiêu này", 403);
      if (!["DRAFT", "NEEDS_FIX", "RECORDED"].includes(entry.status))
        return jsonError("Bản ghi không ở trạng thái có thể gửi kiểm tra", 400);
      await prisma.metricDailyEntry.update({
        where: { id },
        data: { status: "SUBMITTED", submittedAt: new Date(), confirmedById: null, confirmedAt: null },
      });
      await prisma.metricEntryRevision.create({
        data: { entryId: id, action: "SUBMIT", oldStatus: entry.status, newStatus: "SUBMITTED", reason, editedById: user.personId },
      });
      await audit("METRIC_ENTRY_SUBMITTED");
      return NextResponse.json({ success: true, status: "SUBMITTED" });
    }

    if (action === "confirm") {
      if (!canAdmin && !p.canConfirm) return jsonError("Bạn không có quyền xác nhận chỉ tiêu này", 403);
      if (entry.status !== "SUBMITTED") return jsonError("Chỉ xác nhận được bản ghi đang chờ kiểm tra", 400);
      await prisma.metricDailyEntry.update({
        where: { id },
        data: { status: "CONFIRMED", confirmedById: user.personId, confirmedAt: new Date() },
      });
      await prisma.metricEntryRevision.create({
        data: { entryId: id, action: "CONFIRM", oldStatus: entry.status, newStatus: "CONFIRMED", reason, editedById: user.personId },
      });
      await audit("METRIC_ENTRY_CONFIRMED");
      return NextResponse.json({ success: true, status: "CONFIRMED" });
    }

    if (action === "needs_fix") {
      if (!canAdmin && !p.canConfirm) return jsonError("Bạn không có quyền yêu cầu điều chỉnh", 403);
      if (!["SUBMITTED", "CONFIRMED"].includes(entry.status))
        return jsonError("Chỉ yêu cầu điều chỉnh với bản ghi đã gửi/xác nhận", 400);
      await prisma.metricDailyEntry.update({
        where: { id },
        data: { status: "NEEDS_FIX", confirmedById: null, confirmedAt: null },
      });
      await prisma.metricEntryRevision.create({
        data: { entryId: id, action: "NEEDS_FIX", oldStatus: entry.status, newStatus: "NEEDS_FIX", reason, editedById: user.personId },
      });
      await audit("METRIC_ENTRY_NEEDS_FIX");
      return NextResponse.json({ success: true, status: "NEEDS_FIX" });
    }

    if (action === "delete") {
      const deletableByEnterer = ["DRAFT", "RECORDED", "NEEDS_FIX"].includes(entry.status);
      if (!canAdmin && !(p.canEnter && deletableByEnterer))
        return jsonError("Bản ghi đã gửi/xác nhận — chỉ lãnh đạo được xóa", 403);
      await prisma.metricDailyEntry.delete({ where: { id } });
      await prisma.metricEntryRevision.create({
        data: { entryId: id, action: "DELETE", oldValue: entry.valueNumeric, oldStatus: entry.status, reason, editedById: user.personId },
      });
      await audit("METRIC_ENTRY_DELETED");
      return NextResponse.json({ success: true });
    }

    return jsonError("Thao tác không hợp lệ", 400);
  } catch (error: any) {
    console.error("PATCH /api/metrics/entries error:", error);
    return jsonError("Lỗi hệ thống khi cập nhật trạng thái số liệu", 500);
  }
}

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { getIsoWeekFromDate, getVnDateParts } from "@/lib/period-helper";
import { fmtMetric, fmtDate, STATUS_LABELS, STATUS_STYLES } from "@/lib/metric-format";
import { DataQualityBanner, type MetricDataQuality } from "@/components/dashboard/DataQualityBanner";
import { RevenueComparisonSection } from "@/components/dashboard/RevenueComparisonSection";

type Mode = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

interface TargetRow {
  id?: string;
  label: string;
  periodType: string;
  periodNo: number | null;
  targetValue: number;
  percent: number | null;
  status?: string;
  comparisonKind?: string;
}
interface ClassCol {
  classificationId: string;
  label: string;
  cols: { week: number | null; month: number | null; quarter: number | null; year: number | null };
  latestDate: string | null;
}
interface SummaryMetric {
  id: string;
  code: string;
  name: string;
  unitLabel: string;
  displayScale: number;
  decimals: number;
  valueKind: "FLOW" | "BALANCE" | "DERIVED";
  requireConfirm: boolean;
  keepDaily?: boolean;
  expectDaily: boolean;
  note: string | null;
  cols: { week: number | null; month: number | null; quarter: number | null; year: number | null };
  classCols: ClassCol[];
  targets: TargetRow[];
  latest: { date: string; value: number; status: string; byName: string | null } | null;
  missingDates: string[];
}
interface SummaryGroup {
  id: string;
  code: string;
  name: string;
  metrics: SummaryMetric[];
}
interface SummaryData {
  range: {
    week: { year: number; weekNumber: number; label: string; startDate: string; endDate: string };
    month: { year: number; month: number; label: string };
    quarter: { year: number; quarter: number; label: string };
    year: { year: number; label: string };
  };
  groups: SummaryGroup[];
  /** YC-26 — cờ chất lượng dữ liệu (DEMO lẫn số thật) */
  dataQuality?: MetricDataQuality;
}
interface NarrativeSection {
  id: string;
  code: string;
  title: string;
  groupName: string | null;
  content: string;
  updatedByName: string | null;
  updatedAt: string | null;
  canEdit: boolean;
}

const MODE_TABS: { key: Mode; label: string }[] = [
  { key: "WEEK", label: "Tuần" },
  { key: "MONTH", label: "Tháng" },
  { key: "QUARTER", label: "Quý" },
  { key: "YEAR", label: "Năm" },
];

function modeLabel(mode: Mode): string {
  return mode === "WEEK" ? "Tuần" : mode === "MONTH" ? "Tháng" : mode === "QUARTER" ? "Quý" : "Năm";
}

export default function GiaoBanPage() {
  const { showAdminMenu } = usePermissions();
  const now = new Date();
  const vn = getVnDateParts(now);
  const iso = getIsoWeekFromDate(now);

  const [tab, setTab] = useState<"DATA" | "NOTES">("DATA");
  const [mode, setMode] = useState<Mode>("WEEK");
  const [year, setYear] = useState(iso.year);
  const [week, setWeek] = useState(iso.weekNumber);
  const [month, setMonth] = useState(vn.month);
  const [quarter, setQuarter] = useState(Math.ceil(vn.month / 3));

  const [data, setData] = useState<SummaryData | null>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [sections, setSections] = useState<NarrativeSection[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  const periodKey = useMemo(() => {
    if (mode === "WEEK") return `${year}-W${String(week).padStart(2, "0")}`;
    if (mode === "MONTH") return `${year}-${String(month).padStart(2, "0")}`;
    if (mode === "QUARTER") return `${year}-Q${quarter}`;
    return String(year);
  }, [mode, year, week, month, quarter]);

  useEffect(() => {
    setLoading(true);
    const qs = new URLSearchParams({
      year: String(year),
      week: String(week),
      month: String(month),
      quarter: String(quarter),
      comparison: "1", // YC-26: kèm bảng so sánh kết quả thu
    });
    fetch(`/api/metrics/summary?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          setData(json);
          setComparison(json.comparison || null);
        }
      })
      .catch(() => toast.error("Không tải được số liệu"))
      .finally(() => setLoading(false));
  }, [year, week, month, quarter]);

  useEffect(() => {
    if (tab !== "NOTES") return;
    setNotesLoading(true);
    fetch(`/api/narratives?periodType=${mode}&periodKey=${periodKey}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          setSections(json.sections);
          const drafts: Record<string, string> = {};
          for (const s of json.sections) drafts[s.id] = s.content || "";
          setNoteDrafts(drafts);
        }
      })
      .catch(() => toast.error("Không tải được nhận xét"))
      .finally(() => setNotesLoading(false));
  }, [tab, mode, periodKey]);

  const saveNote = async (sectionId: string) => {
    setSavingNote(sectionId);
    try {
      const res = await fetch("/api/narratives", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId, periodType: mode, periodKey, content: noteDrafts[sectionId] || "" }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success("Đã lưu nhận xét");
        setSections((prev) =>
          prev.map((s) =>
            s.id === sectionId ? { ...s, content: noteDrafts[sectionId] || "", updatedAt: new Date().toISOString(), updatedByName: "Bạn" } : s
          )
        );
      } else {
        toast.error(json.error || "Không lưu được nhận xét");
      }
    } catch {
      toast.error("Lỗi kết nối khi lưu nhận xét");
    } finally {
      setSavingNote(null);
    }
  };

  const selectedCol: "week" | "month" | "quarter" | "year" =
    mode === "WEEK" ? "week" : mode === "MONTH" ? "month" : mode === "QUARTER" ? "quarter" : "year";

  const colLabel = (col: "week" | "month" | "quarter" | "year") => {
    if (!data) return "";
    if (col === "week") return `Tuần ${data.range.week.weekNumber}`;
    if (col === "month") return `Tháng ${data.range.month.month}`;
    if (col === "quarter") return `Quý ${data.range.quarter.quarter}`;
    return `Năm ${data.range.year.year}`;
  };

  const cols = ["week", "month", "quarter", "year"] as const;

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-low">
      {/* Header */}
      <div className="px-margin pt-space-md pb-space-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-headline-sm text-headline-sm text-primary font-bold">Số liệu giao ban</h1>
            <p className="text-body-sm text-on-surface-variant">
              Nhập số liệu theo ngày — hệ thống tự cộng lũy kế tuần/tháng/quý/năm theo cấu hình.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/giao-ban/nhap"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-on-primary text-label-md font-semibold hover:opacity-90"
            >
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              Nhập số liệu
            </Link>
            {showAdminMenu && (
              <Link
                href="/giao-ban/cau-hinh"
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-default text-primary text-label-md font-semibold hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[18px]">tune</span>
                Cấu hình
              </Link>
            )}
          </div>
        </div>

        {/* Tabs + kỳ */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border-default overflow-hidden">
            {(["DATA", "NOTES"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-label-md font-semibold ${tab === t ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"}`}
              >
                {t === "DATA" ? "Số liệu" : "Nhận xét"}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-border-default overflow-hidden ml-auto">
            {MODE_TABS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                className={`px-3 py-2 text-label-md font-semibold ${mode === m.key ? "bg-secondary text-on-secondary" : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container"}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-2 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
          >
            {[year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i).sort().map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>
          {mode === "WEEK" && (
            <input
              type="number"
              min={1}
              max={53}
              value={week}
              onChange={(e) => setWeek(Math.max(1, Math.min(53, Number(e.target.value) || 1)))}
              className="w-24 px-2 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
              title="Số tuần (ISO)"
            />
          )}
          {mode === "MONTH" && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-2 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  Tháng {m}
                </option>
              ))}
            </select>
          )}
          {mode === "QUARTER" && (
            <select
              value={quarter}
              onChange={(e) => setQuarter(Number(e.target.value))}
              className="px-2 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q}>
                  Quý {q}
                </option>
              ))}
            </select>
          )}
        </div>
        {data && (
          <div className="text-body-xs text-on-surface-variant">
            {data.range.week.label} · {data.range.month.label} · {data.range.quarter.label} · {data.range.year.label}
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-margin pb-space-lg flex flex-col gap-4">
        {tab === "DATA" && (
          <>
            {loading && <div className="text-body-sm text-on-surface-variant py-8 text-center">Đang tải số liệu…</div>}
            {!loading && data && data.groups.length === 0 && (
              <div className="text-body-sm text-on-surface-variant py-8 text-center">
                Chưa có chỉ tiêu nào được bật. {showAdminMenu ? "Vào Cấu hình để thiết lập." : "Liên hệ lãnh đạo để thiết lập."}
              </div>
            )}
            {!loading && data && <DataQualityBanner q={data.dataQuality} />}
            {!loading &&
              data?.groups.map((g) => (
                <div key={g.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden">
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [g.id]: !(p[g.id] ?? true) }))}
                    className="w-full px-4 py-3 bg-surface-container-low border-b border-border-default/40 flex items-center justify-between"
                  >
                    <span className="font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide text-left">{g.name}</span>
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                      {(expanded[g.id] ?? true) ? "expand_less" : "expand_more"}
                    </span>
                  </button>
                  {(expanded[g.id] ?? true) && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-body-sm min-w-[720px]">
                        <thead>
                          <tr className="text-left text-body-xs text-on-surface-variant border-b border-border-default/40">
                            <th className="px-3 py-2 font-semibold">Chỉ tiêu</th>
                            {cols.map((c) => (
                              <th key={c} className={`px-2 py-2 font-semibold text-right ${selectedCol === c ? "bg-secondary/10 text-secondary" : ""}`}>
                                {colLabel(c)}
                              </th>
                            ))}
                            <th className="px-2 py-2 font-semibold text-center">% chỉ tiêu giao</th>
                            <th className="px-2 py-2 font-semibold">Cập nhật</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.metrics.map((m) => (
                            <React.Fragment key={m.id}>
                              <tr className="border-b border-border-default/20 align-top">
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-on-surface">{m.name}</span>
                                    {m.valueKind === "BALANCE" && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-sky-200 bg-sky-50 text-sky-700 font-semibold">SỐ DƯ</span>
                                    )}
                                    {m.valueKind === "DERIVED" && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-violet-200 bg-violet-50 text-violet-700 font-semibold">TỰ TÍNH</span>
                                    )}
                                    {m.requireConfirm && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 font-semibold" title="Chỉ tiêu bật quy trình: Nháp → Gửi kiểm tra → Xác nhận">
                                        KIỂM TRA
                                      </span>
                                    )}
                                  </div>
                                  {m.note && <div className="text-body-xs text-on-surface-variant mt-0.5">{m.note}</div>}
                                </td>
                                {cols.map((c) => (
                                  <td key={c} className={`px-2 py-2 text-right tabular-nums ${selectedCol === c ? "bg-secondary/10 font-semibold" : ""}`}>
                                    {fmtMetric(m.cols[c], m)}
                                  </td>
                                ))}
                                <td className="px-2 py-2 text-center">
                                  {m.targets.length === 0 ? (
                                    <span className="text-on-surface-variant">—</span>
                                  ) : (
                                    <div className="flex items-center justify-center gap-1 flex-wrap">
                                      {m.targets.map((t, i) => {
                                        // YC-26: chỉ tiêu gắn nhãn [DEMO... là chỉ tiêu MÔ PHỎNG —
                                        // không hiển thị như chỉ tiêu chính thức (không khoe tỷ lệ đạt).
                                        if (/^\s*\[DEMO/i.test(t.label)) {
                                          const cleanLabel = t.label.replace(/^\s*\[DEMO[^\]]*\]\s*/i, "");
                                          return (
                                            <span
                                              key={i}
                                              data-testid={`target-demo-${m.code}`}
                                              title={`${t.label}: ${fmtMetric(t.targetValue, m)}${
                                                t.percent === null ? "" : ` — tỷ lệ tạm tính ${t.percent}%`
                                              } · Chỉ tiêu MÔ PHỎNG dùng thử (DEMO), chưa phải chỉ tiêu chính thức được duyệt`}
                                              className="text-[11px] px-1.5 py-0.5 rounded border border-dashed border-slate-300 bg-slate-50 text-slate-500 font-semibold"
                                            >
                                              Demo{cleanLabel ? ` · ${cleanLabel}` : ""}
                                            </span>
                                          );
                                        }
                                        const pending = t.percent === null && (t.status === "PROPOSED" || !t.status);
                                        return (
                                          <span
                                            key={i}
                                            title={`${t.label}: ${fmtMetric(t.targetValue, m)}${
                                              t.percent === null
                                                ? pending
                                                  ? " — chưa xác nhận nên chưa công bố tỷ lệ"
                                                  : " — chưa xác định tỷ lệ (thiếu dữ liệu hoặc mẫu số 0)"
                                                : ` — ${t.percent}%`
                                            }`}
                                            className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${
                                              t.percent === null
                                                ? "border-border-default text-on-surface-variant"
                                                : t.percent >= 100
                                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                  : "border-amber-200 bg-amber-50 text-amber-700"
                                            }`}
                                          >
                                            {t.label.replace(/^Chỉ tiêu\s*/i, "").replace(/^KH\s*/i, "KH ")}{" "}
                                            {t.percent === null ? (pending ? "chờ xác nhận" : "—") : `${t.percent}%`}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex flex-col gap-1 items-start">
                                    {m.latest ? (
                                      <span className="text-body-xs text-on-surface-variant">
                                        {fmtDate(m.latest.date)}
                                        {m.latest.byName ? ` · ${m.latest.byName}` : ""}
                                      </span>
                                    ) : (
                                      <span className="text-body-xs text-on-surface-variant italic">Chưa có số liệu</span>
                                    )}
                                    {m.latest && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${STATUS_STYLES[m.latest.status] || "border-border-default"}`}>
                                        {STATUS_LABELS[m.latest.status] || m.latest.status}
                                      </span>
                                    )}
                                    {m.missingDates.length > 0 && (
                                      <span
                                        className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 font-semibold"
                                        title={`Chưa nhập: ${m.missingDates.map((d) => fmtDate(d)).join(", ")}`}
                                      >
                                        Thiếu {m.missingDates.length} ngày
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              {m.classCols.map((cc) => (
                                <tr key={m.id + cc.classificationId} className="border-b border-border-default/20 bg-surface-container-lowest/60">
                                  <td className="px-3 py-1.5 pl-8 text-on-surface-variant">↳ {cc.label}</td>
                                  {cols.map((c) => (
                                    <td key={c} className={`px-2 py-1.5 text-right tabular-nums text-on-surface-variant ${selectedCol === c ? "bg-secondary/5" : ""}`}>
                                      {fmtMetric(cc.cols[c], m, { withUnit: false })}
                                    </td>
                                  ))}
                                  <td className="px-2 py-1.5" />
                                  <td className="px-2 py-1.5 text-body-xs text-on-surface-variant">{cc.latestDate ? fmtDate(cc.latestDate) : ""}</td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            {!loading && (
              <RevenueComparisonSection comparison={comparison} showConfigureLink={showAdminMenu} />
            )}
            <p className="text-body-xs text-on-surface-variant">
              Số liệu được cộng tự động từ các bản ghi nhập theo ngày. Cột lũy kế áp dụng "mốc đã xác nhận" (nếu có) để tránh cộng
              trùng. Đơn vị hiển thị theo cấu hình từng chỉ tiêu.
            </p>
          </>
        )}

        {tab === "NOTES" && (
          <div className="flex flex-col gap-4">
            <p className="text-body-sm text-on-surface-variant">
              Nội dung nhận xét cho {modeLabel(mode).toLowerCase()}: <span className="font-semibold text-primary">{periodKey}</span>
            </p>
            {notesLoading && <div className="text-body-sm text-on-surface-variant py-8 text-center">Đang tải…</div>}
            {!notesLoading &&
              sections.map((s) => (
                <div key={s.id} className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-label-md text-label-md text-primary font-bold">{s.title}</span>
                    <span className="text-body-xs text-on-surface-variant">
                      {s.updatedAt ? `Cập nhật ${fmtDate(s.updatedAt.slice(0, 10))}${s.updatedByName ? ` · ${s.updatedByName}` : ""}` : "Chưa có nội dung"}
                    </span>
                  </div>
                  <textarea
                    value={noteDrafts[s.id] ?? ""}
                    onChange={(e) => setNoteDrafts((p) => ({ ...p, [s.id]: e.target.value }))}
                    disabled={!s.canEdit || savingNote === s.id}
                    rows={4}
                    placeholder={s.canEdit ? "Nhập nhận xét/đánh giá cho kỳ này…" : "Bạn không được phân công nhập mục này"}
                    className="w-full px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm focus:outline-none focus:border-primary disabled:bg-surface-container disabled:text-on-surface-variant"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={() => saveNote(s.id)}
                      disabled={!s.canEdit || savingNote === s.id}
                      className="px-4 py-1.5 rounded-lg bg-primary text-on-primary text-label-sm font-semibold hover:opacity-90 disabled:opacity-40"
                    >
                      {savingNote === s.id ? "Đang lưu…" : "Lưu nhận xét"}
                    </button>
                  </div>
                </div>
              ))}
            {!notesLoading && sections.length === 0 && (
              <div className="text-body-sm text-on-surface-variant py-8 text-center">
                Chưa có mục nhận xét nào. {showAdminMenu ? "Vào Cấu hình → Mục nhận xét để tạo." : ""}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

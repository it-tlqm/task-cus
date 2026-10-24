"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/ui/Toast";
import { getIsoWeekFromDate, getVnDateParts } from "@/lib/period-helper";
import BackButton from "@/components/ui/BackButton";

type Mode = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

interface ReportColumn {
  key: string;
  label: string;
}
interface ReportRow {
  name: string;
  level: number;
  values: string[];
  target: string;
  percent: string;
  note: string;
}
interface ReportBlock {
  id: string;
  code: string;
  kind: "HEADING" | "METRIC_GROUP" | "NARRATIVE";
  title: string;
  groupCode: string | null;
  columns: ReportColumn[];
  rows: ReportRow[];
  content: string | null;
}
interface ReportMeta {
  periodType: Mode;
  periodKey: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  title: string;
  subtitle: string;
  meetingStart: string;
  meetingEnd: string;
}
interface VersionRow {
  id: string;
  versionNo: number;
  title: string;
  subtitle: string | null;
  meetingStart: string | null;
  meetingEnd: string | null;
  createdAt: string;
  createdByName: string | null;
}
interface ReportData {
  meta: ReportMeta;
  blocks: ReportBlock[];
  versions: VersionRow[];
  canManage: boolean;
}

const MODE_TABS: { key: Mode; label: string }[] = [
  { key: "WEEK", label: "Tuần" },
  { key: "MONTH", label: "Tháng" },
  { key: "QUARTER", label: "Quý" },
  { key: "YEAR", label: "Năm" },
];

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", { hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function GiaoBanBaoCaoPage() {
  const now = new Date();
  const vn = getVnDateParts(now);
  const iso = getIsoWeekFromDate(now);

  const [mode, setMode] = useState<Mode>("WEEK");
  const [year, setYear] = useState(iso.year);
  const [week, setWeek] = useState(iso.weekNumber);
  const [month, setMonth] = useState(vn.month);
  const [quarter, setQuarter] = useState(Math.ceil(vn.month / 3));

  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaDraft, setMetaDraft] = useState({ title: "", subtitle: "", meetingStart: "", meetingEnd: "" });
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const baseQuery = useMemo(
    () => ({ periodType: mode, year: String(year), week: String(week), month: String(month), quarter: String(quarter) }),
    [mode, year, week, month, quarter]
  );

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams(baseQuery);
    fetch(`/api/metrics/report?${qs.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success) {
          setData({ meta: json.meta, blocks: json.blocks, versions: json.versions, canManage: json.canManage });
          setMetaDraft({
            title: json.meta.title || "",
            subtitle: json.meta.subtitle || "",
            meetingStart: json.meta.meetingStart || "",
            meetingEnd: json.meta.meetingEnd || "",
          });
        } else {
          setData(null);
        }
      })
      .catch(() => toast.error("Không tải được báo cáo"))
      .finally(() => setLoading(false));
  }, [baseQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const downloadDocx = async (downloadParam: string, fallbackName: string) => {
    setDownloading(downloadParam);
    try {
      const qs = new URLSearchParams({ ...baseQuery, download: downloadParam });
      const res = await fetch(`/api/metrics/report?${qs.toString()}`);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error || "Không tải được file Word");
        return;
      }
      const blob = await res.blob();
      let name = fallbackName;
      const cd = res.headers.get("content-disposition") || "";
      const m = cd.match(/filename\*=UTF-8''([^;]+)/i);
      if (m) {
        try {
          name = decodeURIComponent(m[1]);
        } catch {
          /* giữ tên mặc định */
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã tạo file Word (.docx)");
    } catch {
      toast.error("Lỗi kết nối khi tải file Word");
    } finally {
      setDownloading(null);
    }
  };

  const saveVersion = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const res = await fetch("/api/metrics/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodType: mode,
          year,
          week,
          month,
          quarter,
          title: metaDraft.title,
          subtitle: metaDraft.subtitle,
          meetingStart: metaDraft.meetingStart,
          meetingEnd: metaDraft.meetingEnd,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Đã lưu phiên bản v${json.version.versionNo} — số liệu được chụp lại tại thời điểm lưu`);
        load();
      } else {
        toast.error(json.error || "Không lưu được phiên bản");
      }
    } catch {
      toast.error("Lỗi kết nối khi lưu phiên bản");
    } finally {
      setSaving(false);
    }
  };

  const deleteVersion = async (v: VersionRow) => {
    if (!window.confirm(`Xóa phiên bản v${v.versionNo} của ${data?.meta.periodLabel}? Thao tác không khôi phục được.`)) return;
    try {
      const res = await fetch(`/api/metrics/report?versionId=${encodeURIComponent(v.id)}`, { method: "DELETE" });
      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`Đã xóa phiên bản v${v.versionNo}`);
        setData((prev) => (prev ? { ...prev, versions: prev.versions.filter((x) => x.id !== v.id) } : prev));
      } else {
        toast.error(json.error || "Không xóa được phiên bản");
      }
    } catch {
      toast.error("Lỗi kết nối khi xóa phiên bản");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-low">
      {/* Header */}
      <div className="px-margin pt-space-md pb-space-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-headline-sm text-headline-sm text-primary font-bold">Báo cáo giao ban</h1>
            <p className="text-body-sm text-on-surface-variant">
              Xem trước báo cáo tổng hợp theo kỳ, xuất file Word theo mẫu và lưu phiên bản — bản đã lưu là ảnh chụp,
              số liệu sửa sau không làm thay đổi bản đã xuất.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <BackButton href="/giao-ban" label="Tổng hợp giao ban" />
            <Link
              href="/giao-ban/nhap"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border-default text-primary text-label-md font-semibold hover:bg-surface-container"
            >
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              Nhập số liệu
            </Link>
          </div>
        </div>

        {/* Kỳ */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-lg border border-border-default overflow-hidden">
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
            {[year - 1, year, year + 1]
              .filter((v, i, a) => a.indexOf(v) === i)
              .sort()
              .map((y) => (
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
          {data && <span className="text-body-xs text-on-surface-variant">{data.meta.periodLabel} ({data.meta.startDate} – {data.meta.endDate})</span>}
        </div>
      </div>

      <div className="px-margin pb-space-lg flex flex-col gap-4">
        {loading && <div className="text-body-sm text-on-surface-variant py-8 text-center">Đang tổng hợp báo cáo…</div>}

        {!loading && data && (
          <>
            {/* Tiêu đề & thời gian họp + nút thao tác */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 p-4 flex flex-col gap-3">
              <div className="text-label-md font-semibold text-primary">Tiêu đề & thời gian họp (dùng khi lưu bản và xuất Word)</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-body-xs text-on-surface-variant">Tiêu đề báo cáo</span>
                  <input
                    value={metaDraft.title}
                    onChange={(e) => setMetaDraft((p) => ({ ...p, title: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
                    placeholder="TỔNG HỢP SỐ LIỆU GIAO BAN"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-xs text-on-surface-variant">Phụ đề (kỳ)</span>
                  <input
                    value={metaDraft.subtitle}
                    onChange={(e) => setMetaDraft((p) => ({ ...p, subtitle: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-xs text-on-surface-variant">Bắt đầu họp (VD: 14 giờ 00 ngày 19/10/2026)</span>
                  <input
                    value={metaDraft.meetingStart}
                    onChange={(e) => setMetaDraft((p) => ({ ...p, meetingStart: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-xs text-on-surface-variant">Kết thúc họp</span>
                  <input
                    value={metaDraft.meetingEnd}
                    onChange={(e) => setMetaDraft((p) => ({ ...p, meetingEnd: e.target.value }))}
                    className="px-3 py-2 rounded-lg border border-border-default bg-surface-container-lowest text-body-sm"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => downloadDocx("current", `Bao-cao-giao-ban-${data.meta.periodKey}.docx`)}
                  disabled={downloading !== null}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-on-primary text-label-md font-semibold hover:opacity-90 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">download</span>
                  {downloading === "current" ? "Đang tạo file…" : "Tải Word (bản hiện tại)"}
                </button>
                {data.canManage && (
                  <button
                    onClick={saveVersion}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary text-primary text-label-md font-semibold hover:bg-primary/5 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">bookmark_add</span>
                    {saving ? "Đang lưu…" : "Lưu phiên bản"}
                  </button>
                )}
                <span className="text-body-xs text-on-surface-variant">
                  Trong bảng: dấu “…” là chưa nhập số liệu (không hiển thị 0 giả).
                </span>
              </div>
            </div>

            {/* Xem trước */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 p-5 flex flex-col gap-2">
              <div className="text-center">
                <div className="font-bold text-primary uppercase text-headline-sm">{metaDraft.title || data.meta.title}</div>
                <div className="text-body-sm text-on-surface-variant">{(metaDraft.subtitle || data.meta.subtitle) + ` (${data.meta.periodLabel})`}</div>
              </div>
              <div className="mt-2 text-body-sm">
                <div className="font-semibold">THỜI GIAN HỌP GIAO BAN</div>
                <div>Bắt đầu: {metaDraft.meetingStart || "……………………………………"}</div>
                <div>Kết thúc: {metaDraft.meetingEnd || "……………………………………"}</div>
              </div>

              {data.blocks.map((b) => (
                <div key={b.id} className="mt-3">
                  {b.title && <div className="font-bold text-on-surface uppercase text-body-md">{b.title}</div>}
                  {b.kind === "METRIC_GROUP" && (
                    <div className="overflow-x-auto mt-2">
                      <table className="w-full text-body-sm min-w-[720px] border-collapse">
                        <thead>
                          <tr className="bg-surface-container-low text-body-xs text-on-surface-variant border-b border-border-default/40">
                            <th className="px-3 py-2 font-semibold text-left">Chỉ tiêu</th>
                            {b.columns.map((c) => (
                              <th key={c.key} className="px-2 py-2 font-semibold text-right">
                                {c.label}
                              </th>
                            ))}
                            <th className="px-2 py-2 font-semibold text-left">Chỉ tiêu giao</th>
                            <th className="px-2 py-2 font-semibold text-center">Tỷ lệ %</th>
                            <th className="px-2 py-2 font-semibold text-left">Ghi chú</th>
                          </tr>
                        </thead>
                        <tbody>
                          {b.rows.length === 0 && (
                            <tr>
                              <td colSpan={b.columns.length + 4} className="px-3 py-3 text-on-surface-variant italic">
                                Chưa có chỉ tiêu trong nhóm này.
                              </td>
                            </tr>
                          )}
                          {b.rows.map((r, idx) => (
                            <tr key={idx} className="border-b border-border-default/20">
                              <td className={`px-3 py-2 ${r.level > 0 ? "pl-7 text-on-surface-variant" : "font-medium text-on-surface"}`}>
                                {r.level > 0 ? `– ${r.name}` : r.name}
                              </td>
                              {r.values.map((v, i) => (
                                <td key={i} className="px-2 py-2 text-right tabular-nums">
                                  {v}
                                </td>
                              ))}
                              <td className="px-2 py-2">{r.target}</td>
                              <td className="px-2 py-2 text-center tabular-nums">{r.percent}</td>
                              <td className="px-2 py-2 text-body-xs text-on-surface-variant">{r.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {b.kind === "NARRATIVE" &&
                    (b.content && b.content.trim() ? (
                      <div className="text-body-sm text-on-surface whitespace-pre-line mt-1">{b.content}</div>
                    ) : (
                      <div className="text-body-sm text-on-surface-variant italic mt-1">
                        Chưa có nội dung — nhập tại mục “Nhận xét” của trang Số liệu giao ban.
                      </div>
                    ))}
                </div>
              ))}
            </div>

            {/* Phiên bản đã lưu */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-border-default/50 overflow-hidden">
              <div className="px-4 py-3 bg-surface-container-low border-b border-border-default/40 font-label-lg text-label-lg text-primary font-bold uppercase tracking-wide">
                Phiên bản đã lưu ({data.versions.length})
              </div>
              {data.versions.length === 0 ? (
                <div className="px-4 py-4 text-body-sm text-on-surface-variant">
                  Chưa có phiên bản nào cho {data.meta.periodLabel}.
                  {data.canManage ? " Bấm “Lưu phiên bản” để chốt bản hiện tại." : ""}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-body-sm min-w-[680px]">
                    <thead>
                      <tr className="text-left text-body-xs text-on-surface-variant border-b border-border-default/40">
                        <th className="px-3 py-2 font-semibold">Phiên bản</th>
                        <th className="px-3 py-2 font-semibold">Lưu lúc</th>
                        <th className="px-3 py-2 font-semibold">Người lưu</th>
                        <th className="px-3 py-2 font-semibold">Thời gian họp</th>
                        <th className="px-3 py-2 font-semibold text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.versions.map((v) => (
                        <tr key={v.id} className="border-b border-border-default/20">
                          <td className="px-3 py-2 font-semibold text-primary">v{v.versionNo}</td>
                          <td className="px-3 py-2">{fmtDateTime(v.createdAt)}</td>
                          <td className="px-3 py-2">{v.createdByName || "—"}</td>
                          <td className="px-3 py-2 text-body-xs text-on-surface-variant">
                            {v.meetingStart || v.meetingEnd ? `${v.meetingStart || "…"} → ${v.meetingEnd || "…"}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => downloadDocx(v.id, `Bao-cao-giao-ban-${data.meta.periodKey}-v${v.versionNo}.docx`)}
                                disabled={downloading !== null}
                                className="px-2.5 py-1.5 rounded-lg border border-border-default text-primary text-body-xs font-semibold hover:bg-surface-container disabled:opacity-50"
                              >
                                {downloading === v.id ? "Đang tạo…" : "Tải Word"}
                              </button>
                              {data.canManage && (
                                <button
                                  onClick={() => deleteVersion(v)}
                                  className="px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 text-body-xs font-semibold hover:bg-rose-50"
                                >
                                  Xóa
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

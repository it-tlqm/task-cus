"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";
import { ENTRY_PERIOD_LABELS, type EntryPeriod } from "@/lib/metric-entry-period";
import {
  buildImportTemplateRows,
  parseImportRows,
  type ImportMetricOption,
  type ImportRow,
} from "@/lib/metric-excel-import";

export type ImportMetric = ImportMetricOption & { unitLabel: string };

export function MetricExcelImport({
  metrics,
  date,
  entryPeriod,
  periodLabel,
  onImported,
}: {
  metrics: ImportMetric[];
  date: string;
  entryPeriod: EntryPeriod;
  periodLabel: string;
  onImported: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFileName("");
      setRows([]);
      setErrors([]);
      setSkipped(0);
    }
  }, [open]);

  const editableCount = useMemo(() => metrics.filter((m) => m.canEnter).length, [metrics]);

  const downloadTemplate = async () => {
    try {
      const XLSX = await import("@e965/xlsx");
      const unitById = new Map(metrics.map((m) => [m.id, m.unitLabel]));
      const data = buildImportTemplateRows(metrics, (id) => unitById.get(id) || "");
      if (data.length === 0) {
        toast.error("Bạn chưa được phân công chỉ tiêu nào để nhập");
        return;
      }
      const sheet = XLSX.utils.json_to_sheet(data);
      sheet["!cols"] = [{ wch: 18 }, { wch: 38 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 28 }];
      const book = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(book, sheet, "SoLieu");
      XLSX.writeFile(book, `Mau-nhap-so-lieu-${date}.xlsx`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không tạo được file mẫu");
    }
  };

  const readFile = async (file: File) => {
    setFileName(file.name);
    setRows([]);
    setErrors([]);
    setSkipped(0);
    try {
      const XLSX = await import("@e965/xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) throw new Error("File Excel không có sheet dữ liệu");
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const parsed = parseImportRows(raw, metrics);
      setRows(parsed.rows);
      setErrors(parsed.errors);
      setSkipped(parsed.skipped);
      if (parsed.rows.length === 0 && parsed.errors.length === 0) {
        setErrors(["Không tìm thấy dòng số liệu nào. Kiểm tra lại tên cột và giá trị."]);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Không đọc được file Excel"]);
    }
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const entries = rows.map((row) => ({
        metricId: row.metricId,
        classificationId: row.classificationId,
        value: row.value,
        note: row.note || undefined,
        entryDate: date,
      }));
      let saved = 0;
      const failed: string[] = [];
      for (let i = 0; i < entries.length; i += 200) {
        const chunk = entries.slice(i, i + 200);
        const res = await fetch("/api/metrics/entries", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ entries: chunk, entryPeriod, periodDate: date }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          const detail =
            Array.isArray(json?.errors) && json.errors[0]?.message ? json.errors[0].message : json.error;
          failed.push(detail || `Lô ${Math.floor(i / 200) + 1} không lưu được`);
          continue;
        }
        saved += Number(json.saved) || chunk.length;
      }
      if (failed.length > 0) {
        setErrors(failed);
        toast.error(`Chỉ lưu được ${saved}/${entries.length} ô`);
      } else {
        toast.success(`Đã nhập ${saved} ô từ Excel · ${periodLabel}`);
        setOpen(false);
      }
      await onImported();
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Lỗi kết nối khi nhập Excel"]);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Nhập Excel
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Đóng"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={() => (importing ? undefined : setOpen(false))}
          />
          <Card
            role="dialog"
            aria-modal="true"
            aria-label="Nhập số liệu từ Excel"
            className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden p-0"
          >
            <div className="flex items-start justify-between gap-3 border-b border-v5-line px-4 py-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-v5-ink">
                  <FileSpreadsheet className="h-4 w-4 text-v5-accent" /> Nhập số liệu từ Excel
                </div>
                <div className="mt-0.5 text-[11px] text-v5-muted">
                  {periodLabel} · {ENTRY_PERIOD_LABELS[entryPeriod]} · lưu tại {date}
                </div>
              </div>
              <button
                type="button"
                onClick={() => (importing ? undefined : setOpen(false))}
                className="rounded p-1 text-v5-muted hover:bg-v5-bg"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              <div className="rounded-lg border border-v5-line bg-v5-bg p-3 text-[11px] text-v5-muted">
                <div className="font-semibold text-v5-ink">Cách làm</div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  <li>Tải file mẫu — file đã có sẵn mã chỉ tiêu và phân loại bạn được nhập.</li>
                  <li>Điền cột <strong>Giá trị</strong> theo đúng đơn vị hiển thị (đồng, USD, xe…).</li>
                  <li>Chọn file và kiểm tra trước khi ghi vào hệ thống.</li>
                </ol>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={editableCount === 0}>
                  <Download className="h-3.5 w-3.5" /> Tải file mẫu
                </Button>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-v5-line bg-v5-surface px-3 py-1.5 text-[11px] font-semibold text-v5-ink hover:bg-v5-bg">
                  <Upload className="h-3.5 w-3.5" /> Chọn file .xlsx
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void readFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {fileName && <span className="truncate text-[11px] text-v5-muted">{fileName}</span>}
              </div>

              {errors.length > 0 && (
                <div className="rounded-lg border border-status-danger/30 bg-status-danger-bg p-3 text-[11px] text-status-danger">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" /> {errors.length} dòng cần kiểm tra
                  </div>
                  <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-4">
                    {errors.slice(0, 30).map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-v5-line">
                  <div className="flex items-center justify-between bg-v5-bg px-3 py-2 text-[11px]">
                    <span className="flex items-center gap-1.5 font-semibold text-v5-ink">
                      <CheckCircle2 className="h-3.5 w-3.5 text-v5-success" /> Hợp lệ {rows.length} ô
                    </span>
                    {skipped > 0 && <Badge variant="outline">Bỏ trống {skipped} dòng</Badge>}
                  </div>
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-v5-surface text-v5-muted">
                        <tr>
                          <th className="px-3 py-1.5 font-semibold">Mã</th>
                          <th className="px-3 py-1.5 font-semibold">Chỉ tiêu</th>
                          <th className="px-3 py-1.5 font-semibold">Phân loại</th>
                          <th className="px-3 py-1.5 text-right font-semibold">Giá trị</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-v5-line">
                        {rows.slice(0, 50).map((row) => (
                          <tr key={`${row.metricId}|${row.classificationId}`}>
                            <td className="whitespace-nowrap px-3 py-1.5 font-mono text-v5-ink">{row.code}</td>
                            <td className="px-3 py-1.5 text-v5-ink">{row.metricName}</td>
                            <td className="px-3 py-1.5 text-v5-muted">{row.classLabel || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-v5-ink">
                              {Number(row.value).toLocaleString("vi-VN", { maximumFractionDigits: 6 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-v5-line bg-v5-surface px-4 py-3">
              <span className="text-[10px] text-v5-muted">Chỉ ghi các ô có giá trị; ô trống được giữ nguyên.</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={importing}>
                  Hủy
                </Button>
                <Button size="sm" onClick={submit} disabled={importing || rows.length === 0}>
                  <Upload className="h-3.5 w-3.5" /> {importing ? "Đang nhập…" : `Nhập ${rows.length} ô`}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

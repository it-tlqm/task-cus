"use client";

/**
 * EvidenceAdjustmentsPanel — V3.0.3 (R3-C): quy trình điều chỉnh minh chứng sau nghiệm thu.
 *
 * Chế độ cán bộ: lập đề nghị (chỉ khi công việc đã được xác nhận) + xem trạng thái đề nghị.
 * Chế độ lãnh đạo: xem xét (bước 2) hoặc phê duyệt cuối (bước 3) các đề nghị đang chờ mình.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";

const STATE_LABEL: Record<string, string> = {
  PROPOSED: "Chờ lãnh đạo trực tiếp xem xét",
  LEADER_REVIEWED: "Chờ Trưởng bộ phận phê duyệt",
  APPROVED: "Đã phê duyệt — đã thực hiện điều chỉnh",
  REJECTED: "Đã từ chối",
};

export default function EvidenceAdjustmentsPanel({
  mode,
  workItemId,
  canPropose,
  onChanged,
}: {
  mode: "staff" | "leader";
  workItemId?: string;
  canPropose?: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("ADD");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url =
        mode === "leader"
          ? "/api/evidence-adjustments"
          : `/api/evidence-adjustments?workItemId=${workItemId}`;
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setRows(json.data || []);
    } catch {
      /* im lặng */
    } finally {
      setLoading(false);
    }
  }, [mode, workItemId]);

  useEffect(() => {
    load();
  }, [load]);

  const propose = async () => {
    if (!workItemId) return;
    if (reason.trim().length < 5) {
      toast.error("Vui lòng nêu rõ lý do đề nghị điều chỉnh.");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("workItemId", workItemId);
      fd.set("kind", kind);
      fd.set("reason", reason);
      fd.set("description", description);
      if (file) fd.set("file", file);
      const res = await fetch("/api/evidence-adjustments", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không tạo được đề nghị.");
        return;
      }
      toast.success("Đã gửi đề nghị điều chỉnh. Hồ sơ vẫn được khoá cho tới khi có phê duyệt.");
      setReason("");
      setDescription("");
      setFile(null);
      setOpen(false);
      await load();
      await onChanged?.();
    } catch {
      toast.error("Không tạo được đề nghị.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (row: any, action: "ENDORSE" | "APPROVE" | "REJECT") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/evidence-adjustments/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || "Không xử lý được đề nghị.");
        return;
      }
      toast.success(action === "APPROVE" ? "Đã phê duyệt và thực hiện điều chỉnh." : "Đã xử lý đề nghị.");
      await load();
      await onChanged?.();
    } catch {
      toast.error("Không xử lý được đề nghị.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid={`adj-panel-${mode}`} className="rounded-lg border border-border-subtle bg-surface-container-lowest p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-on-surface">
          {mode === "leader" ? "Đề nghị điều chỉnh minh chứng (chờ bạn xử lý)" : "Đề nghị điều chỉnh minh chứng"}
        </p>
        {mode === "staff" && canPropose && (
          <button
            type="button"
            data-testid={`adj-open-${workItemId}`}
            onClick={() => setOpen((v) => !v)}
            className="text-[11px] font-semibold text-status-primary hover:underline"
          >
            {open ? "Đóng" : "Lập đề nghị"}
          </button>
        )}
      </div>

      {mode === "staff" && open && (
        <div className="mt-2 space-y-2">
          <select
            data-testid={`adj-kind-${workItemId}`}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-2 py-1.5 text-xs"
          >
            <option value="ADD">Bổ sung minh chứng</option>
            <option value="REPLACE">Thay thế minh chứng</option>
            <option value="REMOVE">Rút minh chứng</option>
          </select>
          <input
            data-testid={`adj-reason-${workItemId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Lý do đề nghị điều chỉnh (bắt buộc)"
            className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-2 py-1.5 text-xs"
          />
          <input
            data-testid={`adj-desc-${workItemId}`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Nội dung đề xuất (không bắt buộc)"
            className="w-full rounded-lg border border-border-default bg-surface-container-lowest px-2 py-1.5 text-xs"
          />
          {kind !== "REMOVE" && (
            <input
              data-testid={`adj-file-${workItemId}`}
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-[11px]"
            />
          )}
          <button
            type="button"
            data-testid={`adj-submit-${workItemId}`}
            disabled={busy}
            onClick={propose}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-status-primary bg-status-primary text-on-primary disabled:opacity-50"
          >
            Gửi đề nghị
          </button>
          <p className="text-[10px] text-on-surface-variant">
            Đề nghị không tự mở khóa hồ sơ. Cần lãnh đạo trực tiếp xem xét và Trưởng bộ phận phê duyệt.
          </p>
        </div>
      )}

      <div className="mt-2 space-y-1.5">
        {loading && <p className="text-[11px] text-on-surface-variant">Đang tải…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-[11px] text-on-surface-variant">Không có đề nghị nào.</p>
        )}
        {rows.map((r) => (
          <div key={r.id} data-testid={`adj-row-${r.id}`} className="rounded-lg border border-border-subtle p-2">
            <p className="text-[11px] font-semibold text-on-surface">
              {r.kind === "ADD" ? "Bổ sung" : r.kind === "REPLACE" ? "Thay thế" : "Rút"} minh chứng
              {r.workItem?.title ? ` — ${r.workItem.title}` : ""}
            </p>
            <p className="text-[10px] text-on-surface-variant">
              Lý do: {r.reason} · {STATE_LABEL[r.state] || r.state}
            </p>
            {mode === "leader" && r.myStep && (
              <div className="flex gap-2 mt-1.5">
                <button
                  type="button"
                  data-testid={`adj-${r.myStep === "ENDORSE" ? "endorse" : "approve"}-${r.id}`}
                  disabled={busy}
                  onClick={() => act(r, r.myStep)}
                  className="px-2 py-1 rounded text-[11px] font-semibold border border-status-primary text-status-primary hover:bg-status-warning-bg disabled:opacity-50"
                >
                  {r.myStepLabel}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

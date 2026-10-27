"use client";

import { V5Icon } from "@/components/v5/ui/icon";

import React, { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/Toast";

/**
 * YC-35 — Quản lý QUAN HỆ PHỤ TRÁCH theo kỳ.
 *
 * Dùng để Hải quan/đơn vị xác nhận: ai phụ trách cho ai, từ ngày nào đến ngày nào.
 * Hệ thống KHÔNG tự suy diễn quan hệ từ role kỹ thuật — chỉ ghi khi được xác nhận ở đây.
 * Quan hệ dùng để tính điểm bình quân cho lãnh đạo (YC-35) và xuất biểu 01B/02B (YC-34).
 */
export default function SupervisionsAdminPage() {
  const [people, setPeople] = useState<Array<{ id: string; fullName: string; code: string }>>([]);
  const [managerId, setManagerId] = useState("");
  const [subordinateId, setSubordinateId] = useState("");
  const [scopeType, setScopeType] = useState("UNIT");
  const [scopeNote, setScopeNote] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/supervisions", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        const asManager = json.data?.asManager || [];
        setRows(asManager);
      }
    } catch (e: any) {
      toast.error(e.message || "Lỗi khi tải quan hệ phụ trách");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    fetch("/api/people?pageSize=200")
      .then((r) => r.json())
      .then((j) => {
        const list = Array.isArray(j) ? j : j.data || [];
        setPeople(
          list
            .map((p: any) => ({ id: p.id, fullName: p.fullName, code: p.code }))
            .filter((p: any) => p.id && p.fullName)
        );
      })
      .catch(() => undefined);
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managerId || !subordinateId) {
      toast.error("Chọn người phụ trách và cán bộ được phụ trách");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/supervisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          managerPersonId: managerId,
          subordinatePersonId: subordinateId,
          scopeType,
          scopeNote: scopeNote || null,
          effectiveFrom: effectiveFrom || undefined,
          effectiveTo: effectiveTo || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không lưu được quan hệ phụ trách");
        return;
      }
      toast.success(json.message || "Đã lưu quan hệ phụ trách");
      setSubordinateId("");
      setScopeNote("");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu quan hệ phụ trách");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      const res = await fetch(`/api/supervisions?id=${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(json?.error || "Không gỡ được quan hệ");
        return;
      }
      toast.success("Đã gỡ quan hệ phụ trách");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi gỡ quan hệ phụ trách");
    }
  };

  const nameOf = (id: string) => people.find((p) => p.id === id)?.fullName || id;

  return (
    <div className="w-full min-h-screen bg-transparent pb-12">
      <div className="max-w-5xl mx-auto px-margin pt-5 space-y-4">
        <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-4">
          <h1 className="text-lg font-bold text-v5-ink flex items-center gap-2">
            <V5Icon name="account_tree" className="text-v5-gold-ink" />
            Quan hệ phụ trách theo kỳ
          </h1>
          <p className="text-xs text-v5-muted mt-1">
            Khai báo ai phụ trách cho ai. Hệ thống dùng dữ liệu này để tính điểm bình quân cho
            lãnh đạo (Đội trưởng = bình quân Đội phó; Đội phó = bình quân công chức phụ trách)
            và xuất biểu 01B/02B. Hệ thống KHÔNG tự suy diễn từ chức vụ.
          </p>
        </div>

        <form
          onSubmit={submit}
          data-testid="supervision-form"
          className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 gap-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-muted">Người phụ trách</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-v5-line text-xs bg-v5-surface"
            >
              <option value="">— Chọn —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-muted">Cán bộ được phụ trách</label>
            <select
              value={subordinateId}
              onChange={(e) => setSubordinateId(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-v5-line text-xs bg-v5-surface"
            >
              <option value="">— Chọn —</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.code})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-muted">Phạm vi phụ trách</label>
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-v5-line text-xs bg-v5-surface"
            >
              <option value="UNIT">Đơn vị công tác</option>
              <option value="WORK_AREA">Mảng công việc</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-muted">Ghi chú mảng công việc</label>
            <input
              value={scopeNote}
              onChange={(e) => setScopeNote(e.target.value)}
              placeholder="VD: Kiểm tra giám sát hải quan"
              className="px-2 py-1.5 rounded-lg border border-v5-line text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-muted">Hiệu lực từ</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-v5-line text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-muted">Hiệu lực đến (để trống = còn)</label>
            <input
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-v5-line text-xs"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-v5-gold text-white text-xs font-semibold disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Xác nhận quan hệ phụ trách"}
            </button>
          </div>
        </form>

        <div className="bg-v5-surface rounded-xl border border-v5-line shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-v5-line/60 flex items-center justify-between">
            <h2 className="text-sm font-bold text-v5-ink">Quan hệ đang có</h2>
            <button
              onClick={load}
              className="text-[11px] font-semibold text-v5-gold-ink"
              type="button"
            >
              Làm mới
            </button>
          </div>
          {loading ? (
            <div className="p-4 text-xs text-v5-muted">Đang tải...</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-xs text-v5-muted">
              Chưa có quan hệ phụ trách nào. Thêm ở biểu mẫu phía trên.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-v5-bg text-v5-muted">
                <tr>
                  <th className="text-left py-2 px-3">Người phụ trách</th>
                  <th className="text-left py-2 px-3">Cán bộ được phụ trách</th>
                  <th className="text-left py-2 px-3">Phạm vi</th>
                  <th className="text-left py-2 px-3">Hiệu lực</th>
                  <th className="text-left py-2 px-3">Trạng thái</th>
                  <th className="text-right py-2 px-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-v5-line/60">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 px-3">{nameOf(r.managerPersonId)}</td>
                    <td className="py-2 px-3">{nameOf(r.subordinatePersonId)}</td>
                    <td className="py-2 px-3">
                      {r.scopeType === "WORK_AREA" ? "Mảng công việc" : "Đơn vị"}
                      {r.scopeNote ? ` — ${r.scopeNote}` : ""}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px]">
                      {new Date(r.effectiveFrom).toLocaleDateString("vi-VN")}
                      {r.effectiveTo
                        ? ` → ${new Date(r.effectiveTo).toLocaleDateString("vi-VN")}`
                        : " → ..."}
                    </td>
                    <td className="py-2 px-3">
                      {r.status === "REVOKED" ? "Đã gỡ" : r.activeNow ? "Đang hiệu lực" : "Chưa hiệu lực"}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {r.status !== "REVOKED" && (
                        <button
                          onClick={() => revoke(r.id)}
                          className="text-[11px] font-semibold text-red-700"
                          type="button"
                        >
                          Gỡ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

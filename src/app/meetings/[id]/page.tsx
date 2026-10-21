"use client";

import React, { useState, useEffect, useCallback } from "react";
import { vnDateToDeadlineIso } from "@/lib/datetime";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import { CollaboratorPicker } from "@/components/tasks/CollaboratorPicker";

interface Conclusion {
  id: string;
  content: string;
  ownerId: string | null;
  ownerName: string | null;
  assigneeNames: string[];
  assigneeIds?: string[];
  deadline: string | null;
  priority: string;
  taskId: string | null;
  task: { id: string; code: string; title: string; status: string } | null;
}

interface MeetingDetail {
  id: string;
  title: string;
  meetingAt: string;
  chair: string | null;
  notes: string | null;
  conclusions: Conclusion[];
}

/** Chi tiết biên bản: thêm kết luận (tay hoặc AI tách), 1 chạm chuyển thành việc. */
export default function MeetingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { canApprove } = usePermissions();
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);

  const [cContent, setCContent] = useState("");
  const [cOwner, setCOwner] = useState("");
  const [cCollabs, setCCollabs] = useState<string[]>([]);
  const [cDeadline, setCDeadline] = useState("");
  const [adding, setAdding] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // AI tách biên bản thô
  const [aiEnabled, setAiEnabled] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [extracting, setExtracting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${id}`);
      const json = await res.json();
      if (res.ok) setMeeting(json.data);
      else toast.error(json.error || "Không thể tải biên bản");
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
    fetch("/api/people?pageSize=100")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const list = Array.isArray(json) ? json : json?.data || [];
        setPeople(list.map((p: any) => ({ id: p.id, fullName: p.fullName })));
      })
      .catch(() => {});
    fetch("/api/ai")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.enabled) setAiEnabled(true);
      })
      .catch(() => {});
  }, [fetchDetail]);

  const handleAdd = async (e: React.FormEvent, presetContent?: string) => {
    e?.preventDefault();
    const content = (presetContent ?? cContent).trim();
    if (!content || adding) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          ownerId: cOwner || undefined,
          assigneeIds: cCollabs,
          deadline: cDeadline ? vnDateToDeadlineIso(cDeadline) : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        if (!presetContent) {
          setCContent(""); setCOwner(""); setCCollabs([]); setCDeadline("");
          toast.success("Đã thêm kết luận!");
        }
        fetchDetail();
      } else {
        toast.error(json.error || "Không thể thêm kết luận");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleExtract = async () => {
    if (extracting || minutes.trim().length < 20) {
      if (minutes.trim().length < 20) toast.warning("Dán biên bản họp (vài dòng trở lên) rồi bấm tách");
      return;
    }
    setExtracting(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "extract", minutes }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json.data?.items)) {
        let n = 0;
        for (const item of json.data.items) {
          await handleAdd(undefined as any, item);
          n++;
        }
        setMinutes("");
        toast.success(`AI đã tách ${n} kết luận — kiểm tra và gán người, hạn trước khi chuyển việc!`);
      } else {
        toast.error(json.error || "AI bận, thử lại sau");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setExtracting(false);
    }
  };

  const handleConvert = async (cid: string) => {
    if (convertingId) return;
    setConvertingId(cid);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conclusionId: cid, action: "convert" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã chuyển thành nhiệm vụ!");
        fetchDetail();
      } else {
        toast.error(json.error || "Không thể chuyển");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setConvertingId(null);
    }
  };

  const handleDelete = async (cid: string) => {
    if (!confirm("Xóa kết luận này?")) return;
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conclusionId: cid, action: "delete" }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) { toast.success("Đã xóa."); fetchDetail(); }
      else toast.error(json.error || "Không thể xóa");
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    }
  };

  if (loading) return <div className="p-6 text-sm text-slate-500">Đang tải biên bản...</div>;
  if (!meeting) return <div className="p-6 text-sm text-slate-500">Không tìm thấy biên bản. <Link href="/meetings" className="text-teal-800 font-semibold">Quay lại</Link></div>;

  return (
    <div className="flex flex-col w-full p-4 lg:p-6 space-y-4 pb-20">
      <Link href="/meetings" className="text-xs text-slate-500 font-semibold">‹ Danh sách biên bản</Link>
      <div>
        <h1 className="text-xl font-bold text-slate-900">{meeting.title}</h1>
        <p className="text-sm text-slate-500">
          {new Date(meeting.meetingAt).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
          {meeting.chair ? ` · Chủ trì: ${meeting.chair}` : ""}
        </p>
      </div>

      {canApprove && aiEnabled && (
        <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-secondary">✨ Dán biên bản thô, AI tách kết luận giúp</span>
          <textarea rows={3} value={minutes} onChange={(e) => setMinutes(e.target.value)}
            placeholder="Dán nội dung biên bản họp vào đây..."
            className="p-2.5 rounded-lg border border-border-subtle text-sm bg-white" />
          <button onClick={handleExtract} disabled={extracting}
            className="self-start px-4 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-bold disabled:opacity-50">
            {extracting ? "Đang tách..." : "Tách kết luận bằng AI"}
          </button>
        </div>
      )}

      {canApprove && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-700">+ Thêm kết luận</span>
          <input value={cContent} onChange={(e) => setCContent(e.target.value)}
            placeholder="Nhập kết luận giao việc..."
            className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={cOwner} onChange={(e) => setCOwner(e.target.value)}
              className="h-10 px-2 rounded-lg border border-slate-300 text-sm">
              <option value="">Chủ trì...</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
            <input type="date" value={cDeadline} onChange={(e) => setCDeadline(e.target.value)}
              className="h-10 px-3 rounded-lg border border-slate-300 text-sm" />
          </div>
          <CollaboratorPicker people={people} value={cCollabs} onChange={setCCollabs} excludeId={cOwner} disabled={adding} />
          <button type="submit" disabled={adding} className="self-start px-4 py-2 rounded-lg bg-teal-800 text-white text-xs font-bold disabled:opacity-50">
            {adding ? "Đang thêm..." : "Thêm kết luận"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {meeting.conclusions.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-6">Chưa có kết luận nào.</p>
        )}
        {meeting.conclusions.map((c, idx) => (
          <div key={c.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex flex-col gap-1.5">
            <div className="text-sm text-slate-900">
              <strong className="text-teal-900">{idx + 1}. </strong>{c.content}
            </div>
            <div className="text-xs text-slate-500">
              {c.ownerName ? `Chủ trì: ${c.ownerName}` : "Chưa gán chủ trì"}
              {c.assigneeNames.length > 0 ? ` · Phối hợp: ${c.assigneeNames.join(", ")}` : ""}
              {c.deadline ? ` · Hạn: ${new Date(c.deadline).toLocaleDateString("vi-VN")}` : ""}
            </div>
            {c.task ? (
              <Link href={`/tasks/${c.task.id}`}
                className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 self-start">
                Đã thành việc [{c.task.code}] — {c.task.status === "COMPLETED" ? "Đã xong" : "Đang làm"} ›
              </Link>
            ) : canApprove ? (
              <div className="flex gap-2">
                <button onClick={() => handleConvert(c.id)} disabled={convertingId === c.id}
                  className="text-xs font-bold text-white bg-secondary rounded-lg px-3 py-1.5 disabled:opacity-50">
                  {convertingId === c.id ? "Đang chuyển..." : "Chuyển thành nhiệm vụ"}
                </button>
                <button onClick={() => handleDelete(c.id)} className="text-xs text-rose-600 px-2 py-1.5">
                  Xóa
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

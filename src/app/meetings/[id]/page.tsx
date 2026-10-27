"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toCalendarDate, vnDateToDeadlineIso } from "@/lib/datetime";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "@/components/ui/Toast";
import BackButton from "@/components/ui/BackButton";
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
  canEdit?: boolean;
  conclusions: Conclusion[];
}

/** Chi tiết biên bản: thêm kết luận (tay hoặc AI tách), 1 chạm chuyển thành việc. */
export default function MeetingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const { canApprove } = usePermissions();
  const [people, setPeople] = useState<Array<{ id: string; fullName: string }>>([]);

  const [cContent, setCContent] = useState("");
  const [cOwner, setCOwner] = useState("");
  const [cCollabs, setCCollabs] = useState<string[]>([]);
  const [cDeadline, setCDeadline] = useState("");
  const [adding, setAdding] = useState(false);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  // Sửa thông tin biên bản (tiêu đề, thời gian, chủ trì, ghi chú)
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [mTitle, setMTitle] = useState("");
  const [mDate, setMDate] = useState("");
  const [mChair, setMChair] = useState("");
  const [mNotes, setMNotes] = useState("");

  // Sửa kết luận chưa chuyển nhiệm vụ (inline)
  const [editingConclusionId, setEditingConclusionId] = useState<string | null>(null);
  const [savingConclusion, setSavingConclusion] = useState(false);
  const [ecContent, setEcContent] = useState("");
  const [ecOwner, setEcOwner] = useState("");
  const [ecCollabs, setECCollabs] = useState<string[]>([]);
  const [ecDeadline, setEcDeadline] = useState("");
  const [ecPriority, setEcPriority] = useState("Cao");

  // AI tách biên bản thô
  const [aiEnabled, setAiEnabled] = useState(false);
  const [minutes, setMinutes] = useState("");
  const [extracting, setExtracting] = useState(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${id}`);
      const json = await res.json();
      if (res.ok) {
        setMeeting(json.data);
        setLoadError("");
      } else {
        setLoadError(json.error || "Không thể tải biên bản");
        toast.error(json.error || "Không thể tải biên bản");
      }
    } catch (err: any) {
      setLoadError("Lỗi kết nối: " + err.message);
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

  const startMeetingEdit = () => {
    if (!meeting) return;
    setMTitle(meeting.title);
    setMDate(toCalendarDate(meeting.meetingAt));
    setMChair(meeting.chair || "");
    setMNotes(meeting.notes || "");
    setEditingMeeting(true);
  };

  const handleMeetingSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingMeeting || !meeting) return;
    if (!mTitle.trim()) { toast.warning("Nhập tiêu đề biên bản"); return; }
    if (!mDate) { toast.warning("Chọn ngày họp"); return; }
    setSavingMeeting(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_meeting",
          title: mTitle.trim(),
          meetingAt: mDate,
          chair: mChair.trim(),
          notes: mNotes.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã lưu thông tin biên bản.");
        setEditingMeeting(false);
        fetchDetail();
      } else {
        toast.error(json.error || "Không thể lưu biên bản");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSavingMeeting(false);
    }
  };

  const startConclusionEdit = (c: Conclusion) => {
    setEditingConclusionId(c.id);
    setEcContent(c.content);
    setEcOwner(c.ownerId || "");
    setECCollabs(c.assigneeIds || []);
    setEcDeadline(c.deadline ? toCalendarDate(c.deadline) : "");
    setEcPriority(c.priority || "Cao");
  };

  const cancelConclusionEdit = () => {
    setEditingConclusionId(null);
    setEcContent("");
    setEcOwner("");
    setECCollabs([]);
    setEcDeadline("");
    setEcPriority("Cao");
  };

  const handleConclusionSave = async (e: React.FormEvent, cid: string) => {
    e.preventDefault();
    if (savingConclusion) return;
    const content = ecContent.trim();
    if (!content) { toast.warning("Nhập nội dung kết luận"); return; }
    setSavingConclusion(true);
    try {
      const res = await fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conclusionId: cid,
          action: "update",
          content,
          ownerId: ecOwner || "",
          assigneeIds: ecCollabs.filter((pid) => pid !== ecOwner),
          deadline: ecDeadline ? vnDateToDeadlineIso(ecDeadline) : null,
          priority: ecPriority,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã cập nhật kết luận.");
        cancelConclusionEdit();
        fetchDetail();
      } else {
        toast.error(json.error || "Không thể sửa kết luận");
      }
    } catch (err: any) {
      toast.error("Lỗi: " + err.message);
    } finally {
      setSavingConclusion(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-v5-muted">Đang tải biên bản...</div>;
  if (!meeting)
    return (
      <div className="p-6 flex flex-col items-start gap-3">
        <BackButton href="/meetings" label="Danh sách biên bản" />
        <p className="text-sm text-v5-muted">{loadError || "Không tìm thấy biên bản."}</p>
      </div>
    );

  return (
    <div className="flex w-full flex-col gap-3 pb-4">
      <BackButton href="/meetings" label="Danh sách biên bản" />
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-v5-ink">{meeting.title}</h1>
            <p className="text-sm text-v5-muted">
              {new Date(meeting.meetingAt).toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}
              {meeting.chair ? ` · Chủ trì: ${meeting.chair}` : ""}
            </p>
            {meeting.notes && (
              <p className="text-xs text-v5-muted mt-1 whitespace-pre-line">{meeting.notes}</p>
            )}
          </div>
          {meeting.canEdit && !editingMeeting && (
            <button onClick={startMeetingEdit}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-v5-line text-xs font-semibold text-v5-ink hover:border-v5-accent/40">
              Sửa biên bản
            </button>
          )}
        </div>
      </div>

      {editingMeeting && (
        <form onSubmit={handleMeetingSave} className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-v5-ink">Sửa thông tin biên bản</span>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-ink">Tiêu đề *</label>
            <input required value={mTitle} onChange={(e) => setMTitle(e.target.value)}
              placeholder="Giao ban tuần 42..."
              className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-v5-ink">Ngày họp *</label>
              <input type="date" required value={mDate} onChange={(e) => setMDate(e.target.value)}
                className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-v5-ink">Chủ trì</label>
              <input value={mChair} onChange={(e) => setMChair(e.target.value)}
                placeholder="Nhập tên chủ trì..."
                className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-v5-ink">Ghi chú</label>
            <textarea rows={2} value={mNotes} onChange={(e) => setMNotes(e.target.value)}
              placeholder="Ghi chú biên bản..."
              className="p-2.5 rounded-lg border border-v5-line text-sm" />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={savingMeeting}
              className="px-4 py-2 rounded-lg bg-v5-accent text-white text-xs font-bold disabled:opacity-50">
              {savingMeeting ? "Đang lưu..." : "Lưu biên bản"}
            </button>
            <button type="button" onClick={() => setEditingMeeting(false)}
              className="px-4 py-2 rounded-lg border border-v5-line text-xs font-semibold text-v5-ink">
              Hủy
            </button>
          </div>
        </form>
      )}

      {canApprove && meeting.canEdit && aiEnabled && (
        <div className="bg-secondary/10 border border-secondary/30 rounded-xl p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-secondary">✨ Dán biên bản thô, AI tách kết luận giúp</span>
          <textarea rows={3} value={minutes} onChange={(e) => setMinutes(e.target.value)}
            placeholder="Dán nội dung biên bản họp vào đây..."
            className="p-2.5 rounded-lg border border-v5-line text-sm bg-v5-surface" />
          <button onClick={handleExtract} disabled={extracting}
            className="self-start px-4 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-bold disabled:opacity-50">
            {extracting ? "Đang tách..." : "Tách kết luận bằng AI"}
          </button>
        </div>
      )}

      {canApprove && meeting.canEdit && (
        <form onSubmit={handleAdd} className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-3 flex flex-col gap-2">
          <span className="text-xs font-bold text-v5-ink">+ Thêm kết luận</span>
          <input value={cContent} onChange={(e) => setCContent(e.target.value)}
            placeholder="Nhập kết luận giao việc..."
            className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <select value={cOwner} onChange={(e) => setCOwner(e.target.value)}
              className="h-10 px-2 rounded-lg border border-v5-line text-sm">
              <option value="">Chủ trì...</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
            </select>
            <input type="date" value={cDeadline} onChange={(e) => setCDeadline(e.target.value)}
              className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
          </div>
          <CollaboratorPicker people={people} value={cCollabs} onChange={setCCollabs} excludeId={cOwner} disabled={adding} />
          <button type="submit" disabled={adding} className="self-start px-4 py-2 rounded-lg bg-v5-accent text-white text-xs font-bold disabled:opacity-50">
            {adding ? "Đang thêm..." : "Thêm kết luận"}
          </button>
        </form>
      )}

      <div className="flex flex-col gap-2">
        {meeting.conclusions.length === 0 && (
          <p className="text-sm text-v5-muted text-center py-6">Chưa có kết luận nào.</p>
        )}
        {meeting.conclusions.map((c, idx) => (
          <div key={c.id} className="bg-v5-surface rounded-xl border border-v5-line shadow-sm p-3 flex flex-col gap-1.5">
            {editingConclusionId === c.id ? (
              <form onSubmit={(e) => handleConclusionSave(e, c.id)} className="flex flex-col gap-2">
                <span className="text-xs font-bold text-v5-ink">Sửa kết luận {idx + 1}</span>
                <textarea rows={2} value={ecContent} onChange={(e) => setEcContent(e.target.value)}
                  placeholder="Nhập nội dung kết luận..."
                  className="p-2.5 rounded-lg border border-v5-line text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={ecOwner} onChange={(e) => setEcOwner(e.target.value)}
                    className="h-10 px-2 rounded-lg border border-v5-line text-sm">
                    <option value="">Chủ trì...</option>
                    {c.ownerId && !people.some((p) => p.id === c.ownerId) && (
                      <option value={c.ownerId}>{c.ownerName || c.ownerId}</option>
                    )}
                    {people.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
                  </select>
                  <input type="date" value={ecDeadline} onChange={(e) => setEcDeadline(e.target.value)}
                    className="h-10 px-3 rounded-lg border border-v5-line text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-v5-ink">Mức ưu tiên</label>
                  <select value={ecPriority} onChange={(e) => setEcPriority(e.target.value)}
                    className="h-10 px-2 rounded-lg border border-v5-line text-sm">
                    <option value="Khẩn">Khẩn cấp</option>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </div>
                <CollaboratorPicker people={people} value={ecCollabs} onChange={setECCollabs} excludeId={ecOwner} disabled={savingConclusion} />
                <div className="flex gap-2">
                  <button type="submit" disabled={savingConclusion}
                    className="px-4 py-2 rounded-lg bg-v5-accent text-white text-xs font-bold disabled:opacity-50">
                    {savingConclusion ? "Đang lưu..." : "Lưu kết luận"}
                  </button>
                  <button type="button" onClick={cancelConclusionEdit}
                    className="px-4 py-2 rounded-lg border border-v5-line text-xs font-semibold text-v5-ink">
                    Hủy
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="text-sm text-v5-ink">
                  <strong className="text-v5-accent">{idx + 1}. </strong>{c.content}
                </div>
                <div className="text-xs text-v5-muted">
                  {c.ownerName ? `Chủ trì: ${c.ownerName}` : "Chưa gán chủ trì"}
                  {c.assigneeNames.length > 0 ? ` · Phối hợp: ${c.assigneeNames.join(", ")}` : ""}
                  {c.deadline ? ` · Hạn: ${new Date(c.deadline).toLocaleDateString("vi-VN")}` : ""}
                </div>
                {c.taskId ? (
                  <div className="flex flex-col items-start gap-1">
                    {c.task && (
                      <Link href={`/tasks/${c.task.id}`}
                        className="text-xs font-bold text-v5-accent bg-v5-accent-soft border border-v5-line rounded-lg px-2.5 py-1.5 self-start">
                        Đã thành việc [{c.task.code}] — {c.task.status === "COMPLETED" ? "Đã xong" : "Đang làm"} ›
                      </Link>
                    )}
                    <span className="text-xs text-v5-muted">Kết luận đã chuyển thành nhiệm vụ — sửa trên nhiệm vụ.</span>
                  </div>
                ) : meeting.canEdit && canApprove ? (
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => handleConvert(c.id)} disabled={convertingId === c.id}
                      className="text-xs font-bold text-white bg-secondary rounded-lg px-3 py-1.5 disabled:opacity-50">
                      {convertingId === c.id ? "Đang chuyển..." : "Chuyển thành nhiệm vụ"}
                    </button>
                    <button onClick={() => startConclusionEdit(c)}
                      className="text-xs font-bold text-v5-accent bg-v5-accent-soft border border-v5-line rounded-lg px-3 py-1.5">
                      Sửa
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-xs text-v5-danger px-2 py-1.5">
                      Xóa
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

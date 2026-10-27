"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, MessageSquareText, Settings2 } from "lucide-react";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/v5/ui/badge";
import { Button } from "@/components/v5/ui/button";
import { Card } from "@/components/v5/ui/card";

type PeriodType = "WEEK" | "MONTH" | "QUARTER" | "YEAR";

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

interface Props {
  periodType: PeriodType;
  periodKey: string;
  periodLabel: string;
}

function fmtUpdatedAt(iso: string | null): string {
  if (!iso) return "Chưa có nội dung";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function GiaoBanNarrativePanel({ periodType, periodKey, periodLabel }: Props) {
  const [sections, setSections] = useState<NarrativeSection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const filled = useMemo(
    () => sections.filter((section) => (drafts[section.id] ?? "").trim().length > 0).length,
    [sections, drafts]
  );

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ periodType, periodKey });
      const res = await fetch(`/api/narratives?${params.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không tải được nhận xét");
      const nextSections: NarrativeSection[] = Array.isArray(json.sections) ? json.sections : [];
      setSections(nextSections);
      const nextDrafts: Record<string, string> = {};
      for (const section of nextSections) nextDrafts[section.id] = section.content || "";
      setDrafts(nextDrafts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được nhận xét");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodType, periodKey]);

  async function save(section: NarrativeSection) {
    if (!section.canEdit || savingId) return;
    setSavingId(section.id);
    try {
      const res = await fetch("/api/narratives", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          periodType,
          periodKey,
          content: drafts[section.id] || "",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || "Không lưu được nhận xét");
      setSections((current) =>
        current.map((item) =>
          item.id === section.id
            ? { ...item, content: drafts[section.id] || "", updatedAt: new Date().toISOString(), updatedByName: "Bạn" }
            : item
        )
      );
      toast.success("Đã lưu nhận xét");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không lưu được nhận xét");
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <Card className="flex min-h-40 items-center justify-center gap-2 p-6 text-sm text-v5-muted">
        <Loader2 className="h-4 w-4 animate-spin text-v5-accent" />
        Đang tải nhận xét giao ban…
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-v5-danger/30 bg-v5-danger-soft p-4">
        <div className="text-sm font-semibold text-v5-danger">Không tải được nhận xét</div>
        <div className="mt-1 text-xs text-v5-danger/80">{error}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={load}>
          Thử lại
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-v5-ink">Nhận xét giao ban</h2>
          <p className="text-[11px] text-v5-muted">
            {periodLabel} · {periodKey} · {filled}/{sections.length} mục đã nhập
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/giao-ban/cau-hinh?tab=SECTION">
            <Settings2 className="h-3.5 w-3.5" /> Cấu hình mục nhận xét
          </Link>
        </Button>
      </div>

      {sections.length === 0 && (
        <Card className="p-8 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-v5-accent-soft text-v5-accent">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div className="mt-3 text-sm font-semibold text-v5-ink">Chưa có mục nhận xét</div>
          <p className="mt-1 text-xs text-v5-muted">
            Vào Cấu hình giao ban → Mục nhận xét để tạo các mục nội dung.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
        {sections.map((section) => {
          const content = drafts[section.id] ?? "";
          const hasContent = content.trim().length > 0;
          return (
            <Card key={section.id} className="flex flex-col gap-2 p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-semibold text-v5-ink">{section.title}</h3>
                    <Badge variant={hasContent ? "success" : "outline"}>
                      {hasContent ? "Đã nhập" : "Chưa nhập"}
                    </Badge>
                  </div>
                  {section.groupName && (
                    <div className="mt-0.5 text-[10px] text-v5-muted">{section.groupName}</div>
                  )}
                </div>
                <div className="text-right text-[10px] text-v5-muted">
                  {fmtUpdatedAt(section.updatedAt)}
                  {section.updatedByName ? ` · ${section.updatedByName}` : ""}
                </div>
              </div>

              <textarea
                value={content}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [section.id]: event.target.value }))
                }
                disabled={!section.canEdit || savingId === section.id}
                rows={4}
                placeholder={section.canEdit ? "Nhập nhận xét/đánh giá cho kỳ này…" : "Bạn không được phân công nhập mục này"}
                className="w-full rounded-lg border border-v5-line bg-v5-surface px-2.5 py-2 text-[12px] leading-5 text-v5-ink outline-none transition-colors placeholder:text-v5-muted focus:border-v5-accent disabled:bg-v5-bg disabled:text-v5-muted"
              />

              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  onClick={() => save(section)}
                  disabled={!section.canEdit || Boolean(savingId)}
                >
                  {savingId === section.id ? "Đang lưu…" : "Lưu nhận xét"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

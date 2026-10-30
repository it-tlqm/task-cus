"use client";

import { V5Icon } from "@/components/v5/ui/lucide-icon";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "@/components/ui/Toast";

const CATEGORIES = [
  { id: "GOP_Y", label: "Góp ý", icon: "chat_bubble" },
  { id: "BAO_LOI", label: "Báo lỗi", icon: "bug_report" },
  { id: "DE_XUAT", label: "Đề xuất", icon: "lightbulb" },
];

/**
 * Nút "Góp ý" nổi toàn app (trừ trang đăng nhập):
 * công chức gửi phản hồi thẳng vào hệ thống — lãnh đạo & kỹ thuật đọc ở /admin/feedback.
 * Kèm sẵn màn hình đang mở để người đọc biết lỗi ở đâu, không phải hỏi lại.
 */
export function FeedbackButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("GOP_Y");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  if (pathname === "/login") return null;

  const submit = async () => {
    const text = content.trim();
    if (text.length < 5) {
      toast.error("Bạn ghi rõ hơn một chút giúp mình nhé (ít nhất 5 ký tự)");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, category, pagePath: pathname }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(json.message || "Đã gửi — cảm ơn bạn!");
        setContent("");
        setCategory("GOP_Y");
        setOpen(false);
      } else {
        toast.error(json.error || "Không gửi được, thử lại sau");
      }
    } catch (err: any) {
      toast.error("Lỗi kết nối: " + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Gửi góp ý / báo lỗi cho lãnh đạo & kỹ thuật"
        aria-label="Gửi góp ý hoặc báo lỗi"
        className={`focus-ring fixed bottom-36 left-4 z-40 h-11 items-center gap-1.5 rounded-full bg-secondary pl-3 pr-4 text-on-secondary shadow-lg transition-transform hover:opacity-90 active:scale-95 lg:bottom-24 lg:left-[calc(var(--sidebar-width,260px)+16px)] ${
          pathname.startsWith("/roster") ? "hidden lg:flex" : "flex"
        }`}
      >
        <V5Icon name="campaign" className="text-[20px]" />
        <span className="text-xs font-bold">Góp ý</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-v5-surface rounded-2xl shadow-2xl p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <V5Icon name="campaign" className="text-[20px]" />
                Góp ý &amp; Báo lỗi
              </h3>
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                className="p-1 rounded hover:bg-v5-bg text-outline disabled:opacity-40"
                aria-label="Đóng"
              >
                <V5Icon name="close" className="text-[20px]" />
              </button>
            </div>

            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-fast ${
                    category === c.id
                      ? "border-v5-accent bg-v5-accent text-white"
                      : "border-v5-line bg-v5-surface text-v5-muted hover:bg-v5-bg"
                  }`}
                >
                  <V5Icon name={c.icon} className="text-[16px]" />
                  {c.label}
                </button>
              ))}
            </div>

            <textarea
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={2000}
              placeholder="Bạn gặp vướng gì, muốn góp ý điều gì? Ghi ngắn gọn — hệ thống tự kèm màn hình bạn đang mở."
              className="p-2.5 rounded-lg border border-border-subtle text-sm bg-white resize-none"
            />

            <p className="text-[11px] text-v5-muted leading-relaxed">
              Gửi kèm: màn hình bạn đang mở, thời gian và thiết bị — để lãnh đạo &amp; kỹ thuật soi đúng chỗ.
              Phản hồi đi thẳng vào hệ thống, không qua Zalo.
            </p>

            <button
              onClick={submit}
              disabled={sending || content.trim().length < 5}
              className="h-10 rounded-lg bg-secondary text-on-secondary text-sm font-bold disabled:opacity-50"
            >
              {sending ? "Đang gửi..." : "Gửi phản hồi"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

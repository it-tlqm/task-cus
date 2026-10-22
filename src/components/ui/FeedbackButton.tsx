"use client";

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
        <span className="material-symbols-outlined text-[20px]">campaign</span>
        <span className="text-xs font-bold">Góp ý</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
          onClick={() => !sending && setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full max-w-md bg-surface-container-lowest rounded-2xl shadow-2xl p-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">campaign</span>
                Góp ý &amp; Báo lỗi
              </h3>
              <button
                onClick={() => setOpen(false)}
                disabled={sending}
                className="p-1 rounded hover:bg-surface-container text-outline disabled:opacity-40"
                aria-label="Đóng"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`flex-1 h-9 rounded-lg text-xs font-bold flex items-center justify-center gap-1 border transition-fast ${
                    category === c.id
                      ? "bg-secondary text-on-secondary border-secondary"
                      : "bg-white text-on-surface border-border-subtle hover:bg-surface-container"
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">{c.icon}</span>
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

            <p className="text-[11px] text-on-surface-variant leading-relaxed">
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

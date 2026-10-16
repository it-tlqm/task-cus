"use client";

import React, { useState, useEffect } from "react";
import { toast } from "@/components/ui/Toast";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Nút bật/tắt thông báo đẩy về điện thoại (1 máy bấm 1 lần).
 * iOS: chỉ nhận khi đã thêm web vào màn hình chính.
 */
export function PushToggle() {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "on" | "denied" | "working">("unknown");
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  const enable = async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        if (perm === "denied") toast.error("Trình duyệt đang chặn thông báo — mở Cài đặt trang để cho phép");
        return;
      }
      const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!pubKey) {
        toast.error("Máy chủ chưa cấu hình VAPID — báo quản trị hệ thống");
        setState("off");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(pubKey),
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("Máy chủ từ chối đăng ký");
      setState("on");
      toast.success("Đã bật thông báo đẩy! Thử nhờ đồng nghiệp giao việc để kiểm tra.");
    } catch (err: any) {
      setState("off");
      toast.error("Không bật được: " + (err.message || "trình duyệt không hỗ trợ"));
    }
  };

  const disable = async () => {
    setState("working");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint;
      await sub?.unsubscribe();
      if (endpoint) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, { method: "DELETE" });
      }
      setState("off");
      toast.success("Đã tắt thông báo đẩy trên máy này.");
    } catch {
      setState("on");
    }
  };

  if (state === "unknown") return null;
  if (state === "unsupported") {
    return <span className="text-xs text-slate-400">Máy này không hỗ trợ thông báo đẩy</span>;
  }
  if (state === "denied") {
    return <span className="text-xs text-rose-600">Trình duyệt đang chặn thông báo — mở Cài đặt trang để cho phép</span>;
  }
  const busy = state === "working";
  return (
    <div className="flex flex-col gap-1">
      {state === "on" ? (
        <button onClick={disable} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 text-xs font-semibold disabled:opacity-50">
          <span className="material-symbols-outlined text-[16px]">notifications_active</span>
          <span>Đang nhận tin về máy — bấm để tắt</span>
        </button>
      ) : (
        <button onClick={enable} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary text-on-secondary text-xs font-semibold shadow-sm disabled:opacity-50">
          <span className="material-symbols-outlined text-[16px]">add_alert</span>
          <span>{busy ? "Đang bật..." : "Bật thông báo về điện thoại"}</span>
        </button>
      )}
      {isIOS && state !== "on" && (
        <span className="text-[11px] text-slate-500">iPhone: thêm web vào Màn hình chính (Chia sẻ → Thêm vào MH chính) rồi mới nhận được tin.</span>
      )}
    </div>
  );
}

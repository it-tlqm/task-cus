/* SW thông báo đẩy — Hải quan Tà Lùng (không cache, chỉ xử lý push). */
self.addEventListener("push", (event) => {
  let data = { title: "Hải quan Tà Lùng", body: "Có thông báo điều hành mới", url: "/notifications", tag: "hqtl" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/images/logo-haiquan.png",
      badge: "/images/logo-haiquan.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

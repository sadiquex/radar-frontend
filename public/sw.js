// Radar service worker.
//
// Deliberately minimal: it exists so the group can reach you with the screen
// off, and for nothing else. No caching, no offline shell — a stale cache on a
// live-tracking app would be worse than no service worker at all.

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every tab to close; a rider
  // enabling alerts mid-trip should not have to reload first.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const body = typeof payload.body === "string" ? payload.body : "Something changed";
  const url = typeof payload.url === "string" ? payload.url : "/";

  event.waitUntil(
    self.registration.showNotification("Radar", {
      body,
      // Without these the notification wears the browser's own logo, so an
      // alert about your group reads as an alert from Chrome.
      icon: "/icon-192.png",
      // Android tints the badge and uses only its alpha channel, which is why
      // that file is a white silhouette rather than the coloured mark.
      badge: "/icon-badge.png",
      // One tag per trip, so successive alerts replace each other instead of
      // stacking up on a lock screen someone reads at a glance.
      tag: `radar${url}`,
      renotify: true,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus the trip if it is already open — reloading it would drop the
      // live socket and re-request geolocation for nothing.
      for (const client of clients) {
        if (new URL(client.url).pathname === url && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

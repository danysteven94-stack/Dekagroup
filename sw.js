var CACHE_NAME = "deka-log-shell-v2";
var SHELL_FILES = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Never cache API calls — always hit the network for live business data.
  if (url.pathname.indexOf("/api/") === 0) return;

  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      var networked = fetch(event.request)
        .then(function (response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
          }
          return response;
        })
        .catch(function () { return cached; });
      return cached || networked;
    })
  );
});

// ---------- Web Push ----------
self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "DEKA LOG", {
      body: data.body || "Ou gen yon nouvo notifikasyon.",
      icon: "/icon-192.png",
      tag: data.tag || "deka-log",
      renotify: true,
      data: { url: data.url || "/?tab=notifs" }
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ("focus" in list[i]) {
          list[i].postMessage({ type: "open-notifs" });
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

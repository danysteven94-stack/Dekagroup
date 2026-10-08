// v14: the whole app (page, styles and every module) is stored at install, so it opens without network.
var CACHE_NAME = "deka-log-shell-v25";
var SHELL_FILES = [
  "/",
  "/index.html",
  "/app.css",
  "/manifest.json",
  "/logo.jpg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/favicon-16.png",
  "/favicon-32.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/js/api.js",
  "/js/archive.js",
  "/js/constants.js",
  "/js/csv.js",
  "/js/events-account.js",
  "/js/events-archive.js",
  "/js/events-lang.js",
  "/js/events-logistique.js",
  "/js/events.js",
  "/js/i18n-fr.js",
  "/js/i18n.js",
  "/js/icons.js",
  "/js/iso6346.js",
  "/js/lockdown.js",
  "/js/main.js",
  "/js/mutations.js",
  "/js/offline.js",
  "/js/offlinedb.js",
  "/js/outbox.js",
  "/js/payments.js",
  "/js/pdf.js",
  "/js/push.js",
  "/js/register-sw.js",
  "/js/render.js",
  "/js/session.js",
  "/js/state.js",
  "/js/utils.js",
  "/js/views/account.js",
  "/js/views/admin.js",
  "/js/views/archive.js",
  "/js/views/daily.js",
  "/js/views/delivery.js",
  "/js/views/depot.js",
  "/js/views/driver.js",
  "/js/views/pointeur.js",
  "/js/views/products.js",
  "/js/views/gate.js",
  "/js/views/goods.js",
  "/js/views/help.js",
  "/js/views/tour.js",
  "/js/views/invoices.js",
  "/js/views/logistique.js",
  "/js/views/modals.js",
  "/js/views/security.js",
  "/js/views/stock.js",
  "/js/views/users.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // One missing file must not stop the whole install.
      return Promise.all(SHELL_FILES.map(function (f) {
        return cache.add(new Request(f, { cache: "reload" })).catch(function () {});
      }));
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

// Network first, but a weak connection can hang for minutes: after 4 seconds the stored copy is used
// (the network answer, if it comes later, still refreshes the stored copy for next time).
function networkFirst(request, store) {
  return new Promise(function (resolve) {
    var done = false;
    function fromCache() {
      return caches.match(request, { ignoreSearch: true }).then(function (c) {
        return c || (request.mode === "navigate" ? caches.match("/index.html") : null);
      });
    }
    var timer = setTimeout(function () {
      fromCache().then(function (c) {
        if (c && !done) {
          done = true;
          resolve(c);
        }
      });
    }, 4000);
    fetch(request).then(function (r) {
      clearTimeout(timer);
      if (done) {
        store(r);
      } else {
        done = true;
        resolve(store(r));
      }
    }, function () {
      clearTimeout(timer);
      fromCache().then(function (c) {
        if (!done) {
          done = true;
          resolve(c || Response.error());
        }
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);

  // Never cache API calls — always hit the network for live business data.
  if (url.pathname.indexOf("/api/") === 0) return;

  if (event.request.method !== "GET") return;

  function store(response) {
    if (response && response.ok) {
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, clone); });
    }
    return response;
  }

  // The app's code (page, ES modules, CSS) is network-first: every file of one release comes from the same deployment
  // (a mix of old and new modules would break the app). The cache is only the offline fallback.
  var isCode = event.request.mode === "navigate" || /\.(js|css|html)$/.test(url.pathname) || url.pathname === "/";
  if (isCode) {
    event.respondWith(networkFirst(event.request, store));
    return;
  }

  // Images, manifest...: cached copy first, refreshed in the background.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      var networked = fetch(event.request).then(store).catch(function () { return cached; });
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

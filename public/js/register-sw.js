// Registers the service worker (offline shell + push notifications).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () { /* silent — app still works without it */ });
  });
}

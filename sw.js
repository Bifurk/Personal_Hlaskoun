// Service worker: umožní instalaci na plochu a běh bez internetu.
// Stránka a kód se berou nejdřív ze sítě (aby se projevily aktualizace),
// nahrávky a ikony nejdřív z mezipaměti.
const CACHE = "hlaskoun-v6";
const SHELL = ["./", "index.html", "css/style.css", "js/data.js", "js/app.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const cacheFirst = url.origin === location.origin && /\/(audio|icons)\//.test(url.pathname);
  const put = res => { if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
  if (cacheFirst) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(put)));
  } else {
    e.respondWith(fetch(req).then(put).catch(() => caches.match(req).then(hit => hit || caches.match("./"))));
  }
});

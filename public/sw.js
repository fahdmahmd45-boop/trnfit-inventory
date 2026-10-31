// TRN FIT service worker: caches static assets only. API calls are never cached (inventory must be live).
const VERSION = "trnfit-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // always network

  const immutable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/zxing/") ||
    url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg)$/.test(url.pathname);
  if (immutable) {
    e.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) (await caches.open(PAGES)).put(req, res.clone());
        return res;
      } catch {
        const hit = await caches.match(req);
        return hit || new Response("<meta charset=utf-8><body style='background:#0A0A0A;color:#F5F3F0;font-family:sans-serif;display:grid;place-items:center;height:100vh'><p>أنت غير متصل بالإنترنت — You are offline</p>", { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});

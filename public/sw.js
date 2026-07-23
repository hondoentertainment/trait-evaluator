const CACHE = "profile-read-v4";
const SHARE_CACHE = "profile-read-shares";
const PRECACHE = [
  "/",
  "/index.html",
  "/crosswalk",
  "/crosswalk.html",
  "/compare",
  "/compare.html",
  "/demo",
  "/demo.html",
  "/landing",
  "/landing.html",
  "/share-target.html",
  "/js/native-share.js",
  "/js/export-png.js",
  "/manifest.webmanifest",
  "/og.png",
  "/js/app.js",
  "/js/store.js",
  "/js/hilo.js",
  "/js/auth.js",
  "/js/telemetry.js",
  "/js/crosswalk-page.js",
  "/js/compare-page.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // PWA share target — accept image POST, stash file, redirect home
  if (req.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData();
          const file = form.get("media") || form.get("file");
          const text = form.get("text") || form.get("title") || "";
          const key = "share-" + Date.now();
          if (file && typeof file === "object") {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              new Request("/__share__/" + key),
              new Response(file, {
                headers: {
                  "Content-Type": file.type || "image/jpeg",
                  "X-Share-Name": file.name || "shared.jpg",
                },
              })
            );
          }
          const dest = new URL("/", self.location.origin);
          dest.hash = "deal";
          if (key) dest.searchParams.set("share", key);
          if (text) dest.searchParams.set("text", String(text));
          return Response.redirect(dest.toString(), 303);
        } catch {
          return Response.redirect("/", 303);
        }
      })()
    );
    return;
  }

  if (req.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req)
        .then((res) => {
          if (res && res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});

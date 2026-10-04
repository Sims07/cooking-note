/* Service worker - Saveurs & Notes */
const VERSION = "v4";
const SHELL_CACHE = `saveurs-shell-${VERSION}`;
const RUNTIME_CACHE = `saveurs-runtime-${VERSION}`;

// Fichiers de l'application (obligatoires)
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

// Bibliothèques CDN (mises en cache au mieux pour le mode hors ligne)
const CDN = [
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js",
  "https://unpkg.com/@babel/standalone/babel.min.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await Promise.all(SHELL.map(async (u) => {
      const res = await fetch(new Request(u, { cache: "reload" }));
      if (!res.ok) throw new Error("Précache impossible : " + u);
      await shell.put(u, res);
    }));
    // Un échec CDN ne doit pas bloquer l'installation
    await Promise.all(CDN.map(async (url) => {
      try {
        const res = await fetch(url, { mode: "cors" });
        if (res.ok) await shell.put(url, res);
      } catch (e) { /* sera récupéré à l'exécution */ }
    }));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => ![SHELL_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // L'API GitHub passe toujours par le réseau (jamais en cache : token + données fraîches)
  if (url.hostname === "api.github.com") return;

  // Fichiers JSON de recettes : réseau d'abord (données fraîches), cache en secours hors ligne
  if (url.origin === self.location.origin && url.pathname.endsWith(".json")) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-store" });
        if (res.ok) (await caches.open(RUNTIME_CACHE)).put(req, res.clone());
        return res;
      } catch (e) {
        return (await caches.match(req)) || new Response("[]", { status: 504 });
      }
    })());
    return;
  }

  // Navigation : réseau d'abord, repli sur la page en cache
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: "no-cache" });
        const cache = await caches.open(SHELL_CACHE);
        cache.put("./index.html", res.clone());
        return res;
      } catch (e) {
        return (await caches.match("./index.html")) || (await caches.match("./"));
      }
    })());
    return;
  }

  // Le reste : cache d'abord, mise à jour en arrière-plan (stale-while-revalidate)
  event.respondWith((async () => {
    const cached = await caches.match(req);
    const network = fetch(req).then(async (res) => {
      if (res && (res.ok || res.type === "opaque")) {
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(req, res.clone());
      }
      return res;
    }).catch(() => null);
    return cached || (await network) || new Response("", { status: 504, statusText: "Hors ligne" });
  })());
});

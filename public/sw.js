/* GitNaadu service worker — makes the installed app work offline.
 *
 * The build (see SwPrecachePlugin in webpack.config.js) replaces
 * __BUILD_VERSION__ and __PRECACHE_URLS__ with this build's hash and its
 * emitted files, so every deploy gets a fresh cache and old ones are dropped.
 */
const VERSION = "__BUILD_VERSION__";
const PRECACHE_URLS = __PRECACHE_URLS__;
const APP_CACHE = `gitnaadu-app-${VERSION}`;
const FONT_CACHE = "gitnaadu-fonts";
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(APP_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => k.startsWith("gitnaadu-app-") && k !== APP_CACHE)
                        .map((k) => caches.delete(k)),
                ),
            )
            .then(() => self.clients.claim()),
    );
});

// Serve from cache, refreshing it in the background when online.
const staleWhileRevalidate = async (cacheName, request) => {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((res) => {
            if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
            return res;
        })
        .catch(() => cached);
    return cached || network;
};

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);

    // Page loads: always try the network so a new deploy shows up right
    // away; fall back to the cached shell when offline.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((res) => {
                    if (res.ok) {
                        const copy = res.clone();
                        caches.open(APP_CACHE).then((c) => c.put("/", copy));
                    }
                    return res;
                })
                .catch(() => caches.match("/", { ignoreSearch: true })),
        );
        return;
    }

    if (FONT_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(FONT_CACHE, request));
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(staleWhileRevalidate(APP_CACHE, request));
    }
});

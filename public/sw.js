/* Retired service worker. Earlier builds installed an offline cache here;
 * this version clears that cache and unregisters itself so devices that
 * installed it go back to plain network loading. */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.filter((k) => k.startsWith("gitnaadu-")).map((k) => caches.delete(k)));
            await self.registration.unregister();
        })(),
    );
});

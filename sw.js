const VERSION = 'aah-v4';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const THREE_MODULE = 'https://unpkg.com/three@0.160.0/build/three.module.js';
const FONT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Anton&family=Jersey+25&family=Jim+Nightshade&display=swap';
const SHELL_FILES = [
  './',
  './index.html',
  './assets/css/styles.css',
  './assets/js/game.js',
  './manifest.webmanifest',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    await shell.addAll(SHELL_FILES);
    const assets = await caches.open(ASSET_CACHE);
    for (const url of [THREE_MODULE, FONT_STYLESHEET]) {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        await assets.put(url, response.clone());
        if (url === FONT_STYLESHEET) {
          const css = await response.text();
          const fontFaces = Array.from(css.matchAll(/@font-face\s*{([^}]+)}/g), match => match[1]);
          const fontUrls = [...new Set(fontFaces
            .filter(face => /unicode-range:\s*U\+0000-00FF/i.test(face))
            .map(face => face.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1])
            .filter(Boolean))];
          const results = await Promise.allSettled(fontUrls.map(async fontUrl => {
            const fontResponse = await fetch(fontUrl);
            if (!fontResponse.ok) throw new Error(`Request failed with status ${fontResponse.status}`);
            await assets.put(fontUrl, fontResponse);
          }));
          results.forEach((result, index) => {
            if (result.status === 'rejected') console.warn('[pwa] font could not be cached:', fontUrls[index], result.reason);
          });
        }
      } catch (error) {
        console.warn('[pwa] resource could not be cached for offline use:', url, error);
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => name.startsWith('aah-') && name !== SHELL_CACHE && name !== ASSET_CACHE)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const local = url.origin === self.location.origin;
  const cacheableExternal = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname);
  if (!local && !cacheableExternal) return;

  event.respondWith((async () => {
    const cache = await caches.open(local ? SHELL_CACHE : ASSET_CACHE);
    if (request.mode !== 'navigate') {
      const cached = await cache.match(request);
      if (cached) return cached;
    }

    try {
      const response = await fetch(request);
      if (response.ok && response.type !== 'opaque') {
        try {
          await cache.put(request, response.clone());
        } catch (error) {
          console.warn('[pwa] resource could not be cached:', request.url, error);
        }
      }
      return response;
    } catch (error) {
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      const cached = await cache.match(request);
      if (cached) return cached;
      throw error;
    }
  })());
});

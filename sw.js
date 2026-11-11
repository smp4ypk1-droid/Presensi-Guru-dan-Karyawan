// Service Worker — Presensi SMP 1 YPK
// Naikkan VERSION setiap kali Anda mengubah file aplikasi agar HP mengambil versi baru.
const VERSION = 'presensi-v2.0.0';
const APP_SHELL = ['./', './index.html', './app.js', './config.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // API (POST) tidak pernah di-cache
  const url = new URL(req.url);
  if (url.hostname.includes('google')) return;            // Apps Script / Drive langsung ke jaringan

  // Model wajah & library CDN: cache-first (besar dan jarang berubah)
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.open(VERSION + '-cdn').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // File aplikasi & Tailwind: network-first, fallback cache (agar update cepat terasa)
  e.respondWith(fetch(req).then(res => {
    if (res.ok && (url.origin === location.origin || url.hostname === 'cdn.tailwindcss.com')) {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
    }
    return res;
  }).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
});

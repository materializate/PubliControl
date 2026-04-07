/**
 * sw.js — Service Worker de ANUNCIOS.TV
 * Estrategia: Cache-first para assets estáticos,
 *             Network-first para peticiones a Supabase.
 */

const CACHE_NAME = 'anuncios-tv-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './src/style.css',
  './src/config.js',
  './src/channels.js',
  './src/db.js',
  './src/app.js',
  './src/sw-register.js',
  './icons/icon-72.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

/* ── Install ─────────────────────────────────────────────── */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

/* ── Activate ────────────────────────────────────────────── */
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/* ── Fetch ───────────────────────────────────────────────── */
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Network-first for Supabase API calls
  if (url.hostname.endsWith('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request)
      )
    );
    return;
  }

  // Cache-first for everything else
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return response;
      });
    }).catch(() => {
      // Offline fallback for navigation
      if (e.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});

/* ── Push notifications (future use) ────────────────────── */
self.addEventListener('push', (e) => {
  const data = e.data?.json() || {};
  e.waitUntil(
    self.registration.showNotification(data.title || '📺 Anuncios.TV', {
      body:    data.body   || 'Hay novedades en un canal',
      icon:    './icons/icon-192.png',
      badge:   './icons/icon-72.png',
      vibrate: [200, 100, 200],
      data:    { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || '/'));
});

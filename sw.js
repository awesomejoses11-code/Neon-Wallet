// Minimal Service Worker - offline support only
const CACHE_NAME = 'Neon Wallet';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Just pass through - don't intercept
  return;
});

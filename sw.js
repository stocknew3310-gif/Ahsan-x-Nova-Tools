/* ============================================
   AHSAN × NOVA — Service Worker v1.0
   Offline First + Background Sync
   Works on Vercel
   ============================================ */

const CACHE_VERSION = 'ahnova-v1.0.1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const TOOLS_CACHE = `${CACHE_VERSION}-tools`;
const IMAGES_CACHE = `${CACHE_VERSION}-images`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/sw.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-brands-400.woff2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-regular-400.woff2'
];

const CACHE_TIMEOUT = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const url of STATIC_ASSETS) {
        try { await cache.add(new Request(url, { cache: 'reload' })); }
        catch (e) { console.warn('[SW] Skip:', url); }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('ahnova-') && ![STATIC_CACHE, TOOLS_CACHE, IMAGES_CACHE, RUNTIME_CACHE, API_CACHE].includes(k))
        .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol === 'chrome-extension:') return;

  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('identitytoolkit.googleapis.com') ||
      url.hostname.includes('securetoken.googleapis.com')) {
    event.respondWith(networkFirstWithCache(req, API_CACHE, 500));
    return;
  }

  if (req.destination === 'image' ||
      /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(url.pathname) ||
      url.hostname.includes('i.ibb.co') ||
      url.hostname.includes('qrserver.com')) {
    event.respondWith(cacheFirstWithFallback(req, IMAGES_CACHE));
    return;
  }

  if (req.destination === 'style' || req.destination === 'script' ||
      req.destination === 'font' || req.destination === 'document') {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(appShellStrategy(req));
    return;
  }

  event.respondWith(cacheFirstWithFallback(req, RUNTIME_CACHE));
});

async function cacheFirstWithFallback(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetchWithTimeout(request, CACHE_TIMEOUT);
    if (response && response.status === 200 && response.type !== 'opaque') {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) { return offlineFallback(request); }
}

async function networkFirstWithCache(request, cacheName, timeoutMs = 5000) {
  try {
    const response = await fetchWithTimeout(request, timeoutMs);
    if (response && response.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    return cached || offlineFallback(request);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

async function appShellStrategy(request) {
  const cache = await caches.open(STATIC_CACHE);
  
  // 1. Pehle try karo ke network se aaye
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    // 2. Agar net nahi hai, toh cache se index.html uthao
    let cached = await cache.match(request);
    if (cached) return cached;
    
    // 3. Agar request URL match nahi hui (jaise /tools), toh index.html dikhao
    cached = await cache.match('/index.html');
    if (cached) return cached;
    
    cached = await cache.match('/');
    if (cached) return cached;
    
    // 4. Agar cache me kuch nahi hai, toh offline page dikhao
    return offlinePage();
  }
}

function fetchWithTimeout(request, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

function offlineFallback(request) {
  if (request.destination === 'image') {
    return new Response(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="#1e1b4b" width="100" height="100"/><text x="50" y="50" fill="#a855f7" text-anchor="middle" dy=".3em" font-size="30">🔌</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
  return offlinePage();
}

function offlinePage() {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:sans-serif;background:linear-gradient(135deg,#0f0a2b,#4c1d95);color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center}.box{max-width:400px}.icon{font-size:64px;margin-bottom:20px}h1{font-size:24px;font-weight:800;margin-bottom:12px}p{font-size:14px;opacity:.7;line-height:1.6;margin-bottom:24px}button{padding:12px 28px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;font-weight:700;cursor:pointer}</style>
    </head><body><div class="box"><div class="icon">📡</div><h1>You're Offline</h1><p>No internet connection. Cached tools may still work.</p><button onclick="location.reload()">Try Again</button></div></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

const SYNC_TAG = 'ahnova-sync';
const DB_NAME = 'ahnova-offline';
const STORE_NAME = 'sync-queue';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function queueAction(action) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await tx.objectStore(STORE_NAME).add({ ...action, queuedAt: Date.now(), attempts: 0 });
    return true;
  } catch (e) { return false; }
}

async function processSyncQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const all = await store.getAll();
    if (!all.length) return;
    for (const action of all) {
      try {
        const success = await executeAction(action);
        if (success) await store.delete(action.id);
        else {
          action.attempts = (action.attempts || 0) + 1;
          if (action.attempts >= 3) await store.delete(action.id);
          else await store.put(action);
        }
      } catch (e) { action.attempts = (action.attempts || 0) + 1; await store.put(action); }
    }
    const clients = await self.clients.matchAll();
    clients.forEach(client => client.postMessage({ type: 'SYNC_COMPLETE', count: all.length }));
  } catch (e) {}
}

async function executeAction(action) {
  switch (action.type) {
    case 'ANALYTICS_EVENT':
      try { await fetch('/api/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action.payload) }); return true; }
      catch (e) { return false; }
    default: return true;
  }
}

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};
  switch (type) {
    case 'SKIP_WAITING': self.skipWaiting(); break;
    case 'CACHE_TOOL': cacheToolContent(payload.toolId, payload.content, payload.type); break;
    case 'CACHE_URL_TOOL': cacheURLTool(payload.toolId, payload.url); break;
    case 'QUEUE_ACTION': queueAction(payload).then(success => event.source?.postMessage({ type: 'QUEUE_RESULT', success })); break;
    case 'GET_CACHE_STATUS': getCacheStatus().then(status => event.source?.postMessage({ type: 'CACHE_STATUS', status })); break;
    case 'CLEAR_CACHE': clearAllCaches().then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' })); break;
    case 'SYNC_NOW': processSyncQueue(); break;
  }
});

async function cacheToolContent(toolId, content, type) {
  try {
    const cache = await caches.open(TOOLS_CACHE);
    const url = `/offline-tools/${toolId}.html`;
    await cache.put(url, new Response(content, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  } catch (e) {}
}

async function cacheURLTool(toolId, url) {
  try {
    const cache = await caches.open(TOOLS_CACHE);
    const response = await fetch(url, { mode: 'cors' });
    if (response.ok) await cache.put(`/offline-tools/${toolId}.html`, response);
  } catch (e) {}
}

async function getCacheStatus() {
  const [tools, images, runtime, api] = await Promise.all([
    caches.open(TOOLS_CACHE).then(c => c.keys()),
    caches.open(IMAGES_CACHE).then(c => c.keys()),
    caches.open(RUNTIME_CACHE).then(c => c.keys()),
    caches.open(API_CACHE).then(c => c.keys())
  ]);
  let estimate = { usage: 0, quota: 0 };
  if (navigator.storage && navigator.storage.estimate) estimate = await navigator.storage.estimate();
  return {
    toolsCount: tools.length, imagesCount: images.length, runtimeCount: runtime.length, apiCount: api.length,
    totalCached: tools.length + images.length + runtime.length + api.length,
    storageUsed: estimate.usage || 0, storageQuota: estimate.quota || 0, version: CACHE_VERSION
  };
}

async function clearAllCaches() {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('ahnova-')).map(k => caches.delete(k)));
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(processSyncQueue());
});

console.log('[SW] Loaded:', CACHE_VERSION);
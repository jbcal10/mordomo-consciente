// ============================================================
// MORDOMO CONSCIENTE — Service Worker
// Versão: 1.0.0
// Cache offline + atualização automática
// ============================================================

const CACHE_NAME = 'mordomo-v5';
const OFFLINE_URL = '/offline.html';

// Arquivos para cache imediato (app shell)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// ============================================================
// INSTALL — pré-cacheia o app shell
// ============================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS.map(url => {
        return new Request(url, { cache: 'reload' });
      })).catch(() => {
        // Ignora erros de assets externos (fonts, CDN)
        return cache.addAll(['/index.html', '/offline.html', '/manifest.json']);
      });
    })
  );
  self.skipWaiting();
});

// ============================================================
// ACTIVATE — limpa caches antigos
// ============================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ============================================================
// FETCH — estratégia Network First com fallback para cache
// ============================================================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignora requests não-HTTP e extensões do browser
  if (!request.url.startsWith('http')) return;

  // API Anthropic e Supabase — sempre network, nunca cache
  if (
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.com')
  ) {
    return; // Deixa o browser lidar normalmente
  }

  // Google Fonts — Cache First (raramente muda)
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
    );
    return;
  }

  // App Shell — Network First, fallback para cache, fallback para offline
  event.respondWith(
    fetch(request)
      .then(response => {
        // Salva resposta fresca no cache
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: tenta cache
        return caches.match(request).then(cached => {
          if (cached) return cached;
          // Se for navegação, mostra página offline
          if (request.mode === 'navigate') {
            return caches.match(OFFLINE_URL);
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ============================================================
// PUSH NOTIFICATIONS (base para futuras notificações)
// ============================================================
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const title = data.title || 'Mordomo Consciente';
  const options = {
    body: data.body || 'Você tem uma notificação.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Ver agora' },
      { action: 'close', title: 'Fechar' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(url));
  }
});

// ============================================================
// BACKGROUND SYNC (para salvar lançamentos offline)
// ============================================================
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncPendingTransactions());
  }
});

async function syncPendingTransactions() {
  // Futuramente: ler do IndexedDB e enviar ao Supabase
  console.log('[SW] Sincronizando transações pendentes...');
}

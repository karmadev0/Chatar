// sw.js - Versión optimizada para Chatar
const CACHE_NAME = 'chatar-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/chat.html',
  '/assets/css/chat-dark.css',
  '/assets/css/chat-light.css',
  '/assets/js/chat.js',
  '/assets/js/api.js',
  '/assets/image/default.jpg',
  '/icon-192x192.png',
  '/badge-72x72.png',
  '/manifest.json'
];

// Instalación y caching de recursos críticos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando recursos estáticos');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Limpieza de caches antiguos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Eliminando cache antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Manejo de notificaciones push
self.addEventListener('push', event => {
  console.log('[SW] Notificación push recibida', event);
  
  let notificationData;
  try {
    notificationData = event.data?.json();
  } catch (err) {
    console.error('[SW] Error parseando datos push:', err);
    notificationData = {
      title: 'Nueva notificación',
      body: 'Tienes una actualización en Chatar'
    };
  }

  const title = notificationData.title || 'Chatar';
  const body = notificationData.body 
    ? (notificationData.body.length > 100 
        ? notificationData.body.substring(0, 100) + '...' 
        : notificationData.body)
    : 'Nueva actividad en el chat';
    
  const options = {
    body,
    icon: notificationData.icon || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: notificationData.url 
        ? `${notificationData.url}${notificationData.url.includes('?') ? '&' : '?'}from=push`
        : '/chat.html?from=push',
      messageId: notificationData.messageId,
      timestamp: Date.now()
    },
    tag: 'chatar-notification',
    renotify: true,
    actions: notificationData.actions || [
      {
        action: 'view',
        title: 'Abrir chat'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Manejo de clics en notificaciones
self.addEventListener('notificationclick', event => {
  console.log('[SW] Click en notificación:', event.notification.data);
  
  event.notification.close();
  
  const url = event.notification.data?.url || '/chat.html';
  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then(windowClients => {
    // Buscar si ya hay una pestaña abierta con la URL del chat
    const matchingClient = windowClients.find(client => {
      return client.url.includes('chat.html');
    });

    if (matchingClient) {
      // Enfocar la pestaña existente
      return matchingClient.focus().then(client => {
        // Si hay un mensaje específico, desplazarse a él
        if (event.notification.data?.messageId && 'postMessage' in client) {
          client.postMessage({
            type: 'SCROLL_TO_MESSAGE',
            messageId: event.notification.data.messageId
          });
        }
        return client;
      });
    } else {
      // Abrir nueva pestaña si no existe
      return clients.openWindow(url);
    }
  });

  event.waitUntil(promiseChain);
});

// Manejo de mensajes desde la app
self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Estrategia Cache-First para recursos estáticos
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  const requestUrl = new URL(event.request.url);
  
  // Ignora solicitudes a la API y websockets
  if (requestUrl.pathname.startsWith('/api/') || 
      requestUrl.protocol === 'ws:' || 
      requestUrl.protocol === 'wss:') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Devuelve el recurso cacheado o haz fetch
        return response || fetch(event.request);
      })
      .catch(() => {
        // Fallback para páginas (SPA)
        if (event.request.mode === 'navigate') {
          return caches.match('/chat.html');
        }
      })
  );
});

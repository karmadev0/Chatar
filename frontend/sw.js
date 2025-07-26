// sw.js - Versión corregida para mostrar notificaciones
const CACHE_NAME = 'chatar-v1';

// Instalación
self.addEventListener('install', event => {
  console.log('[SW] Instalando...');
  self.skipWaiting();
});

// Activación
self.addEventListener('activate', event => {
  console.log('[SW] Activando...');
  event.waitUntil(clients.claim());
});

// ✅ CLAVE: Manejo de notificaciones push (CORREGIDO)
self.addEventListener('push', event => {
  console.log('[SW] Push recibido:', event);
  
  let notificationData;
  try {
    notificationData = event.data ? event.data.json() : {};
    console.log('[SW] Datos parseados:', notificationData);
  } catch (err) {
    console.error('[SW] Error parseando datos:', err);
    notificationData = {
      title: 'Nueva notificación',
      body: 'Tienes una actualización en Chatar'
    };
  }

  // ✅ IMPORTANTE: Configuración correcta de la notificación
  const title = notificationData.title || 'Chatar';
  const options = {
    body: notificationData.body || 'Nueva actividad en el chat',
    icon: notificationData.icon || '/icon-192x192.png',
    badge: '/badge-72x72.png',
    vibrate: [200, 100, 200],
    requireInteraction: true, // ✅ MANTIENE LA NOTIFICACIÓN VISIBLE
    silent: false, // ✅ ASEGURA QUE NO SEA SILENCIOSA
    data: {
      url: notificationData.url || '/chat.html',
      messageId: notificationData.messageId,
      timestamp: Date.now()
    },
    tag: 'chatar-mention', // ✅ AGRUPA NOTIFICACIONES
    renotify: true, // ✅ PERMITE MÚLTIPLES NOTIFICACIONES
    actions: [
      {
        action: 'view',
        title: '👀 Ver mensaje',
        icon: '/icon-view.png'
      },
      {
        action: 'dismiss',
        title: '✖️ Descartar',
        icon: '/icon-dismiss.png'
      }
    ]
  };

  console.log('[SW] Mostrando notificación:', title, options);

  // ✅ MOSTRAR LA NOTIFICACIÓN (esto es lo que faltaba)
  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => {
        console.log('[SW] ✅ Notificación mostrada correctamente');
      })
      .catch(err => {
        console.error('[SW] ❌ Error mostrando notificación:', err);
      })
  );
});

// Manejo de clics en notificaciones
self.addEventListener('notificationclick', event => {
  console.log('[SW] Click en notificación:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return; // Solo cerrar
  }

  const url = event.notification.data?.url || '/chat.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Buscar ventana existente
        for (let client of clientList) {
          if (client.url.includes('chat.html') && 'focus' in client) {
            return client.focus();
          }
        }
        // Abrir nueva ventana
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Manejo básico de fetch (opcional)
self.addEventListener('fetch', event => {
  // Solo para recursos estáticos
  if (event.request.method !== 'GET' || 
      event.request.url.includes('/api/') ||
      event.request.url.includes('socket.io')) {
    return;
  }
});

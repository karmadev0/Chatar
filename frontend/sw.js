// sw.js (en la raíz de tu frontend)
self.addEventListener('push', function(event) {
  console.log('[Service Worker] Push recibido:', event);
  
  if (event.data) {
    const data = event.data.json();
    console.log('[Service Worker] Datos del push:', data);
    
    const options = {
      body: data.body || 'Nueva notificación',
      icon: data.icon || '/icon-192x192.png',
      badge: '/badge-72x72.png',
      data: {
        url: data.url || '/chat'
      },
      requireInteraction: true, // Mantiene la notificación visible
      tag: 'chatar-notification'
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Chatar', options)
    );
  }
});

// Manejar click en la notificación
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] Click en notificación:', event);
  
  event.notification.close();
  
  const url = event.notification.data?.url || '/chat';
  
  event.waitUntil(
    clients.matchAll({type: 'window'}).then(clientList => {
      // Si ya hay una ventana abierta, enfocarla
      for (let client of clientList) {
        if (client.url.includes('localhost:3000') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

import webpush from 'web-push';
import { User } from './models/User.js'; // Asegúrate de importar tu modelo User

// Configuración VAPID (mejor práctica: usa variables de entorno)
const vapidKeys = {
  subject: 'mailto:tu@email.com',
  publicKey: 'BHvRcnpdYwT_3ZO66SNatTYjAfaG8uMoCITtdkv7XYMkLpY2YUw7m3V087VP8Bzx1C7s8k-JGKUQwSDfexsvImU',
  privateKey: 'aO5aM9VQMBkYWW-JCExLBvPlW4MxjeFUCeJnwKF8A68'
};

webpush.setVapidDetails(
  vapidKeys.subject,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

/**
 * Envía una notificación push y maneja errores avanzados
 * @param {Object} subscription - Suscripción del usuario
 * @param {Object} payload - Contenido de la notificación
 * @param {string} [userId] - ID del usuario (opcional para manejo de errores)
 */
export async function sendPushNotification(subscription, payload, userId = null) {
  try {
    // Validación básica
    if (!subscription?.endpoint || !payload) {
      throw new Error('Suscripción o payload inválidos');
    }

    // Enviar notificación
    await webpush.sendNotification(subscription, JSON.stringify({
      title: payload.title || 'Nueva notificación',
      body: payload.body || 'Tienes una actualización',
      url: payload.url || '/',
      icon: payload.icon || '/icon-192x192.png',
      // Campos adicionales para el SW
      timestamp: Date.now()
    }));

    console.log(`📩 Notificación enviada a ${userId || 'usuario'}`, {
      endpoint: subscription.endpoint.slice(0, 30) + '...'
    });

  } catch (err) {
    console.error(`❌ Error enviando notificación a ${userId || 'usuario'}:`, {
      error: err.message,
      statusCode: err.statusCode,
      endpoint: subscription?.endpoint
    });

    // Manejo específico de errores
    if (err.statusCode === 410 && userId) { // Suscripción expirada
      await User.findByIdAndUpdate(userId, {
        $unset: { pushSubscription: 1 },
        $set: { 'notificationSettings.pushEnabled': false }
      });
      console.log(`♻️ Suscripción eliminada para usuario ${userId}`);
    }
  }
}

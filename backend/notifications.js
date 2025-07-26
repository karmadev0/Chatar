import webpush from 'web-push';
import { User } from './models/User.js';

// Configuración VAPID (usa tus claves actuales)
webpush.setVapidDetails(
  'mailto:soporte@tudominio.com',
  process.env.VAPID_PUBLIC_KEY || 'BHvRcnpdYwT_3ZO66SNatTYjAfaG8uMoCITtdkv7XYMkLpY2YUw7m3V087VP8Bzx1C7s8k-JGKUQwSDfexsvImU',
  process.env.VAPID_PRIVATE_KEY || 'aO5aM9VQMBkYWW-JCExLBvPlW4MxjeFUCeJnwKF8A68'
);

/**
 * Envía notificaciones push con manejo avanzado de errores
 * @param {Object} subscription - Datos de suscripción del usuario
 * @param {Object} options - Opciones de la notificación
 * @param {string} [userId] - ID del usuario (opcional para limpieza de suscripciones)
 */
export async function sendPushNotification(subscription, options = {}, userId = null) {
  // Validación básica
  if (!subscription?.endpoint) {
    console.error('❌ Error: Suscripción inválida');
    return { success: false, error: 'Invalid subscription' };
  }

  try {
    // Payload optimizado para notificaciones de chat
    const payload = {
      title: options.title || 'Nueva mención',
      body: typeof options.body === 'string' 
        ? (options.body.length > 100 ? options.body.substring(0, 100) + '...' : options.body)
        : 'Tienes una nueva mención',
      icon: options.icon || '/icon-192x192.png',
      badge: '/badge.png',
      vibrate: [200, 100, 200],
      data: {
        url: options.url ? `${options.url}${options.url.includes('?') ? '&' : '?'}ref=push` 
                         : 'https://chatar-m466.onrender.com/chat.html?ref=push',
        userId: options.userId,
        messageId: options.messageId
      },
      actions: options.actions || [
        {
          action: 'view',
          title: 'Abrir chat'
        }
      ]
    };

    // Configuración de envío
    const sendOptions = {
      contentEncoding: 'aes128gcm', // Estándar actual
      TTL: 24 * 60 * 60, // 24 horas de vida
      urgency: 'high' // Prioridad alta
    };

    await webpush.sendNotification(subscription, JSON.stringify(payload), sendOptions);

    console.log(`✅ Notificación enviada a ${userId || 'usuario'}`, {
      title: payload.title,
      endpoint: subscription.endpoint.slice(0, 30) + '...'
    });

    return { success: true };

  } catch (err) {
    console.error(`❌ Error en notificación a ${userId || 'usuario'}:`, {
      error: err.message,
      statusCode: err.statusCode,
      endpoint: subscription.endpoint
    });

    // Manejo específico de errores
    if (err.statusCode === 410 && userId) {
      await User.findByIdAndUpdate(userId, {
        $unset: { pushSubscription: 1 },
        $set: { 'notificationSettings.pushEnabled': false }
      });
      console.log(`♻️ Suscripción eliminada para usuario ${userId}`);
    }

    return { 
      success: false, 
      error: err.message,
      statusCode: err.statusCode 
    };
  }
}

/**
 * Envía notificación de mención en el chat
 * @param {string} fromUserId - ID del usuario que menciona
 * @param {string} toUserId - ID del usuario mencionado
 * @param {string} message - Texto del mensaje
 * @param {string} messageId - ID del mensaje
 */
export async function sendChatMentionNotification(fromUserId, toUserId, message, messageId) {
  try {
    const [fromUser, toUser] = await Promise.all([
      User.findById(fromUserId).select('username avatarURL'),
      User.findById(toUserId).select('pushSubscription notificationSettings')
    ]);

    // Verificar si el usuario quiere recibir notificaciones
    if (!toUser?.notificationSettings?.mentions || !toUser?.pushSubscription) {
      return { success: false, reason: 'Notifications disabled' };
    }

    // Enviar notificación personalizada
    return await sendPushNotification(
      toUser.pushSubscription,
      {
        title: `${fromUser.username} te mencionó`,
        body: message,
        url: `/chat.html?messageId=${messageId}`,
        icon: fromUser.avatarURL || '/icon-192x192.png',
        userId: toUserId,
        messageId
      },
      toUserId
    );

  } catch (err) {
    console.error('Error en sendChatMentionNotification:', err);
    return { success: false, error: err.message };
  }
}

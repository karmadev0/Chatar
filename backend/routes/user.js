import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { User } from '../models/User.js';
import verifyToken from '../middlewares/auth.js';
import upload from '../middlewares/upload.js';
import { uploadImage } from '../utils/cloudinary.js';
import { sendPushNotification } from '../notifications.js';

const router = express.Router();

// Helper para respuestas de error
const handleError = (res, err, context = 'Error del servidor') => {
  console.error(`[${context}]`, err);
  return res.status(500).json({ error: context });
};

// GET /api/users/mentions - Obtener notificaciones de menciones
router.get('/mentions', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('mentions notificationSettings');
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Si las notificaciones están desactivadas, devolver array vacío
    if (!user.notificationSettings?.mentions) {
      return res.json([]);
    }

    // Devolver menciones ordenadas por fecha (más recientes primero)
    const mentions = user.mentions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 20); // Límite de 20 menciones

    res.json(mentions);
  } catch (err) {
    console.error('Error getting mentions:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Obtener información del usuario
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    return res.json({
      id: user._id,
      username: user.username,
      avatarURL: user.avatarURL,
      createdAt: user.createdAt,
      isBanned: user.isBanned || false
    });
  } catch (err) {
    return handleError(res, err, 'Error al obtener usuario');
  }
});

// Actualizar avatar
router.put('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No se subió ninguna imagen' });
    }

    const imageUrl = await uploadImage(req.file.path);
    fs.unlinkSync(req.file.path);

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarURL: imageUrl },
      { new: true }
    ).select('-password');

    return res.json({
      message: 'Avatar actualizado',
      avatarURL: user.avatarURL
    });
  } catch (err) {
    return handleError(res, err, 'Error al subir avatar');
  }
});

// Actualizar nombre de usuario
router.put('/username', verifyToken, async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username || username.length < 3 || username.length > 16) {
      return res.status(400).json({ message: 'Nombre inválido (3-16 caracteres)' });
    }

    const existing = await User.findOne({ username });
    if (existing && existing._id.toString() !== req.user.id) {
      return res.status(400).json({ message: 'El nombre ya está en uso' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { username },
      { new: true }
    ).select('-password');

    return res.json({ 
      message: 'Nombre actualizado',
      username: user.username 
    });
  } catch (err) {
    return handleError(res, err, 'Error al cambiar nombre');
  }
});

// Cambiar contraseña
router.put('/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'Contraseña inválida. Mínimo 6 caracteres' 
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Contraseña actual incorrecta' });
    }

    user.password = newPassword;
    await user.save();

    return res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    return handleError(res, err, 'Error al cambiar contraseña');
  }
});

// Notificaciones Push
router.post('/save-subscription', verifyToken, async (req, res) => {
  try {
    const { subscription } = req.body;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ error: "Estructura de suscripción inválida" });
    }

    await User.findByIdAndUpdate(
      req.user.id,
      { 
        $set: { 
          pushSubscription: subscription,
          "notificationSettings.pushEnabled": true
        }
      },
      { new: true }
    );

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'Error al guardar suscripción');
  }
});

// Configuración de notificaciones
router.get('/notification-settings', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationSettings');
    return res.json(user.notificationSettings || { 
      mentions: true,
      browser: false,
      pushEnabled: false
    });
  } catch (err) {
    return handleError(res, err, 'Error obteniendo configuración');
  }
});

router.put('/notification-settings', verifyToken, async (req, res) => {
  try {
    const { mentions, browser, pushEnabled } = req.body;

    await User.findByIdAndUpdate(
      req.user.id,
      { 
        $set: { 
          "notificationSettings.mentions": mentions,
          "notificationSettings.browser": browser,
          "notificationSettings.pushEnabled": pushEnabled
        }
      }
    );

    return res.json({ success: true });
  } catch (err) {
    return handleError(res, err, 'Error actualizando configuración');
  }
});

// Ruta para enviar notificaciones push
router.post('/send-notification', verifyToken, async (req, res) => {
  try {
    const { title, body, url } = req.body;
    
    // 1. Obtener usuario con suscripción
    const user = await User.findById(req.user.id)
      .select('pushSubscription notificationSettings');
    
    // 2. Verificar si puede recibir notificaciones
    if (!user?.pushSubscription?.endpoint || !user.notificationSettings?.pushEnabled) {
      return res.status(400).json({ 
        error: "Usuario no suscrito o notificaciones desactivadas",
        code: "NOT_SUBSCRIBED"
      });
    }

    // 3. Enviar notificación
    await sendPushNotification(user.pushSubscription, {
      title: title || "Nueva notificación",
      body: body || "Tienes una actualización",
      url: url || "/chat",
      icon: "/icon-192x192.png"
    });

    // 4. Log para depuración
    console.log(`Notificación enviada a ${user._id}`, {
      endpoint: user.pushSubscription.endpoint.slice(0, 30) + '...'
    });

    return res.json({ success: true });
    
  } catch (err) {
    // Manejo especial para suscripciones expiradas
    if (err.statusCode === 410) {
      await User.findByIdAndUpdate(req.user.id, {
        $unset: { pushSubscription: 1 },
        $set: { "notificationSettings.pushEnabled": false }
      });
      return res.status(410).json({ error: "Suscripción expirada" });
    }
    return handleError(res, err, 'Error al enviar notificación');
  }
});

// GET /api/users/search?q=username - Buscar usuarios para menciones
router.get('/search', verifyToken, async (req, res) => {
  try {
    const query = req.query.q?.trim();
    
    if (!query || query.length < 1) {
      return res.json([]);
    }

    // Buscar usuarios que coincidan con el query (máximo 3)
    const users = await User.find({
      username: { $regex: query, $options: 'i' }, // Case insensitive
      isBanned: false,
      _id: { $ne: req.user.id } // Excluir al usuario actual
    })
    .select('username avatarURL')
    .limit(3)
    .sort({ username: 1 });

    res.json(users);
  } catch (err) {
    console.error('Error searching users:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// PUT /api/users/mentions/read - Marcar menciones como leídas
router.put('/mentions/read', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationSettings');
    
    // Solo marcar como leídas si las notificaciones están activadas
    if (user?.notificationSettings?.mentions) {
      await User.findByIdAndUpdate(
        req.user.id,
        { $set: { 'mentions.$[].isRead': true } }
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error marking mentions as read:', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Añade esto en users.js
router.post('/send-chat-notification', verifyToken, async (req, res) => {
  try {
    const { toUserId, message } = req.body;
    
    // 1. Obtener usuarios
    const [fromUser, toUser] = await Promise.all([
      User.findById(req.user.id).select('username'),
      User.findById(toUserId).select('pushSubscription notificationSettings username')
    ]);

    // 2. Verificar si puede recibir notificaciones
    if (!toUser?.pushSubscription?.endpoint || !toUser.notificationSettings?.pushEnabled) {
      return res.status(400).json({ 
        error: "Usuario no suscrito o notificaciones desactivadas"
      });
    }

    // 3. Enviar notificación personalizada
    await sendPushNotification(toUser.pushSubscription, {
      title: `${fromUser.username} te mencionó`,
      body: message.length > 100 ? message.substring(0, 100) + '...' : message,
      url: `/chat.html?mention=${message._id}`,
      icon: '/icon-192x192.png'
    });

    res.json({ success: true });
    
  } catch (err) {
    if (err.statusCode === 410) {
      await User.findByIdAndUpdate(toUserId, {
        $unset: { pushSubscription: 1 },
        $set: { "notificationSettings.pushEnabled": false }
      });
    }
    handleError(res, err, 'Error al enviar notificación de chat');
  }
});

export default router;

// backend/sockets/chat.js

import jwt from 'jsonwebtoken';
import { saveMessage } from '../controllers/message.controller.js';
import { User } from '../models/User.js';

export function configureChatSocket(io) {
  // Middleware de autenticación
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.warn('[socket] Token no proporcionado');
      return next(new Error('Token requerido'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('Usuario no encontrado'));
      }

      if (user.isBanned) {
        console.warn('[socket] Usuario baneado intentando conectar:', user.username);
        return next(new Error('Usuario baneado'));
      }

      socket.user = user;
      next();

    } catch (err) {
      console.warn('[socket] Token inválido');
      return next(new Error('Token inválido'));
    }
  });

  // Conexión socket activa
  io.on('connection', (socket) => {
    console.log('[socket] Cliente conectado:', socket.id, 'Usuario:', socket.user.username);

    // Intervalo de verificación en tiempo real (cada 10s)
    const banCheckInterval = setInterval(async () => {
      try {
        const refreshed = await User.findById(socket.user._id);
        if (refreshed?.isBanned) {
          console.warn(`[socket] Usuario baneado en vivo: ${refreshed.username}`);
          socket.emit('banned');
          socket.disconnect();
        }
      } catch (err) {
        console.error('[socket] Error al verificar estado de ban:', err);
      }
    }, 10000); // cada 10 segundos

    // Mensajes
    socket.on('chat message', async (data) => {
      if (!socket.user || socket.user.isBanned) return;

      console.log('[Servidor] ha llegado un mensaje a sockets');

      const text = typeof data === 'string' ? data : data.text;
      const tempId = typeof data === 'object' ? data.tempId : null;

      const saved = await saveMessage(socket.user.id, text);

      if (saved) {
        if (tempId) saved.tempId = tempId;
        io.emit('chat message', saved);
      }
    });

    // Desconexión
    socket.on('disconnect', () => {
      clearInterval(banCheckInterval);
      console.log('[socket] Cliente desconectado:', socket.id);
    });
  });
}

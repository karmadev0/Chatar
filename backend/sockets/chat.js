import jwt from 'jsonwebtoken';
import { saveMessage } from '../controllers/message.controller.js';
import { User } from '../models/User.js';

const typingUsers = new Map(); // socket.id -> { username, timeout }

export function configureChatSocket(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token requerido'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('Usuario no encontrado'));
      if (user.isBanned) return next(new Error('Usuario baneado'));
      socket.user = user;
      next();
    } catch {
      return next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log('[socket] Cliente conectado:', socket.id, 'Usuario:', socket.user.username);

    const banCheckInterval = setInterval(async () => {
      const refreshed = await User.findById(socket.user._id);
      if (refreshed?.isBanned) {
        socket.emit('banned');
        socket.disconnect();
      }
    }, 10000);

    // ---- TYPING ----
    socket.on('typing', (isTyping) => {
      if (!socket.user) return;

      if (isTyping) {
        // Si ya estaba escribiendo, reseteamos su timeout
        if (typingUsers.has(socket.id)) {
          clearTimeout(typingUsers.get(socket.id).timeout);
        }

        // Seteamos nuevo timeout de 3 segundos
        const timeout = setTimeout(() => {
          typingUsers.delete(socket.id);
          io.emit('typing', Array.from(typingUsers.values()).map(u => u.username));
        }, 3000);

        typingUsers.set(socket.id, { username: socket.user.username, timeout });
      } else {
        if (typingUsers.has(socket.id)) {
          clearTimeout(typingUsers.get(socket.id).timeout);
          typingUsers.delete(socket.id);
        }
      }

      io.emit('typing', Array.from(typingUsers.values()).map(u => u.username));
    });

    // ---- MENSAJES ----
    socket.on('chat message', async (data) => {
      if (!socket.user || socket.user.isBanned) return;
      const text = typeof data === 'string' ? data : data.text;
      const tempId = typeof data === 'object' ? data.tempId : null;

      const saved = await saveMessage(socket.user.id, text);
      if (saved) {
        if (tempId) saved.tempId = tempId;
        io.emit('chat message', saved);
      }

      // Eliminar de typing al enviar mensaje
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id).timeout);
        typingUsers.delete(socket.id);
        io.emit('typing', Array.from(typingUsers.values()).map(u => u.username));
      }
    });

    // ---- DESCONECTAR ----
    socket.on('disconnect', () => {
      clearInterval(banCheckInterval);
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id).timeout);
        typingUsers.delete(socket.id);
        io.emit('typing', Array.from(typingUsers.values()).map(u => u.username));
      }
    });
  });
}

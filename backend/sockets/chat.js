import jwt from 'jsonwebtoken';
import { saveMessage } from '../controllers/message.controller.js';
import { User } from '../models/User.js';

const typingUsers = new Map(); // socket.id
const userSockets = new Map(); // userId -> socket.id

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
    
    // Registrar socket del usuario para notificaciones
    userSockets.set(socket.user._id.toString(), socket.id);

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
        if (typingUsers.has(socket.id)) {
          clearTimeout(typingUsers.get(socket.id).timeout);
        }

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
      
      const text = typeof data === 'object' ? data.text : data;
      const replyTo = typeof data === 'object' ? data.replyTo : null;
      const tempId = typeof data === 'object' ? data.tempId : null;

      const saved = await saveMessage(socket.user.id, text, replyTo);
      if (saved) {
        if (tempId) saved.tempId = tempId;
        
        // Emitir mensaje a todos
        io.emit('chat message', saved);
        
        // Enviar notificaciones a usuarios mencionados
        if (saved.mentions && saved.mentions.length > 0) {
          for (const mention of saved.mentions) {
            // Verificar configuración de notificaciones del usuario mencionado
            const targetUser = await User.findById(mention.userId).select('notificationSettings');
            
            if (targetUser?.notificationSettings?.mentions !== false) {
              const mentionedSocketId = userSockets.get(mention.userId.toString());
              if (mentionedSocketId) {
                const mentionedSocket = io.sockets.sockets.get(mentionedSocketId);
                if (mentionedSocket) {
                  mentionedSocket.emit('mention notification', {
                    messageId: saved._id,
                    fromUsername: socket.user.username,
                    text: text.substring(0, 100),
                    createdAt: new Date()
                  });
                }
              }
            }
          }
        }
      }

      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id).timeout);
        typingUsers.delete(socket.id);
        io.emit('typing', Array.from(typingUsers.values()).map(u => u.username));
      }
    });

    // ---- DESCONECTAR ----
    socket.on('disconnect', () => {
      clearInterval(banCheckInterval);
      
      // Remover socket del mapa de usuarios
      userSockets.delete(socket.user._id.toString());
      
      if (typingUsers.has(socket.id)) {
        clearTimeout(typingUsers.get(socket.id).timeout);
        typingUsers.delete(socket.id);
        io.emit('typing', Array.from(typingUsers.values()).map(u => u.username));
      }
    });
  });
}

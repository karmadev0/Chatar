import jwt from 'jsonwebtoken';
import { saveMessage } from '../controllers/message.controller.js';

export function configureChatSocket(io) {
  io.on('connection', (socket) => {
    console.log('[socket] Cliente conectado:', socket.id);

    socket.on('authenticate', (token) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        socket.emit('authenticated');
      } catch {
        socket.emit('unauthorized');
      }
    });

    socket.on('chat message', async (text) => {
      if (!socket.user) return;

      const saved = await saveMessage(socket.user.id, text);
      if (saved) io.emit('chat message', saved);
    });

    socket.on('disconnect', () => {
      console.log('[socket] Cliente desconectado:', socket.id);
    });
  });
}

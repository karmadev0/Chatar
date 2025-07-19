// backend/sockets/chat.js

import jwt from 'jsonwebtoken';
import { saveMessage } from '../controllers/message.controller.js';

export function configureChatSocket(io) {
  // aqui aparece middle siii
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      console.warn('[socket] Token no proporcionado');
      return next(new Error('Token requerido'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      console.warn('[socket] Token inválido');
      return next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    console.log('[socket] Cliente conectado:', socket.id, 'Usuario:', socket.user.username);

    // manejo del mensaje enviado
    socket.on('chat message', async (data) => {
      console.log('[Servidor] ha llegado un mensaje a sockets');

      if (!socket.user) return;

      // Aceptamos tanto string como objeto para que no haga bum
      const text = typeof data === 'string' ? data : data.text;
      const tempId = typeof data === 'object' ? data.tempId : null;

      const saved = await saveMessage(socket.user.id, text);

      if (saved) {
        if (tempId) saved.tempId = tempId; // reenviamos tempId 
        io.emit('chat message', saved);    // frontend
      }
    });

    socket.on('disconnect', () => {
      console.log('[socket] Cliente desconectado:', socket.id);
    });
  });
}

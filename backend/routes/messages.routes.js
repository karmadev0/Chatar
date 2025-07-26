import express from 'express';
import verifyToken from '../middlewares/auth.js';
import { getMessages, saveMessage } from '../controllers/message.controller.js';

const router = express.Router();

// GET /api/messages?limit=32&skip=0
router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 32;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await getMessages(limit, skip);
    res.json(messages);
  } catch (err) {
    console.error('Error al obtener mensajes:', err);
    res.status(500).json({ error: 'Error del servidor.' });
  }
});

// POST /api/messages - Crear nuevo mensaje
// POST /api/messages - Versión optimizada
router.post('/', verifyToken, async (req, res) => {
  try {
    const { text, replyTo } = req.body;

    // Validaciones (se mantienen igual)
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ error: 'El mensaje no puede exceder 1000 caracteres' });
    }

    const result = await saveMessage(req.user.id, text, replyTo || null);

    // Emitir a Socket.IO
    if (req.app.get('io')) {
      req.app.get('io').emit('new_message', result);

      // Usar socketData.mentions para emitir a los mencionados
      if (result.socketData?.mentions) {
        result.socketData.mentions.forEach(userId => {
          req.app.get('io').to(`user_${userId}`).emit('new_mention', {
            messageId: result._id,
            from: req.user.id,
            text: result.text
          });
        });
      }
    }

    res.status(201).json(result);
  } catch (err) {
    console.error('Error en POST /messages:', err);
    res.status(500).json({ 
      error: err.message || 'Error del servidor al crear mensaje' 
    });
  }
});	


export default router;

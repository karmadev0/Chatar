import express from 'express';
import verifyToken from '../middlewares/auth.js';
import { getMessages } from '../controllers/message.controller.js';

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

export default router;

import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import verifyToken from '../middlewares/auth.js';

const router = express.Router();

// Ruta: GET /api/user/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password'); // Excluye la contraseña
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({
	    id: user._id,
	    username: user.username,
	    avatarURL: user.avatarURL,
	    createdAt: user.createdAt,
	    isBanned: user.isBanned || false, // Por si no existe el campo
    });
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

export default router;

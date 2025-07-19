import express from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import { User } from '../models/User.js';
import verifyToken from '../middlewares/auth.js';
import upload from '../middlewares/upload.js';
import { uploadImage } from '../utils/cloudinary.js';

const router = express.Router();

// === Obtener información del usuario ===
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    res.json({
      id: user._id,
      username: user.username,
      avatarURL: user.avatarURL,
      createdAt: user.createdAt,
      isBanned: user.isBanned || false
    });
  } catch (err) {
    console.error('Error al obtener usuario:', err);
    res.status(500).json({ message: 'Error del servidor' });
  }
});

// === Actualizar avatar del usuario ===
router.put('/avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se subió ninguna imagen.' });

    const imageUrl = await uploadImage(req.file.path);
    fs.unlinkSync(req.file.path); // Eliminar archivo temporal

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarURL: imageUrl },
      { new: true }
    ).select('-password');

    res.json({ message: 'Avatar actualizado.', avatarURL: user.avatarURL });
  } catch (err) {
    console.error('[Avatar Upload Error]', err);
    res.status(500).json({ message: 'Error al subir avatar.' });
  }
});

// === Cambiar nombre de usuario ===
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

    res.json({ message: 'Nombre actualizado', username: user.username });
  } catch (err) {
    console.error('[Actualizar username]', err);
    res.status(500).json({ message: 'Error al cambiar el nombre' });
  }
});

// === Cambiar contraseña ===
router.put('/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Contraseña inválida. Mínimo 6 caracteres.' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Comparamos qje este bien
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ message: 'Contraseña actual incorrecta' });
    }

    user.password = newPassword;
    await user.save(); // guardamos

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('[Actualizar contraseña]', err);
    res.status(500).json({ message: 'Error al cambiar la contraseña' });
  }
});

export default router;

// controllers/user.controller.js

import { User } from '../models/User.js';
import bcrypt from 'bcryptjs';

/**
 * Cambiar el nombre de usuario
 */
export async function updateUsername(req, res) {
  const { username } = req.body;

  if (!username || username.length < 3 || username.length > 16) {
    return res.status(400).json({ message: 'Nombre inválido (3-16 caracteres)' });
  }

  try {
    const existing = await User.findOne({ username });
    if (existing && existing._id.toString() !== req.user.id) {
      return res.status(409).json({ message: 'Ese nombre ya está en uso' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { username },
      { new: true }
    ).select('-password');

    res.json({ message: 'Nombre actualizado', user });
  } catch (err) {
    console.error('[updateUsername] Error:', err);
    res.status(500).json({ message: 'Error al actualizar nombre' });
  }
}

/**
 * Cambiar contraseña
 */
export async function updatePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: 'Datos inválidos o contraseña débil' });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match) return res.status(401).json({ message: 'Contraseña actual incorrecta' });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('[updatePassword] Error:', err);
    res.status(500).json({ message: 'Error al cambiar la contraseña' });
  }
}

/**
 * Cambiar avatar (URL desde Imgur)
 */
export async function updateAvatar(req, res) {
  const { avatarURL } = req.body;

  if (!avatarURL || typeof avatarURL !== 'string' || !avatarURL.startsWith('http')) {
    return res.status(400).json({ message: 'URL de avatar inválida' });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatarURL },
      { new: true }
    ).select('-password');

    res.json({ message: 'Avatar actualizado', user });
  } catch (err) {
    console.error('[updateAvatar] Error:', err);
    res.status(500).json({ message: 'Error al cambiar el avatar' });
  }
}

import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const router = express.Router();

// backend/api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    if (!username || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Faltan campos.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden.' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Nombre de usuario ya en uso.' });
    }

    await User.create({ username, password });

    res.status(201).json({ message: 'Usuario creado correctamente.' });
  } catch (err) {
    console.error('[REGISTER ERROR]', err);
    res.status(500).json({ error: 'Error en el servidor.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: 'Usuario y contraseña son requeridos'
    });
  }

  try {
    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(401).json({
        message: 'El usuario no existe'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        message: 'La contraseña es incorrecta'
      });
    }

    const token = jwt.sign(
      {
        id: user._id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '1h',
        issuer: 'chatar',
      }
    );

    res.json({
      message: 'Autenticación exitosa',
      token,
      user: {
        id: user._id,
        username: user.username,
        avatarURL: user.avatarURL
      }
    });

  } catch (error) {
    console.error('[AUTH ERROR]', error);
    res.status(500).json({
      message: 'Error en el servidor. Intenta más tarde.'
    });
  }
});

export default router;

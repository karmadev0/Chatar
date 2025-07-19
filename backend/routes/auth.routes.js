import express from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

const router = express.Router();

// 📥 Registro
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password)
      return res.status(400).json({ error: 'Faltan campos.' });

    const existingUser = await User.findOne({ username });
    if (existingUser)
      return res.status(409).json({ error: 'Nombre de usuario ya en uso.' });

    const newUser = await User.create({ username, password }); // 👈 sin hash manual

    res.status(201).json({ message: 'Usuario creado correctamente.' });
  } catch (err) {
    console.error('[REGISTER ERROR]', err.message);
    res.status(500).json({ error: 'Error en el servidor.' });
  }
});

// 🔑 Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      message: 'Usuario y contraseña son requeridos'
    });
  }

  try {
    const user = await User.findOne({ username }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        message: 'Credenciales inválidas'
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
      message: 'Error en el servidor'
    });
  }
});

export default router;

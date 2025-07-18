import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/db.js';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.js';
dotenv.config();

// Conexión a MongoDB antes de iniciar servidor
await connectDB();

// Inicialización básica
const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(express.json());
app.use('/api/user', userRoutes);
app.use('/api/auth', authRoutes);
app.use(cookieParser());
app.use(express.static('public'));

// Rutas básicas
app.get('/', (req, res) => {
  res.send('🔥 Backend funcionando correctamente 🔥');
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('[socket] Cliente conectado:', socket.id);

  socket.on('authenticate', (token) => {
    // Aquí validaremos el token más adelante
    console.log('[socket] Token recibido:', token);
    socket.emit('authenticated');
  });

  socket.on('chat message', (msg) => {
    console.log('[socket] Mensaje recibido:', msg);
    io.emit('chat message', msg); // retransmitimos a todos
  });

  socket.on('disconnect', () => {
    console.log('[socket] Cliente desconectado:', socket.id);
  });
});

// Puerto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});

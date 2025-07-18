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
import { configureChatSocket } from './sockets/chat.js';
import messageRoutes from './routes/messages.routes.js';
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
app.use('/api/messages', messageRoutes);
app.use(cookieParser());
app.use(express.static('public'));

// Rutas básicas
app.get('/', (req, res) => {
  res.send('🔥 Backend funcionando correctamente 🔥');
});

// Socket.IO
configureChatSocket(io);

// Puerto
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});

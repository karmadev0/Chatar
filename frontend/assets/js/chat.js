// frontend/assets/js/chat.js

console.log('[chat.js] Archivo cargado correctamente ✅');

import { fetchWithToken } from './api.js';
import { setupUI } from './ui.js';

const logoutBtn = document.getElementById('logout-button');
const usernameDisplay = document.getElementById('username');
const avatarImg = document.getElementById('avatar');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const renderedMessages = new Set();

let socket;
let skip = 0;
const limit = 20;
let allLoaded = false;
let loading = false;

/* ======= 🌓 SISTEMA DE TEMAS ======= */
function applyTheme() {
  const theme = localStorage.getItem('theme') || 'dark'; // default oscuro
  const themeLink = document.getElementById('theme-link');
  if (themeLink) {
    themeLink.href = `./assets/css/chat-${theme}.css`;
    console.log(`[Tema] Tema aplicado: ${theme}`);
  }
}
applyTheme(); // Aplicamos al cargar JS

/* ======= 💬 RENDERIZAR MENSAJES ======= */
function renderMessage(msg, appendToEnd = true) {
  const msgId = msg._id;
  if (renderedMessages.has(msgId)) {
    console.log('[renderMessage] Duplicado ignorado:', msgId);
    return;
  }

  renderedMessages.add(msgId);

  const div = document.createElement('div');
  div.className = 'message';
  div.setAttribute('data-id', msgId);
  div.innerHTML = `<strong>${msg.username}</strong>: ${msg.text}`;

  if (appendToEnd) {
    messagesContainer.appendChild(div);
  } else {
    messagesContainer.prepend(div);
  }

  if (appendToEnd) {
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }
}

/* ======= 📤 ENVÍO DE MENSAJES ======= */
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  console.log('[Formulario] Enviando mensaje:', text);
  socket.emit('chat message', text);
  messageInput.value = '';
});

/* ======= 👤 USUARIO ACTUAL ======= */
async function loadUser() {
  try {
    const res = await fetchWithToken('/api/user/me');
    if (!res.ok) throw new Error('Token inválido');

    const user = await res.json();
    usernameDisplay.textContent = user.username;
    avatarImg.src = user.avatarURL || '/assets/avatars/default.png';

    document.getElementById('profile-username').textContent = user.username;
    document.getElementById('profile-id').textContent = user.id;
    document.getElementById('profile-created').textContent = new Date(user.createdAt).toLocaleString();
    document.getElementById('profile-status').textContent = user.isBanned ? 'Baneado' : 'Activo';
    document.getElementById('profile-avatar').src = user.avatarURL || '/assets/avatars/default.png';

  } catch (err) {
    console.error('[loadUser] Sesión inválida:', err);
    localStorage.removeItem('token');
    window.location.href = '/index.html';
  }
}

/* ======= 🕓 CARGAR MENSAJES HISTÓRICOS ======= */
async function loadMessages() {
  if (loading || allLoaded) return;
  loading = true;

  try {
    const res = await fetchWithToken(`/api/messages?limit=${limit}&skip=${skip}`);
    const msgs = await res.json();

    if (!Array.isArray(msgs)) throw new Error('Formato inesperado');

    if (msgs.length < limit) allLoaded = true;
    skip += msgs.length;

    const ordered = msgs.reverse();
    ordered.forEach(msg => renderMessage(msg, true));

    if (skip === msgs.length) {
      requestAnimationFrame(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      });
    }
  } catch (err) {
    console.error('Error al cargar mensajes:', err);
  } finally {
    loading = false;
  }
}

/* ======= ⬆️ Scroll infinito hacia arriba ======= */
messagesContainer.addEventListener('scroll', () => {
  if (messagesContainer.scrollTop === 0) {
    loadMessages();
  }
});

/* ======= 🔐 LOGOUT ======= */
logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('token');
  window.location.href = '/index.html';
});

/* ======= 🔌 CONEXIÓN SOCKET.IO ======= */
function connectSocket() {
  socket = io({
    auth: {
      token: localStorage.getItem('token'),
    },
  });

  socket.on('connect', () => {
    console.log('[Socket] Conectado con ID:', socket.id);
    socket.emit('authenticate', localStorage.getItem('token'));
  });

  socket.on('authenticated', () => {
    console.log('[Socket] Autenticado correctamente');
  });

  socket.on('unauthorized', () => {
    console.error('[Socket] Token inválido. Redirigiendo...');
    localStorage.removeItem('token');
    window.location.href = '/index.html';
  });

  socket.on('chat message', (msg) => {
    console.log('[Socket] Mensaje recibido:', msg);
    renderMessage(msg, true);
  });

  socket.on('disconnect', () => {
    console.warn('[Socket] Desconectado');
  });
}

/* ======= 🚀 INICIALIZACIÓN ======= */
setupUI();
loadUser();
loadMessages();
connectSocket();

// frontend/assets/js/chat.js

import { fetchWithToken } from './api.js';

// Elementos del DOM
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const logoutBtn = document.getElementById('logout-btn');
const usernameDisplay = document.getElementById('username');
const avatarImg = document.getElementById('avatar');
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

let socket;

// === Cargar datos del usuario ===
async function loadUser() {
    try {
        const res = await fetchWithToken('/api/user/me');
        if (!res.ok) throw new Error('Token inválido');
        
        const user = await res.json();
        usernameDisplay.textContent = user.username;
        avatarImg.src = user.avatarURL || '/assets/avatars/default.png';
    } catch (err) {
        console.error('[loadUser] Sesión inválida:', err);
        window.location.href = '/index.html';
    }
}

// === Mostrar mensajes ===
function renderMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<strong>${msg.username}</strong>: ${msg.text}`;
    messagesContainer.appendChild(div);
}

// === Enviar mensaje ===
messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    
    socket.emit('chat message', { text });
    messageInput.value = '';
});

// === Sidebar toggle ===
menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('active');
});

// === Logout ===
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/index.html';
});

// === Scroll infinito ===
let skip = 0;
const limit = 20;
let allLoaded = false;

async function loadMessages() {
    if (allLoaded) return;
    
    const res = await fetchWithToken(`/api/messages?limit=${limit}&skip=${skip}`);
    const msgs = await res.json();
    
    if (msgs.length < limit) allLoaded = true;
    msgs.reverse().forEach(renderMessage);
    skip += limit;
}

messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop === 0) {
        loadMessages();
    }
});

// === Inicializar socket ===
function connectSocket() {
    socket = io({
        auth: {
            token: localStorage.getItem('token'),
        },
    });

    socket.on('connect', () => {
        console.log('[Socket] Conectado');
    });

    socket.on('authenticated', () => {
        console.log('[Socket] Autenticado');
    });

    socket.on('chat message', (msg) => {
        renderMessage(msg);
    });

    socket.on('disconnect', () => {
        console.warn('[Socket] Desconectado');
    });
}

// === Iniciar aplicación ===
loadUser();
loadMessages();
connectSocket();

// frontend/assets/js/chat.js

console.log('[chat.js] Archivo cargado correctamente ✅');

import { fetchWithToken } from './api.js';
import { setupUI } from './ui.js';

// ======== SELECTORES DEL DOM ========
const logoutBtn = document.getElementById('logout-button');
const usernameDisplay = document.getElementById('username');
const avatarImg = document.getElementById('avatar');
const messagesWrapper = document.getElementById('messages-wrapper');
const messagesContainer = document.getElementById('messages');        
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const renderedMessages = new Set();

// ======== VARIABLES GLOBALES ========
let socket;
let skip = 0;
let limit = 16;
let allLoaded = false;
let loading = false;
let currentUser = null;
let canSend = true;
let isUserScrolling = false;
let scrollTimeout = null;

// ======== SISTEMA DE TEMAS ========
function applyTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    const themeLink = document.getElementById('theme-link');
    
    if (themeLink) {
        themeLink.href = `./assets/css/chat-${theme}.css`;
        console.log(`[Tema] Tema aplicado: ${theme}`);
    }
}

// ======== UTIL: LINKIFY ========
function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

// ======== UTIL: INSERTAR SALTOS SUAVES EN PALABRAS LARGAS ========
function softenLongWords(text, maxLen = 60) {
    return text.replace(
        new RegExp(`(\\S{${maxLen}})`, 'g'),
        '$1\u200B'
    );
}

// ======== DETECTAR SI ESTÁ CERCA DEL FONDO ========
function isNearBottom(threshold = 100) {
    return messagesWrapper.scrollHeight - messagesWrapper.scrollTop - messagesWrapper.clientHeight <= threshold;
}

// ======== SCROLL AUTOMÁTICO AL FONDO ========
function scrollToBottom(smooth = false) {
    // Asegurar que el scroll llegue realmente al fondo
    const scrollToMaxHeight = () => {
        const maxScroll = messagesWrapper.scrollHeight - messagesWrapper.clientHeight;
        messagesWrapper.scrollTop = maxScroll;
        console.log(`[scrollToBottom] Scroll establecido a: ${messagesWrapper.scrollTop}px (max: ${maxScroll}px)`);
    };

    if (smooth) {
        messagesWrapper.scrollTo({
            top: messagesWrapper.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        scrollToMaxHeight();
        // Verificar que realmente llegó al fondo y corregir si es necesario
        requestAnimationFrame(() => {
            const currentMax = messagesWrapper.scrollHeight - messagesWrapper.clientHeight;
            if (messagesWrapper.scrollTop < currentMax - 5) {
                console.log('[scrollToBottom] Corrigiendo posición...');
                scrollToMaxHeight();
            }
        });
    }
}

// ======== RENDERIZAR MENSAJES ========
function renderMessage(msg, addToTop = false) {
    const msgId = msg._id;
    if (renderedMessages.has(msgId)) return;
    renderedMessages.add(msgId);

    let content = softenLongWords(msg.text);
    content = linkify(content);

    const div = document.createElement('div');
    div.className = 'message';
    div.setAttribute('data-id', msgId);

    const time = new Date(msg.createdAt || Date.now())
        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const avatar = msg.avatarURL || '/assets/image/default.jpg';
    div.innerHTML = `
        <div class="message-header">
            <img src="${avatar}" class="avatar" />
            <div class="message-info">
                <strong>${msg.username}</strong>
                <span class="timestamp">${time}</span>
            </div>
        </div>
        <p class="message-content">${content}</p>
    `;

    if (addToTop) {
        // Para historial: agregar ARRIBA (mensajes más antiguos)
        messagesContainer.prepend(div);
    } else {
        // Para mensajes nuevos: agregar ABAJO (lo más reciente)
        messagesContainer.appendChild(div);
    }
}

// ======== ENVÍO DE MENSAJES ========
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canSend) return;
    const text = messageInput.value.trim();
    if (!text) return;
    if (text.length > 1024) {
        alert('El mensaje no puede superar los 1024 caracteres.');
        return;
    }

    socket.emit('chat message', text);
    messageInput.value = '';
    canSend = false;
    setTimeout(() => { canSend = true; }, 1000);
});

// ======== USUARIO ACTUAL ========
async function loadUser() {
    try {
        const res = await fetchWithToken('/api/user/me');
        if (!res.ok) throw new Error('Token inválido');

        const user = await res.json();
        currentUser = user;

        if (user.isBanned) {
            alert('Tu cuenta ha sido baneada. Contacta con el soporte si crees que fue un error.');
            localStorage.removeItem('token');
            window.location.href = '/index.html';
            return;
        }

        usernameDisplay.textContent = user.username;
        avatarImg.src = user.avatarURL || '/assets/image/default.jpg';

        document.getElementById('profile-username').textContent = user.username;
        document.getElementById('profile-id').textContent = user.id;
        document.getElementById('profile-created').textContent = new Date(user.createdAt).toLocaleString();
        document.getElementById('profile-status').textContent = user.isBanned ? 'Baneado' : 'Activo';
        document.getElementById('profile-avatar').src = user.avatarURL || '/assets/image/default.jpg';

    } catch (err) {
        console.error('[loadUser] Sesión inválida:', err);
        localStorage.removeItem('token');
        window.location.href = '/index.html';
    }
}

// ======== CARGAR MENSAJES HISTÓRICOS ========
async function loadMessages(isInitialLoad = false) {
    if (loading) return;
    loading = true;

    console.log(`[loadMessages] Cargando mensajes... Skip: ${skip}, Inicial: ${isInitialLoad}, AllLoaded: ${allLoaded}`);

    try {
        const res = await fetchWithToken(`/api/messages?limit=${limit}&skip=${skip}`);
        const msgs = await res.json();

        if (!Array.isArray(msgs)) throw new Error('Formato inesperado');

        // Solo marcar como "todo cargado"
        if (msgs.length === 0) {
            allLoaded = true;
            console.log('[loadMessages] ✅ No hay más mensajes históricos - fin del historial');
            return;
        }
        if (msgs.length < limit) {
            allLoaded = true;
            console.log('[loadMessages] ⚠️  Última página de mensajes detectada');
        }

        skip += msgs.length;

        if (isInitialLoad) {
            const orderedMsgs = msgs.reverse();
            
            orderedMsgs.forEach(msg => {
                renderMessage(msg, false); // Agregar al fondo
            });
            requestAnimationFrame(() => {
                scrollToBottom();
            });
            
        } else {
            // Preservar posición actual del usuario
            const prevScrollHeight = messagesWrapper.scrollHeight;
            const orderedMsgs = msgs.reverse();
            
            orderedMsgs.forEach(msg => {
                renderMessage(msg, true); // Agregar TOP
            });
            
            // Restaurar posición del scroll
            requestAnimationFrame(() => {
                const newScrollHeight = messagesWrapper.scrollHeight;
                const heightDiff = newScrollHeight - prevScrollHeight;
                messagesWrapper.scrollTop += heightDiff;
            });
        }

    } catch (err) {
        console.error('[loadMessages] Error al cargar mensajes:', err);
    } finally {
        loading = false;
    }
}

// ======== GESTIÓN DEL SCROLL ========
function handleScroll() {
    isUserScrolling = true;
    if (scrollTimeout) clearTimeout(scrollTimeout);
    
    // Detectar fin del scroll manual
    scrollTimeout = setTimeout(() => {
        isUserScrolling = false;
    }, 150);

    const scrollTop = messagesWrapper.scrollTop;
    const scrollHeight = messagesWrapper.scrollHeight;
    const clientHeight = messagesWrapper.clientHeight;

    // logs de carga
    if (scrollTop <= 50) {
        console.log(`[Scroll] 🔝 Cerca del top: ${scrollTop}px`);
        
        if (loading) {
            console.log('[Scroll] ⏳ Ya cargando, esperando...');
        } else if (allLoaded) {
            console.log('[Scroll] 🔚 Todo cargado, no hay más historial');
        } else {
            console.log(`[Scroll] 🚀 TRIGGER! Cargando historial... (ScrollTop: ${scrollTop}px, Loading: ${loading}, AllLoaded: ${allLoaded})`);
            loadMessages(false);
        }
    }
    if (Math.random() < 0.1) {
        console.log(`[Scroll] 📊 Estado: Top=${scrollTop}px, Height=${scrollHeight}px, Client=${clientHeight}px, Skip=${skip}, Loading=${loading}, AllLoaded=${allLoaded}`);
    }
}

// ======== LOGOUT ========
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/index.html';
});

// ======== CONEXIÓN SOCKET.IO ========
function connectSocket() {
    socket = io({
        auth: { token: localStorage.getItem('token') },
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

    socket.on('banned', () => {
        alert('Has sido baneado en tiempo real. Cierre de sesión automático.');
        localStorage.removeItem('token');
        window.location.href = '/index.html';
    });

    socket.on('chat message', (msg) => {
        console.log('[Socket] Mensaje recibido:', msg);
        const shouldAutoScroll = isNearBottom(150) && !isUserScrolling;
        renderMessage(msg, false);
        if (shouldAutoScroll) {
            requestAnimationFrame(() => {
                scrollToBottom();
            });
        }
    });

    socket.on('disconnect', () => {
        console.warn('[Socket] Desconectado');
    });
}

// ======== EVENT LISTENERS ========
messagesWrapper.addEventListener('scroll', handleScroll);

// ======== INICIALIZACIÓN ========
async function initializeChat() {
    console.log('[Init] Inicializando chat...');
    
    applyTheme();
    setupUI();
    
    await loadUser();
    await loadMessages(true); // Carga inicial
    setTimeout(() => {
        if (messagesWrapper.scrollTop < messagesWrapper.scrollHeight - messagesWrapper.clientHeight - 50) {
            console.log('[Init] 🔧 Corrección final del scroll inicial...');
            scrollToBottom();
        }
    }, 200);
    
    connectSocket();
    
    console.log('[Init] Chat inicializado correctamente ✅');
}

// Inicializar todo
initializeChat();

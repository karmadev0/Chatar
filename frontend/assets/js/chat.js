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
let isAtBottom = true;

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

// ======== DETECTAR SI ESTÁ EN EL FONDO ========
function checkIfAtBottom() {
    const threshold = 100;
    const atBottom = messagesWrapper.scrollHeight - messagesWrapper.scrollTop - messagesWrapper.clientHeight <= threshold;
    isAtBottom = atBottom;
    return atBottom;
}

// ======== SCROLL AUTOMÁTICO AL FONDO ========
function scrollToBottom(smooth = false) {
    const scrollToMaxHeight = () => {
        const maxScroll = messagesWrapper.scrollHeight - messagesWrapper.clientHeight;
        messagesWrapper.scrollTop = maxScroll + 100;
        isAtBottom = true;
        console.log(`[scrollToBottom] Scroll forzado a: ${messagesWrapper.scrollTop}px (target: ${maxScroll}px)`);
    };

    if (smooth) {
        messagesWrapper.scrollTo({
            top: messagesWrapper.scrollHeight + 100,
            behavior: 'smooth'
        });
        setTimeout(() => { 
            isAtBottom = true; 
            scrollToMaxHeight();
        }, 600);
    } else {
        scrollToMaxHeight();
        
        // VERIFICACIÓN TRIPLE
        requestAnimationFrame(() => {
            const currentMax = messagesWrapper.scrollHeight - messagesWrapper.clientHeight;
            if (messagesWrapper.scrollTop < currentMax - 10) {
                console.log('[scrollToBottom] Corrigiendo posición - intento 1');
                scrollToMaxHeight();
                
                // Segundo intento si el primero falló
                requestAnimationFrame(() => {
                    if (messagesWrapper.scrollTop < currentMax - 10) {
                        console.log('[scrollToBottom] Corrigiendo posición - intento 2');
                        messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
                    }
                });
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
        messagesContainer.prepend(div);
    } else {
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
    if (loading) {
        console.log('[loadMessages] ⏳ Ya está cargando...');
        return;
    }
    
    if (allLoaded && !isInitialLoad) {
        console.log('[loadMessages] 🔚 Todo cargado ya');
        return;
    }
    
    loading = true;
    console.log(`[loadMessages] 📥 Cargando... Skip: ${skip}, Inicial: ${isInitialLoad}`);

    try {
        const res = await fetchWithToken(`/api/messages?limit=${limit}&skip=${skip}`);
        const msgs = await res.json();

        if (!Array.isArray(msgs)) throw new Error('Formato inesperado');

        console.log(`[loadMessages] 📨 Recibidos: ${msgs.length} mensajes`);

        // SOLO PARAR SI NO HAY MENSAJES
        if (msgs.length === 0) {
            allLoaded = true;
            console.log('[loadMessages] 🔚 FIN - No hay más mensajes');
            return;
        }

        skip += msgs.length;

        if (isInitialLoad) {
            // CARGA INICIAL
            const orderedMsgs = msgs.reverse();
            orderedMsgs.forEach(msg => renderMessage(msg, false));
            
            // SCROLL INICIAL
            // Múltiples verificaciones para asegurar scroll completo
            setTimeout(() => {
                requestAnimationFrame(() => {
                    scrollToBottom();
                    console.log('[loadMessages] 📍 Primer scroll inicial');
                    
                    // Segunda verificación después de otro frame
                    requestAnimationFrame(() => {
                        scrollToBottom();
                        console.log('[loadMessages] 📍 Segundo scroll inicial');
                        
                        // Tercera verificación para estar 100% seguro yia
                        setTimeout(() => {
                            scrollToBottom();
                            console.log('[loadMessages] 📍 Scroll inicial FINAL completado');
                        }, 100);
                    });
                });
            }, 200); // Mas tiempo para renderizado completo
            
        } else {
            // CARGA DE HISTORIAL
            const prevScrollHeight = messagesWrapper.scrollHeight;
            const prevScrollTop = messagesWrapper.scrollTop;
            
            const orderedMsgs = msgs.reverse();
            orderedMsgs.forEach(msg => renderMessage(msg, true));
            
            requestAnimationFrame(() => {
                const newScrollHeight = messagesWrapper.scrollHeight;
                const heightDiff = newScrollHeight - prevScrollHeight;
                messagesWrapper.scrollTop = prevScrollTop + heightDiff;
                console.log(`[loadMessages] Posición restaurada +${heightDiff}px`);
            });
        }

        console.log(`[loadMessages] ✅ Completado. Skip: ${skip}, Total: ${document.querySelectorAll('.message').length}`);

    } catch (err) {
        console.error('[loadMessages] ❌ Error:', err);
    } finally {
        loading = false;
    }
}

// ======== GESTIÓN DEL SCROLL ========
function handleScroll() {
    checkIfAtBottom();
    isUserScrolling = true;
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => { isUserScrolling = false; }, 150);

    // Cargar historial si está arriba
    if (messagesWrapper.scrollTop <= 50 && !loading && !allLoaded) {
        console.log(`[Scroll] 📜 Cargando historial... Top: ${messagesWrapper.scrollTop}px`);
        loadMessages(false);
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
        const shouldAutoScroll = isAtBottom && !loading;
        
        renderMessage(msg, false);
        
        if (shouldAutoScroll) {
            console.log('[Socket] 📍 Auto-scroll activado');
            requestAnimationFrame(() => {
                scrollToBottom();
            });
        } else {
            console.log('[Socket] 🚫 Auto-scroll desactivado - usuario leyendo historial');
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
    await loadMessages(true);
    setTimeout(() => {
        console.log('[Init] 🔧 Verificación final del scroll...');
        scrollToBottom();
        
        // Última verificación después de 1 segundo
        setTimeout(() => {
            const currentScroll = messagesWrapper.scrollTop;
            const maxScroll = messagesWrapper.scrollHeight - messagesWrapper.clientHeight;
            
            if (currentScroll < maxScroll - 20) {
                console.log('[Init] 🚨 Corrección FINAL del scroll - forzando posición');
                messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
                isAtBottom = true;
            }
            
            console.log(`[Init] ✅ Scroll final: ${messagesWrapper.scrollTop}px de ${maxScroll}px`);
        }, 1000);
    }, 500);
    
    connectSocket();
    
    console.log('[Init] Chat inicializado correctamente ✅');
}

// Inicializar todo QUE ANDE ESTA MIERDAAAAA
initializeChat();

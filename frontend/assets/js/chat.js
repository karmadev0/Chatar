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
const typingIndicator = document.getElementById('typing-indicator');
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
let typingDebounceTimeout = null;

// ======== SISTEMA DE TEMAS ========
function applyTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    const themeLink = document.getElementById('theme-link');
    if (themeLink) {
        themeLink.href = `./assets/css/chat-${theme}.css`;
    }
}

// ======== UTILIDADES ========
function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

function softenLongWords(text, maxLen = 60) {
    return text.replace(new RegExp(`(\\S{${maxLen}})`, 'g'), '$1\u200B');
}

function checkIfAtBottom() {
    const threshold = 100;
    isAtBottom = messagesWrapper.scrollHeight - messagesWrapper.scrollTop - messagesWrapper.clientHeight <= threshold;
    return isAtBottom;
}

function scrollToBottom(smooth = false) {
    const scrollToMaxHeight = () => {
        messagesWrapper.scrollTop = messagesWrapper.scrollHeight + 100;
        isAtBottom = true;
    };

    if (smooth) {
        messagesWrapper.scrollTo({ top: messagesWrapper.scrollHeight + 100, behavior: 'smooth' });
        setTimeout(scrollToMaxHeight, 600);
    } else {
        scrollToMaxHeight();
        requestAnimationFrame(() => {
            const currentMax = messagesWrapper.scrollHeight - messagesWrapper.clientHeight;
            if (messagesWrapper.scrollTop < currentMax - 10) {
                scrollToMaxHeight();
                requestAnimationFrame(() => {
                    if (messagesWrapper.scrollTop < currentMax - 10) {
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

    const time = new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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

// ======== CARGA DE MENSAJES HISTÓRICOS ========
async function loadMessages(isInitialLoad = false) {
    if (loading || (allLoaded && !isInitialLoad)) return;
    loading = true;

    try {
        const res = await fetchWithToken(`/api/messages?limit=${limit}&skip=${skip}`);
        const msgs = await res.json();
        if (!Array.isArray(msgs)) throw new Error('Formato inesperado');
        if (msgs.length === 0) {
            allLoaded = true;
            return;
        }

        skip += msgs.length;
        const orderedMsgs = msgs.reverse();
        orderedMsgs.forEach(msg => renderMessage(msg, isInitialLoad ? false : true));

        if (isInitialLoad) {
            setTimeout(() => {
                requestAnimationFrame(() => {
                    scrollToBottom();
                    requestAnimationFrame(scrollToBottom);
                });
            }, 200);
        } else {
            const prevScrollHeight = messagesWrapper.scrollHeight;
            const prevScrollTop = messagesWrapper.scrollTop;
            requestAnimationFrame(() => {
                const newScrollHeight = messagesWrapper.scrollHeight;
                const heightDiff = newScrollHeight - prevScrollHeight;
                messagesWrapper.scrollTop = prevScrollTop + heightDiff;
            });
        }
    } catch (err) {
        console.error('[loadMessages] Error:', err);
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
    if (messagesWrapper.scrollTop <= 50 && !loading && !allLoaded) {
        loadMessages(false);
    }
}

// ======== SOCKET.IO ========
function connectSocket() {
    socket = io({ auth: { token: localStorage.getItem('token') } });

    socket.on('connect', () => {
        socket.emit('authenticate', localStorage.getItem('token'));
    });

    socket.on('authenticated', () => {
        console.log('[Socket] Autenticado');
    });

    socket.on('unauthorized', () => {
        localStorage.removeItem('token');
        window.location.href = '/index.html';
    });

    socket.on('banned', () => {
        alert('Has sido baneado.');
        localStorage.removeItem('token');
        window.location.href = '/index.html';
    });

    socket.on('chat message', (msg) => {
        const shouldAutoScroll = isAtBottom && !loading;
        renderMessage(msg, false);
        if (shouldAutoScroll) requestAnimationFrame(scrollToBottom);
    });

    socket.on('typing', (typingUsers) => {
        const usernames = typingUsers.filter(name => name !== currentUser.username);
        const namesSpan = typingIndicator.querySelector('.names');

        if (usernames.length === 0) {
            typingIndicator.classList.add('hidden');
        } else {
            if (usernames.length <= 3) {
                namesSpan.textContent = `${usernames.join(', ')} ${usernames.length === 1 ? 'está escribiendo' : 'están escribiendo'}`;
            } else {
                namesSpan.textContent = 'Varios usuarios están escribiendo';
            }
            typingIndicator.classList.remove('hidden');
        }
    });

    socket.on('disconnect', () => {
        console.warn('[Socket] Desconectado');
    });
}

// ======== EVENT LISTENERS ========
messagesWrapper.addEventListener('scroll', handleScroll);

messageInput.addEventListener('input', () => {
    socket.emit('typing', true);
    if (typingDebounceTimeout) clearTimeout(typingDebounceTimeout);
    typingDebounceTimeout = setTimeout(() => {
        socket.emit('typing', false);
    }, 2000);
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/index.html';
});

// ======== INICIALIZACIÓN ========
async function initializeChat() {
    applyTheme();
    setupUI();
    await loadUser();
    await loadMessages(true);
    connectSocket();
}

initializeChat();


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
const replyPreview = document.getElementById('reply-preview');
let replyTo = null;

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
    return text.replace(new RegExp(`(\\S{${maxLen}})`, 'g'), '$1​');
}

function checkIfAtBottom() {
    const threshold = 100;
    isAtBottom = messagesWrapper.scrollHeight - messagesWrapper.scrollTop - messagesWrapper.clientHeight <= threshold;
    return isAtBottom;
}

function scrollToBottom(smooth = false) {
    const scrollToMaxHeight = () => {
        messagesWrapper.scrollTop = messagesWrapper.scrollHeight;
        isAtBottom = true;
    };

    if (smooth) {
        messagesWrapper.scrollTo({ top: messagesWrapper.scrollHeight, behavior: 'smooth' });
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

    const div = document.createElement('div');
    div.className = 'message';
    div.setAttribute('data-id', msgId);
    if (msg.replyTo) div.classList.add('reply');

    const body = [];
    // preview de reply con flecha
    if (msg.replyTo) {
        const { username: repliedName, text: repliedText } = msg.replyTo;
        body.push(`
            <div class="reply-preview">
                <span class="arrow">➜</span>
                <strong>${repliedName}</strong>: ${repliedText.length > 32 ? repliedText.slice(0,32) + '...' : repliedText}
            </div>
        `);
    }

    const content = softenLongWords(msg.text);
    const linkContent = linkify(content);
    const time = new Date(msg.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const avatar = msg.avatarURL || '/assets/image/default.jpg';

    body.push(`
        <div class="message-header">
            <img src="${avatar}" class="avatar" />
            <div class="message-info">
                <strong>${msg.username}</strong>
                <span class="timestamp">${time}</span>
            </div>
        </div>
        <p class="message-content">${linkContent}</p>
    `);

    div.innerHTML = body.join('');

    // doble click para reply
    div.addEventListener('dblclick', () => activateReply(msg));
    // TODO: swipe detection si se quiere

    if (addToTop) messagesContainer.prepend(div);
    else messagesContainer.appendChild(div);
}

function activateReply(msg) {
    replyTo = { id: msg._id, username: msg.username, text: msg.text };
    if (replyPreview) {
        replyPreview.innerHTML = `
            <span class="dots"></span>
            Respondiendo a <strong>${replyTo.username}</strong>: ${replyTo.text.length > 32 ? replyTo.text.slice(0,32) + '...' : replyTo.text}
        `;
        replyPreview.classList.remove('hidden');
    }
    messageInput.focus();
}

function clearReply() {
    replyTo = null;
    if (replyPreview) replyPreview.classList.add('hidden');
}

// ======== ENVÍO DE MENSAJES ========
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!canSend) return;
    const text = messageInput.value.trim();
    if (!text) return;
    if (text.length > 1024) { alert('El mensaje no puede superar los 1024 caracteres.'); return; }

    const payload = replyTo ? { text, replyTo: replyTo.id } : { text };
    socket.emit('chat message', payload);
    messageInput.value = '';
    clearReply();
    canSend = false;
    setTimeout(() => canSend = true, 1000);
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

if (replyPreview) {
    replyPreview.addEventListener('click', () => {
        clearReply();
    });
}

// ======== INICIALIZACIÓN ========
async function initializeChat() {
    applyTheme();
    setupUI();
    await loadUser();
    await loadMessages(true);
    connectSocket();
}

initializeChat();

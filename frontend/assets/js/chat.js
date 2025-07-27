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

// ======== SISTEMA DE MENCIONES ========
let mentionsDropdown = null;
let currentMentionQuery = '';
let selectedMentionIndex = 0;
let mentionStartPos = 0;
let availableUsers = [];
let unreadMentions = 0;
let notificationSettings = { mentions: true, browser: false };

// Función para suscribir a notificaciones push
import { urlBase64ToUint8Array, checkPushSupport } from './pushUtils.js';

const VAPID_PUBLIC_KEY = 'BHvRcnpdYwT_3ZO66SNatTYjAfaG8uMoCITtdkv7XYMkLpY2YUw7m3V087VP8Bzx1C7s8k-JGKUQwSDfexsvImU';

/**
 * Suscribir al usuario a notificaciones Push
 * @param {string} userId - ID del usuario
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function subscribeToPushNotifications(userId) {
  try {
    // 1. Verificar compatibilidad
    if (!checkPushSupport()) {
      throw new Error('Tu navegador no soporta notificaciones push');
    }

    // 2. Registrar el Service Worker (ruta absoluta)
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('📦 Service Worker registrado en:', registration.scope);

    // 3. Esperar a que esté listo/controlando la página
    const serviceWorkerReady = await navigator.serviceWorker.ready;
    console.log('✅ Service Worker activo y listo:', serviceWorkerReady);

    // 4. Pedir permiso de notificaciones
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Permiso de notificaciones denegado o no aceptado');
    }

    // 5. Suscribir al usuario al PushManager
    const subscription = await serviceWorkerReady.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    console.log('📡 Usuario suscrito correctamente:', subscription);

    // 6. Enviar la suscripción al backend
    const response = await fetch('/api/users/save-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        userId,
        subscription: subscription.toJSON()
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Error al guardar la suscripción en el servidor');
    }

    console.log('✅ Subscripción guardada en backend');
    return { success: true, data: await response.json() };

  } catch (error) {
    console.error('❌ Error al suscribirse a push notifications:', error);

    // Si hay error de suscripción, intenta desuscribirse para limpiar
    if (error.message.includes('subscription')) {
      await unsubscribeFromPushNotifications();
    }

    return { success: false, error: error.message };
  }
}

/**
 * Desuscribirse de notificaciones Push (opcional para limpiar suscripciones fallidas)
 */
export async function unsubscribeFromPushNotifications() {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration) {
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('🗑️ Usuario desuscrito de push notifications');
    }
  }
}

// Crear dropdown de menciones
function createMentionsDropdown() {
  const dropdown = document.createElement('div');
  dropdown.id = 'mentions-dropdown';
  document.body.appendChild(dropdown);
  return dropdown;
}

// Buscar usuarios para menciones
async function searchUsers(query) {
  console.log('🌐 searchUsers llamado con:', query);
  
  if (!query || query.length < 1) {
    console.log('❌ Query vacío o muy corto');
    return [];
  }
  
  try {
    const url = `/api/users/search?q=${encodeURIComponent(query)}`;
    console.log('📡 Haciendo petición a:', url);
    
    const res = await fetchWithToken(url);
    console.log('📡 Respuesta del servidor - Status:', res.status);
    
    if (res.ok) {
      const users = await res.json();
      console.log('👥 Datos recibidos:', users);
      return users;
    } else {
      console.error('❌ Error en respuesta:', res.status, res.statusText);
    }
  } catch (err) {
    console.error('❌ Error en searchUsers:', err);
  }
  return [];
}

// Mostrar dropdown de menciones
function showMentionsDropdown(users, inputRect) {
  if (!mentionsDropdown) {
    mentionsDropdown = createMentionsDropdown();
  }

  // Limpiar y llenar dropdown
  mentionsDropdown.innerHTML = users.map((user, index) => `
    <div class="mention-item ${index === selectedMentionIndex ? 'selected' : ''}" data-index="${index}">
      <img src="${user.avatarURL || '/assets/image/default.jpg'}" class="avatar" alt="${user.username}">
      <span class="username">@${user.username}</span>
    </div>
  `).join('');

  // Posicionar dropdown relativo al input
  const containerRect = document.getElementById('input-container').getBoundingClientRect();
  mentionsDropdown.style.position = 'fixed';
  mentionsDropdown.style.top = `${inputRect.top - containerRect.height - 10}px`;
  mentionsDropdown.style.left = `${inputRect.left}px`;
  mentionsDropdown.style.width = `${Math.max(inputRect.width, 200)}px`;
  mentionsDropdown.classList.add('visible');

  // Agregar event listeners
  mentionsDropdown.querySelectorAll('.mention-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(item.dataset.index);
      selectMention(availableUsers[index]);
    });
  });
}

// Ocultar dropdown
function hideMentionsDropdown() {
  if (mentionsDropdown) {
    mentionsDropdown.classList.remove('visible');
  }
  currentMentionQuery = '';
  selectedMentionIndex = 0;
}

// Seleccionar mención
function selectMention(user) {
  const inputValue = messageInput.value;
  const beforeMention = inputValue.substring(0, mentionStartPos);
  const afterMention = inputValue.substring(messageInput.selectionStart);
  
  messageInput.value = beforeMention + `@${user.username} ` + afterMention;
  messageInput.focus();
  
  const newCursorPos = beforeMention.length + user.username.length + 2;
  messageInput.setSelectionRange(newCursorPos, newCursorPos);
  
  hideMentionsDropdown();
}

// Procesar texto con menciones
function processMentionsInText(text) {
  return text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// Detectar @ en el input
async function handleMentionInput() {
  const cursorPos = messageInput.selectionStart;
  const inputValue = messageInput.value;
  
  console.log('🔍 Input detectado:', inputValue, 'Cursor en:', cursorPos);
  
  // Buscar @ más cercano hacia atrás
  let atPos = -1;
  for (let i = cursorPos - 1; i >= 0; i--) {
    console.log(`Revisando posición ${i}: "${inputValue[i]}"`);
    if (inputValue[i] === '@') {
      atPos = i;
      console.log('✅ Encontré @ en posición:', atPos);
      break;
    }
    if (inputValue[i] === ' ') {
      console.log('❌ Encontré espacio, rompiendo búsqueda');
      break;
    }
  }

  if (atPos === -1) {
    console.log('❌ No se encontró @, ocultando dropdown');
    hideMentionsDropdown();
    return;
  }

  // Extraer query después del @
  const query = inputValue.substring(atPos + 1, cursorPos);
  console.log('📝 Query extraído:', `"${query}"`);
  
  // Si hay espacio en el query, ocultar dropdown
  if (query.includes(' ')) {
    console.log('❌ Query contiene espacio, ocultando dropdown');
    hideMentionsDropdown();
    return;
  }

  mentionStartPos = atPos;
  currentMentionQuery = query;

  // Buscar usuarios solo si hay al menos 1 carácter después del @
  if (query.length >= 1) {
    console.log('🔍 Buscando usuarios con query:', query);
    const users = await searchUsers(query);
    console.log('👥 Usuarios encontrados:', users);
    availableUsers = users;
    selectedMentionIndex = 0;

    // Mostrar dropdown solo si hay resultados
    if (users.length > 0) {
      console.log('✅ Mostrando dropdown con', users.length, 'usuarios');
      const inputRect = messageInput.getBoundingClientRect();
      showMentionsDropdown(users, inputRect);
    } else {
      console.log('❌ No hay usuarios, ocultando dropdown');
      hideMentionsDropdown();
    }
  } else {
    console.log('❌ Query muy corto, ocultando dropdown');
    hideMentionsDropdown();
  }
}

// Cargar configuración de notificaciones
async function loadNotificationSettings() {
  try {
    const res = await fetchWithToken('/api/users/notification-settings');
    if (res.ok) {
      const settings = await res.json();
      notificationSettings = {
        mentions: settings.mentions ?? true,
        browser: settings.browser ?? false,
        pushEnabled: settings.pushEnabled ?? false // ✅ Agregar esta línea
      };
      updateNotificationUI();
    }
  } catch (err) {
    console.error('Error loading notification settings:', err);
  }
}

// Actualizar UI según configuración
function updateNotificationUI() {
  const notificationsBtn = document.getElementById('notifications-btn');
  if (notificationsBtn) {
    notificationsBtn.disabled = !notificationSettings.mentions;
    if (!notificationSettings.mentions) {
      const badge = notificationsBtn.querySelector('.notification-badge');
      if (badge) badge.remove();
    }
  }
}

// Mostrar configuración de notificaciones
function showNotificationSettings() {
  const modal = document.createElement('div');
  modal.id = 'notification-settings-modal';
  modal.classList.add('visible');
  
  const container = document.createElement('div');
  container.id = 'notification-settings-container';
  
  container.innerHTML = `
    <button class="close-modal" onclick="this.closest('#notification-settings-modal').remove()">×</button>
    <h3>⚙️ Configuración de Notificaciones</h3>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-title">Menciones en chat</div>
        <div class="setting-description">Recibir notificaciones cuando te mencionen con @</div>
      </div>
      <div class="toggle-switch ${notificationSettings.mentions ? 'active' : ''}" data-setting="mentions">
      </div>
    </div>
    
    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-title">Notificaciones del navegador</div>
        <div class="setting-description">Mostrar notificaciones cuando no estés en el chat</div>
      </div>
      <div class="toggle-switch ${notificationSettings.browser ? 'active' : ''}" data-setting="browser">
      </div>
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <div class="setting-title">Notificaciones Push</div>
        <div class="setting-description">Recibir notificaciones incluso con el navegador cerrado</div>
      </div>
      <div class="push-controls">
        <div class="toggle-switch ${notificationSettings.pushEnabled || false ? 'active' : ''}" data-setting="pushEnabled" id="push-toggle">
        </div>
        <button id="activate-push-btn" class="push-btn ${notificationSettings.pushEnabled ? 'activated' : ''}" 
                ${notificationSettings.pushEnabled ? 'disabled' : ''}>
          ${notificationSettings.pushEnabled ? '✅ Activado' : '🔔 Activar'}
        </button>
      </div>
    </div>

    <div class="info-box">
    <p style="font-size: 0.85rem; color: #aaa; margin-top: 10px;">
    ⚠️ Algunos navegadores no permiten enviar notificaciones directamente al sistema.
    Si quieres saber cuáles son compatibles, visita
    <a href="/compatibility.html" target="_blank" style="color: #ff8c00; text-decoration: underline;">aquí</a>.
    </p>
    </div>
    
    <div class="settings-actions">
      <button id="save-settings">Guardar</button>
      <button id="cancel-settings">Cancelar</button>
    </div>
  `;
  
  modal.appendChild(container);
  document.body.appendChild(modal);
  
  // Botón para activar push notifications mejorado
  const pushBtn = container.querySelector('#activate-push-btn');
  const pushToggle = container.querySelector('#push-toggle');

  pushBtn.addEventListener('click', async () => {
    if (pushBtn.disabled) return;
    
    pushBtn.disabled = true;
    pushBtn.textContent = '⏳ Activando...';
    
    if (currentUser) {
      const result = await subscribeToPushNotifications(currentUser.id);
      
      if (result.success) {
        // Éxito
        notificationSettings.pushEnabled = true;
        pushToggle.classList.add('active');
        pushBtn.textContent = '✅ Activado';
        pushBtn.classList.add('activated');
        
        // Alerta informativa
        showPushSuccessAlert();
        
      } else {
        // Error
        pushBtn.disabled = false;
        pushBtn.textContent = '🔔 Activar';
        
        if (result.isPermissionDenied) {
          showPushErrorAlert('Permisos denegados. Ve a configuración del navegador para activar notificaciones.');
        } else {
          showPushErrorAlert(`Error: ${result.error}`);
        }
      }
    } else {
      pushBtn.disabled = false;
      pushBtn.textContent = '🔔 Activar';
      showMessage('Primero debes iniciar sesión', true);
    }
  });

  // Toggle para desactivar push
  pushToggle.addEventListener('click', () => {
    if (pushToggle.classList.contains('active')) {
      // Desactivar
      pushToggle.classList.remove('active');
      notificationSettings.pushEnabled = false;
      pushBtn.disabled = false;
      pushBtn.textContent = '🔔 Activar';
      pushBtn.classList.remove('activated');
    } else if (!pushBtn.disabled) {
      // Activar (trigger del botón)
      pushBtn.click();
    }
  });
  
  // Event listeners para toggles normales
  const toggles = container.querySelectorAll('.toggle-switch:not(#push-toggle)');
  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const setting = toggle.dataset.setting;
      const isActive = toggle.classList.contains('active');
      
      if (isActive) {
        toggle.classList.remove('active');
        notificationSettings[setting] = false;
      } else {
        toggle.classList.add('active');
        notificationSettings[setting] = true;
      }
    });
  });
  
  // Guardar configuración
  container.querySelector('#save-settings').addEventListener('click', async () => {
    try {
      const res = await fetchWithToken('/api/users/notification-settings', {
        method: 'PUT',
        body: JSON.stringify(notificationSettings)
      });
      
      if (res.ok) {
        updateNotificationUI();
        modal.remove();
        
        // Si se desactivaron las menciones, limpiar contador
        if (!notificationSettings.mentions) {
          unreadMentions = 0;
          updateNotificationBadge();
        }
      } else {
        alert('Error al guardar configuración');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Error al guardar configuración');
    }
  });
  
  // Cancelar
  container.querySelector('#cancel-settings').addEventListener('click', () => {
    modal.remove();
  });
  
  // Cerrar modal clickeando fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Cargar notificaciones de menciones
async function loadMentions() {
  // Si las notificaciones están desactivadas, no cargar
  if (!notificationSettings.mentions) {
    unreadMentions = 0;
    updateNotificationBadge();
    return [];
  }
  
  try {
    const res = await fetchWithToken('/api/users/mentions');
    if (res.ok) {
      const mentions = await res.json();
      unreadMentions = mentions.filter(m => !m.isRead).length;
      updateNotificationBadge();
      return mentions;
    }
  } catch (err) {
    console.error('Error loading mentions:', err);
  }
  return [];
}

// Actualizar badge de notificaciones
function updateNotificationBadge() {
  const btn = document.getElementById('notifications-btn');
  if (!btn) return;

  let badge = btn.querySelector('.notification-badge');
  
  if (unreadMentions > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'notification-badge';
      btn.appendChild(badge);
    }
    badge.textContent = unreadMentions > 99 ? '99+' : unreadMentions;
  } else if (badge) {
    badge.remove();
  }
}

// Mostrar modal de notificaciones
async function showNotificationsModal() {
  // Si las notificaciones están desactivadas, mostrar mensaje
  if (!notificationSettings.mentions) {
    alert('Las notificaciones de menciones están desactivadas. Actívalas en Configuración.');
    return;
  }
  
  const mentions = await loadMentions();
  
  const modal = document.createElement('div');
  modal.id = 'notifications-modal';
  modal.classList.add('visible');
  
  const container = document.createElement('div');
  container.id = 'notifications-container';
  
  container.innerHTML = `
    <button class="close-modal" onclick="this.closest('#notifications-modal').remove()">×</button>
    <h3>🔔 Notificaciones</h3>
    <div id="mentions-list">
      ${mentions.length === 0 ? 
        '<div class="no-notifications">No tienes menciones</div>' :
        mentions.map(mention => `
          <div class="notification-item ${!mention.isRead ? 'unread' : ''}" data-message-id="${mention.messageId}">
            <div class="notification-from">@${mention.fromUsername}</div>
            <div class="notification-text">${mention.text}</div>
            <div class="notification-time">${new Date(mention.createdAt).toLocaleString()}</div>
          </div>
        `).join('')
      }
    </div>
  `;
  
  modal.appendChild(container);
  document.body.appendChild(modal);
  
  // Event listeners para ir al mensaje
  container.querySelectorAll('.notification-item[data-message-id]').forEach(item => {
    item.addEventListener('click', async () => {
      const messageId = item.dataset.messageId;
      modal.remove();
      await goToMessage(messageId);
    });
  });
  
  // Marcar como leídas
  if (mentions.some(m => !m.isRead)) {
    try {
      await fetchWithToken('/api/users/mentions/read', { method: 'PUT' });
      unreadMentions = 0;
      updateNotificationBadge();
    } catch (err) {
      console.error('Error marking mentions as read:', err);
    }
  }
  
  // Cerrar modal clickeando fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

// Ir a un mensaje específico
async function goToMessage(messageId) {
  // Resetear mensajes cargados
  renderedMessages.clear();
  messagesContainer.innerHTML = '';
  skip = 0;
  allLoaded = false;
  
  // Cargar mensajes hasta encontrar el objetivo
  let found = false;
  let attempts = 0;
  const maxAttempts = 10;
  
  while (!found && attempts < maxAttempts && !allLoaded) {
    await loadMessages(false);
    
    // Buscar el mensaje
    const targetMessage = document.querySelector(`[data-id="${messageId}"]`);
    if (targetMessage) {
      found = true;
      // Scroll al mensaje y destacarlo
      targetMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetMessage.style.boxShadow = '0 0 10px #ff8c00';
      setTimeout(() => {
        targetMessage.style.boxShadow = '';
      }, 3000);
      break;
    }
    
    attempts++;
  }
  
  if (!found) {
    alert('No se pudo encontrar el mensaje. Puede haber sido eliminado.');
  }
}

// ======== SISTEMA DE TEMAS ========
function applyTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    const themeLink = document.getElementById('theme-link');
    if (themeLink) {
        themeLink.href = `./assets/css/chat-${theme}.css`;
    }
}

// ======== UTILIDADES ========
function showMessage(msg, isError = false) {
  const feedback = document.createElement('div');
  feedback.textContent = msg;
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${isError ? '#d32f2f' : '#4caf50'};
    color: white;
    padding: 12px 20px;
    border-radius: 6px;
    z-index: 1000;
    font-weight: bold;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(feedback);
  setTimeout(() => feedback.remove(), 4000);
}

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
    
    // Verificar si el usuario actual está mencionado
    const isMentioned = msg.mentions && msg.mentions.some(mention => 
        mention.username === currentUser.username
    );
    
    if (isMentioned) {
        div.classList.add('has-mention');
    }

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
    const mentionContent = processMentionsInText(linkContent);
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
        <p class="message-content">${mentionContent}</p>
    `);

    div.innerHTML = body.join('');

    // doble click para reply
    div.addEventListener('dblclick', () => activateReply(msg));

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
messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!canSend) return;
  const text = messageInput.value.trim();
  if (!text) return;

  // Detectar menciones
  const mentionMatches = [...text.matchAll(/@(\w+)/g)];
  const mentions = [];
  
  for (const match of mentionMatches) {
    const user = availableUsers.find(u => u.username === match[1]);
    if (user && user._id !== currentUser.id) {
      mentions.push(user._id);
      
      // Enviar notificación push
      try {
        await fetchWithToken('/api/users/send-chat-notification', {
          method: 'POST',
          body: JSON.stringify({
            toUserId: user._id,
            message: text
          })
        });
      } catch (err) {
        console.error('Error enviando notificación:', err);
      }
    }
  }

  const payload = {
    text,
    mentions: mentions.length > 0 ? mentions : undefined,
    replyTo: replyTo?.id
  };

  socket.emit('chat message', payload);
  messageInput.value = '';
  clearReply();
  canSend = false;
  setTimeout(() => canSend = true, 1000);
});

// ======== USUARIO ACTUAL ========
async function loadUser() {
    try {
        const res = await fetchWithToken('/api/users/me');
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
        
        // Cargar configuración y menciones
        await loadNotificationSettings();
        await loadMentions();
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

    // Nuevo evento: notificación de mención
    socket.on('mention notification', (data) => {
  if (!notificationSettings.mentions) return;
  
  unreadMentions++;
  updateNotificationBadge();
  
  // Solo muestra notificación en primer plano (opcional)
  if (!document.hidden && notificationSettings.browser) {
    showMessage(`@${data.fromUsername} te mencionó: ${data.text.substring(0, 50)}...`);
  }
  
  // El ServiceWorker manejará las notificaciones push en segundo plano
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
// Listener principal para el input (menciones + typing indicator)
messageInput.addEventListener('input', () => {
  // 1. Primero procesar posibles menciones
  handleMentionInput();
  
  // 2. Luego manejar el typing indicator
  if (socket) {
    socket.emit('typing', true);
  }
  
  // 3. Debounce para dejar de mostrar "está escribiendo"
  if (typingDebounceTimeout) clearTimeout(typingDebounceTimeout);
  typingDebounceTimeout = setTimeout(() => {
    if (socket) {
      socket.emit('typing', false);
    }
  }, 2000);
});

// Listener para clicks fuera del dropdown de menciones
document.addEventListener('click', (e) => {
  if (mentionsDropdown && 
      mentionsDropdown.classList.contains('visible') && 
      !e.target.closest('#mentions-dropdown') && 
      e.target !== messageInput) {
    hideMentionsDropdown();
  }
});

// Listener para teclas especiales en el input (navegación dropdown)
messageInput.addEventListener('keydown', (e) => {
  // Si el dropdown de menciones está visible
  if (mentionsDropdown && mentionsDropdown.classList.contains('visible')) {
    switch(e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedMentionIndex = Math.min(selectedMentionIndex + 1, availableUsers.length - 1);
        updateDropdownSelection();
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        selectedMentionIndex = Math.max(selectedMentionIndex - 1, 0);
        updateDropdownSelection();
        break;
        
      case 'Enter':
        e.preventDefault();
        if (availableUsers.length > 0) {
          selectMention(availableUsers[selectedMentionIndex]);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        hideMentionsDropdown();
        break;
        
      case 'Tab':
        if (availableUsers.length > 0) {
          e.preventDefault();
          selectMention(availableUsers[selectedMentionIndex]);
        }
        break;
    }
  }
  
  // Mantén cualquier otra lógica de keydown que necesites
});

// Helper para actualizar la selección en el dropdown
function updateDropdownSelection() {
  const items = mentionsDropdown.querySelectorAll('.mention-item');
  items.forEach((item, index) => {
    item.classList.toggle('selected', index === selectedMentionIndex);
    if (index === selectedMentionIndex) {
      item.scrollIntoView({ block: 'nearest' });
    }
  });
}

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/index.html';
});

if (replyPreview) {
    replyPreview.addEventListener('click', () => {
        clearReply();
    });
}

// Pedir permisos de notificación solo si está habilitado
function requestNotificationPermission() {
    if ('Notification' in window && notificationSettings.browser && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// Push

function showPushSuccessAlert() {
  const alertModal = document.createElement('div');
  alertModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  alertModal.innerHTML = `
    <div style="
      background: #1e1e1e;
      padding: 2rem;
      border-radius: 12px;
      max-width: 400px;
      text-align: center;
      color: white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    ">
      <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
      <h3 style="color: #4caf50; margin-bottom: 1rem;">¡Notificaciones Push Activadas!</h3>
      <p style="margin-bottom: 1.5rem; line-height: 1.4; color: #ccc;">
        Ahora recibirás notificaciones incluso con el navegador cerrado.
      </p>
      <div style="
        background: #2a2a2a; 
        padding: 1rem; 
        border-radius: 8px; 
        margin-bottom: 1.5rem;
        border-left: 4px solid #ff9800;
      ">
        <p style="margin: 0; font-size: 0.9rem; color: #ffb74d;">
          ⚠️ <strong>Importante:</strong> Si limpias los datos del navegador o cambias de dispositivo, 
          deberás reactivar las notificaciones.
        </p>
      </div>
      <button onclick="this.closest('div').remove()" style="
        background: #4caf50;
        color: white;
        padding: 0.8rem 2rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
      ">Entendido</button>
    </div>
  `;
  
  document.body.appendChild(alertModal);
  
  // Auto-cerrar después de 10 segundos
  setTimeout(() => {
    if (document.body.contains(alertModal)) {
      alertModal.remove();
    }
  }, 10000);
}

function showPushErrorAlert(message) {
  const alertModal = document.createElement('div');
  alertModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;
  
  alertModal.innerHTML = `
    <div style="
      background: #1e1e1e;
      padding: 2rem;
      border-radius: 12px;
      max-width: 400px;
      text-align: center;
      color: white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    ">
      <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
      <h3 style="color: #f44336; margin-bottom: 1rem;">Error al Activar</h3>
      <p style="margin-bottom: 1.5rem; line-height: 1.4; color: #ccc;">
        ${message}
      </p>
      <button onclick="this.closest('div').remove()" style="
        background: #f44336;
        color: white;
        padding: 0.8rem 2rem;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
      ">Cerrar</button>
    </div>
  `;
  
  document.body.appendChild(alertModal);
}

// Event listeners adicionales
document.addEventListener('DOMContentLoaded', () => {
    // Hacer disponibles las funciones globalmente
    window.showNotificationsModal = showNotificationsModal;
    window.showNotificationSettings = showNotificationSettings;
});

// Pedir permisos de notificación cuando se active la configuración
document.addEventListener('click', (e) => {
    if (e.target.dataset?.setting === 'browser' && e.target.classList.contains('active')) {
        requestNotificationPermission();
    }
});

// Ocultar dropdown al hacer scroll o redimensionar
window.addEventListener('scroll', hideMentionsDropdown);
window.addEventListener('resize', hideMentionsDropdown);

// ======== INICIALIZACIÓN ========
async function initializeChat() {
    applyTheme();
    setupUI();
    await loadUser();
    await loadMessages(true);
    connectSocket();
}

initializeChat();

import { fetchWithToken } from './api.js';

// === Referencias al DOM ===
const usernameInput = document.getElementById('username-input');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const avatarInput = document.getElementById('avatar-input');
const currentAvatarImg = document.getElementById('current-avatar');

const updateUsernameBtn = document.getElementById('update-username');
const updatePasswordBtn = document.getElementById('update-password');
const uploadAvatarBtn = document.getElementById('upload-avatar');

const userIdSpan = document.getElementById('settings-id');
const userCreatedSpan = document.getElementById('settings-created');
const userStatusSpan = document.getElementById('settings-status');
const usernameDisplay = document.getElementById('settings-username');

// === Mostrar mensajes ===
function showMessage(msg, isError = false) {
  const feedback = document.createElement('div');
  feedback.textContent = msg;
  feedback.style.color = isError ? 'red' : 'lime';
  feedback.style.marginTop = '10px';
  document.body.appendChild(feedback);
  setTimeout(() => feedback.remove(), 4000);
}

// === Cargar datos del usuario ===
async function loadUser() {
  try {
    const res = await fetchWithToken('/api/user/me');
    const user = await res.json();

    if (!res.ok) throw new Error(user.message || 'Error al cargar usuario');

    // Mostrar en la UI
    if (usernameDisplay) usernameDisplay.textContent = user.username;
    if (userIdSpan) userIdSpan.textContent = user.id;
    if (userCreatedSpan) userCreatedSpan.textContent = new Date(user.createdAt).toLocaleString();
    if (userStatusSpan) userStatusSpan.textContent = user.isBanned ? 'Baneado' : 'Activo';

    // Avatar
    if (!user.avatarURL || user.avatarURL.includes('default')) {
      currentAvatarImg.src = '/assets/image/default.jpg';
    } else {
      currentAvatarImg.src = user.avatarURL;
    }
  } catch (err) {
    console.error('[loadUser]', err);
    showMessage('No se pudo cargar el usuario', true);
  }
}

// === Cambiar nombre de usuario ===
updateUsernameBtn?.addEventListener('click', async () => {
  const newUsername = usernameInput.value.trim();
  if (!newUsername) return showMessage('Escribe un nuevo nombre.', true);

  try {
    const res = await fetchWithToken('/api/user/username', {
      method: 'PUT',
      body: JSON.stringify({ username: newUsername }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');

    showMessage('Nombre actualizado con éxito');
    usernameInput.value = '';
    loadUser();
  } catch (err) {
    showMessage(err.message, true);
  }
});

// === Cambiar contraseña ===
updatePasswordBtn?.addEventListener('click', async () => {
  const currentPassword = currentPasswordInput.value.trim();
  const newPassword = newPasswordInput.value.trim();

  if (!currentPassword || !newPassword) {
    return showMessage('Llena ambos campos.', true);
  }

  try {
    const res = await fetchWithToken('/api/user/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');

    showMessage('Contraseña actualizada');
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
  } catch (err) {
    showMessage(err.message, true);
  }
});

// === Subir nuevo avatar ===
uploadAvatarBtn?.addEventListener('click', async () => {
  const file = avatarInput.files[0];
  if (!file) return showMessage('Selecciona una imagen', true);

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/user/avatar', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');

    showMessage('Avatar actualizado con éxito');
    currentAvatarImg.src = data.avatarURL;
  } catch (err) {
    console.error('[uploadAvatar]', err);
    showMessage(err.message, true);
  }
});

// Iniciar
loadUser();

import { fetchWithoutToken } from './api.js';

const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = form.username.value.trim();
  const password = form.password.value;

  errorMsg.textContent = 'Iniciando sesión...';

  try {
    const res = await fetchWithoutToken('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 403 && data.message?.includes('baneado')) {
        throw new Error('Tu cuenta ha sido baneada. Contacta con el soporte si crees que fue un error.');
      }

      throw new Error(data.message || 'Error desconocido');
    }

    localStorage.setItem('token', data.token);
    window.location.href = './chat.html';

  } catch (err) {
    errorMsg.textContent = err.message;
  }
});

// Olvidé contraseña
document.getElementById('forgot-password').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('forgot-modal').classList.remove('hidden');
});
document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('forgot-modal').classList.add('hidden');
});

// frontend/assets/js/register.js
import { fetchWithoutToken } from './api.js';

const form = document.getElementById('register-form');
const errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = form.username.value.trim();
  const password = form.password.value;

  errorMsg.textContent = 'Registrando...';

  try {
    const res = await fetchWithoutToken('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error desconocido');
    }

    alert('Registro exitoso. Ahora puedes iniciar sesión.');
    window.location.href = './index.html';

  } catch (err) {
    errorMsg.textContent = err.message;
  }
});

// frontend/assets/js/register.js
import { fetchWithoutToken } from './api.js';

const form = document.getElementById('register-form');
const errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username        = form.username.value.trim();
  const password        = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  // Validaciones básicas del cliente
  if (!username || !password || !confirmPassword) {
    errorMsg.textContent = 'Todos los campos son obligatorios.';
    return;
  }
  if (password.length < 6) {
    errorMsg.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    return;
  }
  if (password !== confirmPassword) {
    errorMsg.textContent = 'Las contraseñas no coinciden.';
    return;
  }

  errorMsg.textContent = 'Registrando...';

  try {
    const res = await fetchWithoutToken('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      // mostramos el mensaje de error que venga del servidor
      throw new Error(data.error || data.message || 'Error desconocido');
    }

    alert('✅ Registro exitoso. Ahora puedes iniciar sesión.');
    window.location.href = './index.html';

  } catch (err) {
    errorMsg.textContent = err.message;
  }
});

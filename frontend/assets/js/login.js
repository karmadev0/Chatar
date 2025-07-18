// frontend/assets/js/login.js
const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = form.username.value.trim();
  const password = form.password.value;

  errorMsg.textContent = 'Iniciando sesión...';

  try {
    const res = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error desconocido');
    }

    localStorage.setItem('token', data.token);
    window.location.href = './chat.html';

  } catch (err) {
    errorMsg.textContent = err.message;
  }
});

// Modal "olvidé contraseña"
document.getElementById('forgot-password').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('forgot-modal').classList.remove('hidden');
});
document.getElementById('close-modal').addEventListener('click', () => {
  document.getElementById('forgot-modal').classList.add('hidden');
});

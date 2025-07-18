// frontend/assets/js/register.js
const form = document.getElementById('register-form');
const errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = form.username.value.trim();
  const password = form.password.value;

  errorMsg.textContent = 'Registrando...';

  try {
    const res = await fetch('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

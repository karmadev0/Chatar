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

    // Guardar token y redirigir
    localStorage.setItem('token', data.token);
    window.location.href = './chat.html'; // La siguiente pantalla

  } catch (err) {
    errorMsg.textContent = err.message;
  }
});

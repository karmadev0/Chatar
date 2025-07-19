// public/assets/js/themes.js

document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.theme-button');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const selectedTheme = btn.dataset.theme;
      if (!selectedTheme) return;

      localStorage.setItem('theme', selectedTheme);
      console.log('[Tema] Guardado:', selectedTheme);

      // Redirige a chat.html
      window.location.href = '/chat.html';
    });
  });
});

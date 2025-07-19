// public/js/ui.js

export function setupUI() {
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('overlay');
  const closeButtons = document.querySelectorAll('.menu-close');
  const menus = document.querySelectorAll('.menu');

  // Mostrar el sidebar principal
  menuToggle?.addEventListener('click', () => {
    sidebar.classList.add('active');
    overlay.classList.add('visible');
  });

  // Cerrar sidebar
  overlay?.addEventListener('click', () => {
    sidebar.classList.remove('active');
    menus.forEach(menu => menu.classList.remove('visible'));
    overlay.classList.remove('visible');
  });

  // Botones de cerrar menú lateral
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.menu')?.classList.remove('visible');
      overlay.classList.remove('visible');
    });
  });

  // Mostrar un menú lateral
  window.openMenu = function (menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    menu.classList.add('visible');
    overlay.classList.add('visible');
  };

  // Cerrar un menú lateral
  window.closeMenus = function () {
    menus.forEach(menu => menu.classList.remove('visible'));
    overlay.classList.remove('visible');
  };
}

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

// === Cropping y GIF Modal ===
let cropperInstance = null;
let selectedFile = null;

function isGifFile(file) {
  return file.type === 'image/gif';
}

function showGifPreview(file) {
  const modal = document.createElement('div');
  modal.id = 'cropper-modal';
  modal.classList.add('active');
  
  modal.innerHTML = `
    <div id="cropper-container">
      <div id="gif-preview-wrapper">
        <img id="gif-preview" src="" alt="GIF Preview" />
        <p style="color: #ccc; text-align: center; margin-top: 10px;">
          Los GIFs se suben directamente sin recortar
        </p>
      </div>
      <div id="cropper-controls">
        <button id="confirm-gif">Subir GIF</button>
        <button class="cancel" id="cancel-gif">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const previewImg = document.getElementById('gif-preview');
  const reader = new FileReader();

  reader.onload = function (e) {
    previewImg.src = e.target.result;
    
    const wrapper = document.getElementById('gif-preview-wrapper');
    wrapper.style.maxWidth = '400px';
    wrapper.style.maxHeight = '400px';
    previewImg.style.maxWidth = '100%';
    previewImg.style.maxHeight = '100%';
    previewImg.style.objectFit = 'contain';
  };

  reader.readAsDataURL(file);

  // Confirmar GIF
  document.getElementById('confirm-gif').addEventListener('click', handleGifUpload);

  // Cancelar
  document.getElementById('cancel-gif').addEventListener('click', () => {
    document.getElementById('cropper-modal').remove();
    selectedFile = null;
  });

  // Cerrar modal clickeando fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      selectedFile = null;
    }
  });

  // Cerrar con ESC
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      selectedFile = null;
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function showCropper(file) {
  const modal = document.createElement('div');
  modal.id = 'cropper-modal';
  modal.classList.add('active');
  
  modal.innerHTML = `
    <div id="cropper-container">
      <div id="cropper-image-wrapper">
        <img id="cropper-preview" src="" alt="Crop Preview" />
      </div>
      <div id="cropper-controls">
        <button id="confirm-crop">Recortar y Subir</button>
        <button class="cancel" id="cancel-crop">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const previewImg = document.getElementById('cropper-preview');
  const reader = new FileReader();

  reader.onload = function (e) {
    previewImg.src = e.target.result;
    
    previewImg.onload = () => {
      // Detectar imágenes extremas
      const imgWidth = previewImg.naturalWidth;
      const imgHeight = previewImg.naturalHeight;
      const aspectRatio = imgWidth / imgHeight;
      
      if (aspectRatio > 5 || aspectRatio < 0.2) {
        showMessage('Esta imagen tiene proporciones extremas. Por favor, usa una imagen más equilibrada.', true);
        document.getElementById('cropper-modal').remove();
        selectedFile = null;
        return;
      }
      
      // Calcular tamaño adaptable
      const maxContainerWidth = Math.min(window.innerWidth * 0.85, 450);
      const maxContainerHeight = Math.min(window.innerHeight * 0.6, 400);
      
      let containerWidth, containerHeight;
      
      if (imgWidth > imgHeight) {
        containerWidth = maxContainerWidth;
        containerHeight = (maxContainerWidth * imgHeight) / imgWidth;
        if (containerHeight > maxContainerHeight) {
          containerHeight = maxContainerHeight;
          containerWidth = (maxContainerHeight * imgWidth) / imgHeight;
        }
      } else {
        containerHeight = maxContainerHeight;
        containerWidth = (maxContainerHeight * imgWidth) / imgHeight;
        if (containerWidth > maxContainerWidth) {
          containerWidth = maxContainerWidth;
          containerHeight = (maxContainerWidth * imgHeight) / imgWidth;
        }
      }
      
      const wrapper = document.getElementById('cropper-image-wrapper');
      wrapper.style.width = containerWidth + 'px';
      wrapper.style.height = containerHeight + 'px';
      
      // Inicializar Cropper
      cropperInstance = new Cropper(previewImg, {
        aspectRatio: 1,
        viewMode: 1,
        dragMode: 'move',
        cropBoxMovable: false,
        cropBoxResizable: false,
        movable: true,
        scalable: true,
        zoomable: true,
        zoomOnWheel: true,
        zoomOnTouch: true,
        wheelZoomRatio: 0.1,
        autoCrop: true,
        autoCropArea: 0.75,
        background: true,
        guides: false,
        center: false,
        highlight: false,
        toggleDragModeOnDblclick: false,
        responsive: true,
        restore: false,
        minCropBoxWidth: Math.min(containerWidth * 0.6, 180),
        minCropBoxHeight: Math.min(containerHeight * 0.6, 180),
        
        ready() {
          const containerData = cropperInstance.getContainerData();
          const cropBoxSize = Math.min(containerData.width, containerData.height) * 0.7;
          
          cropperInstance.setCropBoxData({
            left: (containerData.width - cropBoxSize) / 2,
            top: (containerData.height - cropBoxSize) / 2,
            width: cropBoxSize,
            height: cropBoxSize
          });
          
          cropperInstance.move(0, 0);
        }
      });
    };
  };

  reader.readAsDataURL(file);

  // Event listeners
  document.getElementById('confirm-crop').addEventListener('click', handleCropConfirm);

  document.getElementById('cancel-crop').addEventListener('click', () => {
    if (cropperInstance) {
      cropperInstance.destroy();
      cropperInstance = null;
    }
    document.getElementById('cropper-modal').remove();
    selectedFile = null;
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }
      modal.remove();
      selectedFile = null;
    }
  });

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      if (cropperInstance) {
        cropperInstance.destroy();
        cropperInstance = null;
      }
      modal.remove();
      selectedFile = null;
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

async function handleGifUpload() {
  if (!selectedFile) return;

  const formData = new FormData();
  formData.append('avatar', selectedFile);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/user/avatar', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');

    showMessage('GIF subido con éxito');
    currentAvatarImg.src = data.avatarURL;

  } catch (err) {
    console.error('[uploadGif]', err);
    showMessage(err.message, true);
  } finally {
    document.getElementById('cropper-modal').remove();
    selectedFile = null;
  }
}

async function handleCropConfirm() {
  if (!cropperInstance) return;

  const canvas = cropperInstance.getCroppedCanvas({
    width: 512,
    height: 512,
    minWidth: 256,
    minHeight: 256,
    maxWidth: 1024,
    maxHeight: 1024,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  const formData = new FormData();
  formData.append('avatar', blob);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/user/avatar', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error');

    showMessage('Avatar actualizado con éxito');
    currentAvatarImg.src = data.avatarURL;

  } catch (err) {
    console.error('[uploadAvatar]', err);
    showMessage(err.message, true);
  } finally {
    cropperInstance.destroy();
    document.getElementById('cropper-modal').remove();
    cropperInstance = null;
    selectedFile = null;
  }
}

// === Mostrar mensajes ===
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

// === Cargar datos del usuario ===
async function loadUser() {
  try {
    const res = await fetchWithToken('/api/user/me');
    const user = await res.json();

    if (!res.ok) throw new Error(user.message || 'Error al cargar usuario');

    usernameDisplay.textContent = user.username;
    userIdSpan.textContent = user.id;
    userCreatedSpan.textContent = new Date(user.createdAt).toLocaleString();
    userStatusSpan.textContent = user.isBanned ? 'Baneado' : 'Activo';
    currentAvatarImg.src = user.avatarURL.includes('default') ? '/assets/image/default.jpg' : user.avatarURL;

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

// === Event listener para selección de archivo ===
avatarInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && file.type.startsWith('image/')) {
    if (file.size > 5 * 1024 * 1024) {
      showMessage('El archivo es demasiado grande. Máximo 5MB.', true);
      return;
    }
    
    selectedFile = file;
    
    // Detectar tipo de archivo
    if (isGifFile(file)) {
      showGifPreview(file);
    } else {
      showCropper(file);
    }
  } else {
    showMessage('Selecciona un archivo de imagen válido.', true);
  }
  e.target.value = '';
});

// === Inicializar ===
loadUser();

import { fetchWithToken } from './api.js';

// === Referencias al DOM ===
const usernameInput = document.getElementById('username-input');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const avatarInput = document.getElementById('avatar-input');
const currentAvatarImg = document.getElementById('current-avatar');

const updateUsernameBtn = document.getElementById('update-username');
const updatePasswordBtn = document.getElementById('update-password');

const userIdSpan = document.getElementById('settings-id');
const userCreatedSpan = document.getElementById('settings-created');
const userStatusSpan = document.getElementById('settings-status');
const usernameDisplay = document.getElementById('settings-username');

// === Variables globales ===
let cropperInstance = null;
let selectedFile = null;
let pendingImageData = null;

// === SightEngine API Credentials ===
const SIGHTENGINE_API_USER = '98784994';
const SIGHTENGINE_API_SECRET = 'xopaKE34cjabBNRgiQaE4gPG8bZqeGKR';

// === Funciones generales ===
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

function isGifFile(file) {
  return file.type === 'image/gif';
}

// === Modal de análisis NSFW ===
function showAnalysisModal(previewSrc) {
  const modal = document.createElement('div');
  modal.id = 'analysis-modal';
  modal.classList.add('active');
  
  modal.innerHTML = `
    <div id="analysis-container">
      <div id="analysis-content">
        <div id="analysis-icon">🔍</div>
        <h3>Analizando contenido...</h3>
        <img src="${previewSrc}" alt="Preview" style="max-width:150px; max-height:150px; margin:1rem auto; display:block; border-radius:4px;"/>
        <p style="font-size:0.8rem; color:#ccc; text-align:center;">
          Soporte se reserva el derecho de eliminar contenido inapropiado.
        </p>
        <div id="progress-container">
          <div id="progress-bar"><div id="progress-fill"></div></div>
          <span id="progress-text">0%</span>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  return modal;
}

function updateProgress(percentage) {
  const fill = document.getElementById('progress-fill');
  const text = document.getElementById('progress-text');
  if (fill && text) {
    fill.style.width = `${percentage}%`;
    text.textContent = `${percentage}%`;
  }
}

function showAnalysisResult(isApproved, reason = '') {
  const modal = document.getElementById('analysis-modal');
  const content = document.getElementById('analysis-content');
  
  if (isApproved) {
    content.innerHTML = `
      <div id="analysis-icon" style="color:#4caf50;">✅</div>
      <h3 style="color:#4caf50;">Imagen aprobada!</h3>
      <p>La imagen cumple con las normas de la comunidad.</p>
      <div id="result-actions">
        <button id="continue-upload" style="background:#4caf50;">Continuar subida</button>
      </div>
    `;
    
    document.getElementById('continue-upload').addEventListener('click', () => {
      modal.remove();
      proceedWithUpload();
    });
  } else {
    content.innerHTML = `
      <div id="analysis-icon" style="color:#f44336;">❌</div>
      <h3 style="color:#f44336;">Imagen rechazada</h3>
      <p>No cumple con las normas. Soporte puede borrar el contenido inapropiado.</p>
      <small style="color:#999;">${reason}</small>
      <div id="result-actions">
        <button id="close-analysis" style="background:#f44336;">Cerrar</button>
      </div>
    `;
    
    document.getElementById('close-analysis').addEventListener('click', () => {
      modal.remove();
      selectedFile = null;
      pendingImageData = null;
    });
  }
}

async function analyzeImage(imgElement) {
  const modal = showAnalysisModal(imgElement.src);
  
  try {
    updateProgress(30);
    
    // Configurar la solicitud a SightEngine
    const url = 'https://api.sightengine.com/1.0/check.json';
    const formData = new FormData();
    
    // Modelos a verificar (nudity, weapons/alcohol/drugs, contenido ofensivo)
    formData.append('models', 'nudity,wad,offensive,scam');
    formData.append('api_user', SIGHTENGINE_API_USER);
    formData.append('api_secret', SIGHTENGINE_API_SECRET);
    formData.append('media', imgElement.src);

    // Enviar solicitud
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    
    const data = await res.json();
    updateProgress(70);

    // Analizar resultados
    const nudity = data.nudity || {};
    const wad = data.weapon || data.alcohol || data.drugs || false;
    const offensive = data.offensive?.prob || 0;
    const scam = data.scam?.prob || 0;

    // Definir umbrales (ajustables según necesidades)
    const isNSFW = (
      nudity.raw > 0.5 ||      // Desnudez explícita
      nudity.partial > 0.5 ||  // Desnudez parcial
      wad ||                   // Armas, alcohol o drogas
      offensive > 0.7 ||       // Contenido ofensivo
      scam > 0.7               // Contenido engañoso
    );

    // Construir mensaje de razón
    let reason = '';
    if (isNSFW) {
      const reasons = [];
      if (nudity.raw > 0.5) reasons.push('desnudez explícita');
      if (nudity.partial > 0.5) reasons.push('desnudez parcial');
      if (wad) reasons.push('armas/alcool/drogas');
      if (offensive > 0.7) reasons.push('contenido ofensivo');
      if (scam > 0.7) reasons.push('contenido engañoso');
      reason = `Detectado: ${reasons.join(', ')}`;
    }

    updateProgress(100);
    
    setTimeout(() => showAnalysisResult(!isNSFW, reason), 500);
    
  } catch(err) {
    console.error('Error al analizar imagen:', err);
    modal.remove();
    showMessage('Error al analizar imagen', true);
    selectedFile = null;
    pendingImageData = null;
  }
}

async function proceedWithUpload() {
  if (!pendingImageData) return;
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/users/avatar', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: pendingImageData
    });
    
    const result = await res.json();
    if (!res.ok) throw new Error(result.message);
    
    showMessage('Avatar actualizado con éxito');
    currentAvatarImg.src = result.avatarURL;
    
  } catch(err) {
    console.error('Error al subir avatar:', err);
    showMessage(err.message || 'Error al subir avatar', true);
  } finally {
    pendingImageData = null;
    selectedFile = null;
  }
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
        <button id="confirm-crop">Recortar y Continuar</button>
        <button class="cancel" id="cancel-crop">Cancelar</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);

  const previewImg = document.getElementById('cropper-preview');
  const reader = new FileReader();

  reader.onload = function(e) {
    previewImg.src = e.target.result;
    
    previewImg.onload = () => {
      // Configurar cropper
      cropperInstance = new Cropper(previewImg, {
        aspectRatio: 1,
        viewMode: 1,
        autoCropArea: 0.8,
        responsive: true,
        movable: true,
        zoomable: true,
        rotatable: false,
        scalable: true,
        guides: false,
        center: false,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        minContainerWidth: 300,
        minContainerHeight: 300,
        minCanvasWidth: 200,
        minCanvasHeight: 200,
        minCropBoxWidth: 150,
        minCropBoxHeight: 150,
        ready() {
          const containerData = this.cropper.getContainerData();
          const cropBoxSize = Math.min(containerData.width, containerData.height) * 0.8;
          
          this.cropper.setCropBoxData({
            left: (containerData.width - cropBoxSize) / 2,
            top: (containerData.height - cropBoxSize) / 2,
            width: cropBoxSize,
            height: cropBoxSize
          });
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
    modal.remove();
    selectedFile = null;
  });

  // Cerrar modal al hacer clic fuera
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
}

async function handleCropConfirm() {
  if (!cropperInstance) return;

  const canvas = cropperInstance.getCroppedCanvas({
    width: 512,
    height: 512,
    imageSmoothingQuality: 'high'
  });

  const blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.9);
  });

  const formData = new FormData();
  formData.append('avatar', blob);
  pendingImageData = formData;

  // Crear imagen temporal para análisis
  const previewImg = new Image();
  previewImg.onload = () => {
    cropperInstance.destroy();
    document.getElementById('cropper-modal').remove();
    cropperInstance = null;
    analyzeImage(previewImg);
  };
  previewImg.src = canvas.toDataURL();
}

// === Cargar datos del usuario ===
async function loadUser() {
  try {
    const res = await fetchWithToken('/api/users/me');
    const user = await res.json();
    
    if (!res.ok) throw new Error(user.message);
    
    // Actualizar UI
    usernameDisplay.textContent = user.username;
    userIdSpan.textContent = user.id;
    userCreatedSpan.textContent = new Date(user.createdAt).toLocaleString();
    userStatusSpan.textContent = user.isBanned ? 'Baneado' : 'Activo';
    currentAvatarImg.src = user.avatarURL.includes('default') 
      ? '/assets/image/default.jpg' 
      : user.avatarURL;
    
  } catch(err) {
    console.error('Error al cargar usuario:', err);
    showMessage('No se pudo cargar usuario', true);
  }
}

// === Event listeners ===
avatarInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  
  if (file && file.type.startsWith('image/')) {
    // Validar tamaño (5MB máximo)
    if (file.size > 5 * 1024 * 1024) {
      showMessage('Máximo 5MB permitidos', true);
      return;
    }
    
    selectedFile = file;
    
    // Manejar GIFs (no requieren cropping)
    if (isGifFile(file)) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        analyzeImage(img);
        URL.revokeObjectURL(url); // Liberar memoria
      };
      
      img.src = url;
      
      // Preparar datos para upload
      const formData = new FormData();
      formData.append('avatar', file);
      pendingImageData = formData;
      
    } else {
      // Mostrar cropper para imágenes normales
      showCropper(file);
    }
  } else {
    showMessage('Selecciona una imagen válida', true);
  }
  
  // Resetear input
  e.target.value = '';
});

updateUsernameBtn?.addEventListener('click', async () => {
  const newUsername = usernameInput.value.trim();
  
  if (!newUsername) {
    return showMessage('Escribe un nuevo nombre de usuario', true);
  }

  try {
    const res = await fetchWithToken('/api/users/username', {
      method: 'PUT',
      body: JSON.stringify({ username: newUsername })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al actualizar');

    showMessage('Nombre de usuario actualizado');
    usernameInput.value = '';
    loadUser(); // Refrescar datos
  } catch(err) {
    console.error('Error al actualizar username:', err);
    showMessage(err.message, true);
  }
});

updatePasswordBtn?.addEventListener('click', async () => {
  const currentPassword = currentPasswordInput.value.trim();
  const newPassword = newPasswordInput.value.trim();

  if (!currentPassword || !newPassword) {
    return showMessage('Ambos campos son requeridos', true);
  }

  try {
    const res = await fetchWithToken('/api/users/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Error al actualizar');

    showMessage('Contraseña actualizada');
    currentPasswordInput.value = '';
    newPasswordInput.value = '';
  } catch(err) {
    console.error('Error al actualizar contraseña:', err);
    showMessage(err.message, true);
  }
});

// === Inicialización ===
loadUser();

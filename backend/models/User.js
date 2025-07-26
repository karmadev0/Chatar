import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 16
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  avatarURL: {
    type: String,
    default: '/assets/image/default.jpg'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  // Configuración de notificaciones
  notificationSettings: {
    mentions: {
      type: Boolean,
      default: true
    },
    browser: {
      type: Boolean,
      default: false
    },
    pushEnabled: {  // Nuevo campo para control global
      type: Boolean,
      default: false
    }
  },
  // Suscripción para notificaciones push
  pushSubscription: {
    endpoint: String,
    expirationTime: {
      type: Date,
      default: null
    },
    keys: {
      p256dh: String,
      auth: String
    }
  },
  // Notificaciones de menciones
  mentions: [{
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    fromUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    fromUsername: String,
    text: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    isRead: {
      type: Boolean,
      default: false
    }
  }]
}, { timestamps: true });  // Añade createdAt y updatedAt automáticamente

// Middleware para hashear contraseña
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Método para limpiar suscripción push
userSchema.methods.clearPushSubscription = function() {
  this.pushSubscription = undefined;
  return this.save();
};

// Añade al final del schema:
// Añade al schema existente:
userSchema.add({
  pushSubscription: {
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String
    },
    expirationTime: Number
  },
  notificationSettings: {
    pushEnabled: Boolean,
    // Mantén los campos existentes (mentions, browser)
  }
});

export const User = mongoose.model('User', userSchema);

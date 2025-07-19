import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 16,
  },
  password: {
    type: String,
    required: true,
    select: false // para proteger la contraseña por defecto
  },
  avatarURL: {
    type: String,
    default: '/assets/image/default.jpg', // ruta local de tu frontend
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isBanned: {
    type: Boolean,
    default: false,
  }
});

// 🔐 Hasheo automático antes de guardar
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Solo si cambió
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// 🔍 Método para comparar contraseñas
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);

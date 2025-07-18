import mongoose from 'mongoose';

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
    required: true
  },
  avatarURL: {
    type: String,
    default: 'https://i.imgur.com/YOy4w4l.png' // avatar base
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  isBanned: {
    type: Boolean,
    default: false
  }
});

export const User = mongoose.model('User', userSchema);

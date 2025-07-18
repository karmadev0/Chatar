import { Message } from '../models/Message.js';
import { User } from '../models/User.js';

export async function saveMessage(userId, text) {
  const user = await User.findById(userId);
  if (!user || user.isBanned) return null;

  const message = await Message.create({ userId, text });

  return {
    _id: message._id,
    text: message.text,
    userId: message.userId,
    createdAt: message.createdAt,
    username: user.username,
    avatarURL: user.avatarURL
  };
}

export async function getMessages(limit = 32, skip = 0) {
  const messages = await Message.find()
    .sort({ createdAt: -1 }) // recientes primero
    .skip(skip)
    .limit(limit)
    .populate('userId', 'username avatarURL'); // info del usuario

  return messages
    .filter(msg => msg.userId) // 👈 Evita crashear si userId es null
    .map(msg => ({
      _id: msg._id,
      text: msg.text,
      createdAt: msg.createdAt,
      username: msg.userId.username,
      avatarURL: msg.userId.avatarURL
    }));
}

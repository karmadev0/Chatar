import { Message } from '../models/Message.js';
import { User } from '../models/User.js';

/**
 * Guarda un nuevo mensaje en la base de datos
 */
export async function saveMessage(userId, text) {
  try {
    const user = await User.findById(userId);
    if (!user || user.isBanned) return null;

    const message = await Message.create({ userId, text });

    return {
      _id: message._id,
      text: message.text,
      createdAt: message.createdAt,
      username: user.username,
      avatarURL: user.avatarURL || '/assets/avatars/default.png'
    };
  } catch (err) {
    console.error('[saveMessage] Error:', err);
    return null;
  }
}

/**
 * Obtiene los mensajes más recientes
 */
export async function getMessages(limit = 32, skip = 0) {
  try {
    const messages = await Message.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username avatarURL');

    return messages
      .filter(msg => msg.userId) // Evita mensajes sin usuario
      .map(msg => ({
        _id: msg._id,
        text: msg.text,
        createdAt: msg.createdAt,
        username: msg.userId.username,
        avatarURL: msg.userId.avatarURL || '/assets/avatars/default.png'
      }));
  } catch (err) {
    console.error('[getMessages] Error:', err);
    return [];
  }
}

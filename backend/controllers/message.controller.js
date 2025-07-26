import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { sendPushNotification } from '../notifications.js';

// Función para extraer menciones del texto
function extractMentions(text) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]); // Solo el username sin @
  }
  
  return [...new Set(mentions)]; // Remover duplicados
}

export async function saveMessage(userId, text, replyTo = null) {
  try {
    // Extraer menciones del texto
    const mentionUsernames = extractMentions(text);
    const mentions = [];
    
    // Buscar usuarios mencionados
    if (mentionUsernames.length > 0) {
      const mentionedUsers = await User.find({
        username: { $in: mentionUsernames },
        isBanned: false
      }).select('_id username');
      
      for (const user of mentionedUsers) {
        mentions.push({
          userId: user._id,
          username: user.username
        });
      }
    }	

    // Crear el mensaje
    const message = new Message({
      userId,
      text,
      replyTo,
      mentions
    });

    const saved = await message.save();

    // Poblar datos del usuario y reply
    const populated = await Message.findById(saved._id)
      .populate('userId', 'username avatarURL')
      .populate({
        path: 'replyTo',
        populate: { path: 'userId', select: 'username' }
      });

    // Crear notificaciones para usuarios mencionados
    if (mentions.length > 0) {
      const fromUser = await User.findById(userId).select('username');
      
      for (const mention of mentions) {
        // Verificar si el usuario tiene las notificaciones activadas
        const targetUser = await User.findById(mention.userId).select('notificationSettings');
        
        if (targetUser?.notificationSettings?.mentions !== false) {
          await User.findByIdAndUpdate(
            mention.userId,
            {
              $push: {
                mentions: {
                  messageId: saved._id,
                  fromUser: userId,
                  fromUsername: fromUser.username,
                  text: text.substring(0, 100), // Primeros 100 caracteres
                  createdAt: new Date(),
                  isRead: false
                }
              }
            }
          );
        }
      }
    }

    // Formatear respuesta
    const response = {
      _id: populated._id,
      text: populated.text,
      username: populated.userId.username,
      avatarURL: populated.userId.avatarURL,
      createdAt: populated.createdAt,
      mentions: populated.mentions
    };

    if (populated.replyTo) {
      response.replyTo = {
        username: populated.replyTo.userId.username,
        text: populated.replyTo.text
      };
    }

    return response;
  } catch (err) {
    console.error('Error saving message:', err);
    return null;
  }
}

export async function getMessages(limit = 32, skip = 0) {
  try {
    const messages = await Message.find()
      .populate('userId', 'username avatarURL')
      .populate({
        path: 'replyTo',
        populate: { path: 'userId', select: 'username' }
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    return messages.map(msg => {
      const response = {
        _id: msg._id,
        text: msg.text,
        username: msg.userId.username,
        avatarURL: msg.userId.avatarURL,
        createdAt: msg.createdAt,
        mentions: msg.mentions || []
      };

      if (msg.replyTo) {
        response.replyTo = {
          username: msg.replyTo.userId.username,
          text: msg.replyTo.text
        };
      }

      return response;
    });
  } catch (err) {
    console.error('Error getting messages:', err);
    return [];
  }
}

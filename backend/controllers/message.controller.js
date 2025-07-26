import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { sendPushNotification } from '../notifications.js';
import mongoose from 'mongoose';

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
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Extraer menciones del texto
    const mentionUsernames = extractMentions(text);
    const mentions = [];
    
    // Buscar usuarios mencionados (con sus preferencias de notificación)
    if (mentionUsernames.length > 0) {
      const mentionedUsers = await User.find({
        username: { $in: mentionUsernames },
        isBanned: false
      })
      .session(session)
      .select('_id username notificationSettings pushSubscription');
      
      for (const user of mentionedUsers) {
        mentions.push({
          userId: user._id,
          username: user.username,
          wantsPush: user.notificationSettings?.pushEnabled && user.pushSubscription
        });
      }
    }

    // Crear el mensaje
    const message = new Message({
      userId,
      text,
      replyTo,
      mentions: mentions.map(m => ({
        userId: m.userId,
        username: m.username
      }))
    });

    const saved = await message.save({ session });

    // Poblar datos del usuario y reply
    const populated = await Message.findById(saved._id)
      .populate('userId', 'username avatarURL')
      .populate({
        path: 'replyTo',
        populate: { path: 'userId', select: 'username' }
      })
      .session(session);

    // Procesar notificaciones para usuarios mencionados
    if (mentions.length > 0) {
      const fromUser = await User.findById(userId)
        .session(session)
        .select('username avatarURL');
      
      await Promise.all(
        mentions.map(async (mention) => {
          if (mention.userId.toString() !== userId.toString()) {
            // Guardar mención en el usuario
            await User.findByIdAndUpdate(
              mention.userId,
              {
                $push: {
                  mentions: {
                    messageId: saved._id,
                    fromUser: userId,
                    fromUsername: fromUser.username,
                    text: text.substring(0, 100),
                    createdAt: new Date(),
                    isRead: false
                  }
                }
              },
              { session }
            );

            // Enviar notificación push si está habilitado
            if (mention.wantsPush) {
              await sendPushNotification(
                mention.pushSubscription,
                {
                  title: `${fromUser.username} te mencionó`,
                  body: text.length > 100 ? text.substring(0, 100) + '...' : text,
                  url: `/chat.html?messageId=${saved._id}`,
                  icon: fromUser.avatarURL || '/icon-192x192.png',
                  messageId: saved._id
                },
                mention.userId
              ).catch(err => {
                console.error(`Error enviando push a ${mention.userId}:`, err);
              });
            }
          }
        })
      );
    }

    await session.commitTransaction();

    // Formatear respuesta
    const response = {
      _id: populated._id,
      text: populated.text,
      username: populated.userId.username,
      avatarURL: populated.userId.avatarURL,
      createdAt: populated.createdAt,
      mentions: populated.mentions,
      // Para Socket.IO
      socketData: {
        mentions: mentions.map(m => m.userId.toString())
      }
    };

    if (populated.replyTo) {
      response.replyTo = {
        username: populated.replyTo.userId.username,
        text: populated.replyTo.text
      };
    }

    return response;

  } catch (err) {
    await session.abortTransaction();
    console.error('Error saving message:', err);
    throw err; // Mejor lanzar el error para manejarlo en la ruta
  } finally {
    session.endSession();
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
    throw err; // Propagar el error para manejo consistente
  }
}

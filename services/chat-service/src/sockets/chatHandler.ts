import { Server, Socket } from 'socket.io';
import { Message } from '../models/Message';
import { Queue } from 'bullmq';
import { Conversation } from '../models/Conversation';
import { fetchLinkPreview } from '../utils/linkPreview';

export const registerChatHandlers = (
  io: Server,
  socket: Socket,
  notificationQueue: Queue,
  redisClient: any
) => {
  const userId = socket.data.userId;

  // --- JOIN ROOM ---
  socket.on('join_room', async (roomId: string) => {
    socket.join(roomId);
    try {
      // Reset unread count for this user/room
      await redisClient.hSet(`unread:${userId}`, roomId, 0);
      const unreadCounts = await redisClient.hGetAll(`unread:${userId}`);
      socket.emit('unread_counts', unreadCounts);
    } catch (err) {
      console.error("Error joining room:", err);
    }
  });

  // --- SEND MESSAGE (Aligned with Frontend 'message:send') ---
  socket.on('message:send', async (data: { 
    conversationId: string, 
    content: string 
  }) => {
    try {
      const urlMatch = data.content.match(/https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/i);
      let linkPreview: any = null;
      if (urlMatch) {
        linkPreview = await fetchLinkPreview(urlMatch[0]);
      }

      const newMessage = await Message.create({
        conversationId: data.conversationId,
        sender: userId,
        text: data.content,
        linkPreview: linkPreview || undefined
      });

      const messagePayload = {
        id: newMessage._id,
        conversationId: data.conversationId,
        content: data.content,
        senderId: userId,
        senderName: socket.data.name || 'User',
        createdAt: newMessage.createdAt,
        isRead: false,
        linkPreview
      };

      // Emit to room (including sender)
      io.to(data.conversationId).emit('message:new', messagePayload);

      // Update Conversation lastMessage
      await Conversation.findByIdAndUpdate(data.conversationId, {
        lastMessage: newMessage._id
      });

      // Unread badge logic
      const conversation = await Conversation.findById(data.conversationId);
      if (conversation) {
        for (const participantId of conversation.participants) {
          if (participantId.toString() !== userId.toString()) {
            await redisClient.hIncrBy(`unread:${participantId}`, data.conversationId, 1);
            const unreadCounts = await redisClient.hGetAll(`unread:${participantId}`);
            io.to(participantId.toString()).emit('unread_counts', unreadCounts);
          }
        }
      }
    } catch (err) {
      console.error("Failed to save/send message:", err);
    }
  });

  // --- TYPING EVENTS ---
  socket.on('typing:start', (data: { conversationId: string }) => {
    socket.to(data.conversationId).emit('typing:start', { 
      userId, 
      conversationId: data.conversationId 
    });
  });

  socket.on('typing:stop', (data: { conversationId: string }) => {
    socket.to(data.conversationId).emit('typing:stop', { 
      userId, 
      conversationId: data.conversationId 
    });
  });

  // --- PRESENCE ---
  socket.on('presence:set', async (data: { status: string }) => {
    await redisClient.set(`user:${userId}:status`, data.status);
    io.emit('presence:update', { userId, status: data.status });
  });

  socket.on('disconnect', async () => {
    await redisClient.set(`user:${userId}:status`, 'offline');
    io.emit('presence:update', { userId, status: 'offline' });
  });
};

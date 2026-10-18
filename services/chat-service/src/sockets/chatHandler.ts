import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { Queue } from 'bullmq';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { User } from '../../../../shared/models/User';
import { fetchLinkPreview } from '../utils/linkPreview';
import {
  validated,
  joinRoomSchema,
  sendMessageSchema,
  readReceiptSchema,
  typingSchema,
  presenceSchema,
  editMessageSchema,
  deleteMessageSchema,
} from '../validation/socketSchemas';

/**
 * How long after sending a message it can still be edited. Messenger uses 15
 * minutes; the point is that conversations people have already read shouldn't
 * silently change underneath them.
 */
const EDIT_WINDOW_MS = 15 * 60 * 1000;

/**
 * Membership check for a conversation, cached briefly per socket.
 *
 * Previously any authenticated socket could `join_room` with an arbitrary
 * conversation id and receive every message in it, and could post into any
 * conversation. Room ids are Mongo ObjectIds, so this was the only thing
 * standing between a user and every other conversation on the server.
 */
function makeMembershipChecker(userId: string) {
  const cache = new Map<string, { ok: boolean; at: number }>();
  const TTL_MS = 30_000;

  return async function isParticipant(conversationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(conversationId)) return false;

    const hit = cache.get(conversationId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.ok;

    const ok = await Conversation.exists({
      _id: new Types.ObjectId(conversationId),
      participants: new Types.ObjectId(userId),
    }).then(Boolean).catch(() => false);

    cache.set(conversationId, { ok, at: Date.now() });
    return ok;
  };
}

/** Redis hashes come back as strings; the client wants numbers. */
function toCounts(raw: Record<string, string> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = Number(v) || 0;
  return out;
}

export const registerChatHandlers = (
  io: Server,
  socket: Socket,
  notificationQueue: Queue | null,
  redisClient: any | null
) => {
  const userId: string = socket.data.userId;
  const isParticipant = makeMembershipChecker(userId);

  // Personal room, used for targeted events (unread counts, friend requests).
  socket.join(`user:${userId}`);

  const announcePresence = (status: string) => {
    io.emit('presence:update', { userId, status });
  };

  announcePresence('online');
  if (redisClient) {
    redisClient.set(`user:${userId}:status`, 'online').catch(() => {});
  }

  // --- JOIN ROOM ---
  socket.on('join_room', validated(joinRoomSchema, socket, 'join_room', async (roomId) => {
    if (!(await isParticipant(roomId))) {
      socket.emit('room:error', { conversationId: roomId, error: 'Not a participant' });
      return;
    }
    socket.join(roomId);

    if (redisClient) {
      await redisClient.hSet(`unread:${userId}`, roomId, 0);
      socket.emit('unread_counts', toCounts(await redisClient.hGetAll(`unread:${userId}`)));
    }
  }));

  socket.on('leave_room', validated(joinRoomSchema, socket, 'leave_room', (roomId) => {
    socket.leave(roomId);
  }));

  // --- SEND MESSAGE ---
  socket.on('message:send', validated(sendMessageSchema, socket, 'message:send', async (data) => {
      const conversationId = data.conversationId;
      if (!(await isParticipant(conversationId))) {
        socket.emit('message:error', { error: 'Not a participant in this conversation' });
        return;
      }

      const text = data.content;
      // fileUrl is the R2 path from the presigned upload; fileData is the legacy
      // base64 fallback used when object storage isn't configured.
      const fileUrl = data.fileUrl ?? data.fileData;

      if (!text.trim() && !fileUrl) {
        socket.emit('message:error', { error: 'Message is empty' });
        return;
      }

      const isEncrypted = Boolean(data.isEncrypted);
      const iv = data.iv;

      const senderUser = await User.findById(userId).select('name email profile').lean();
      const senderName = senderUser?.name || senderUser?.email || 'User';

      const newMessage: any = await Message.create({
        conversationId: new Types.ObjectId(conversationId),
        sender: new Types.ObjectId(userId),
        text,
        fileUrl,
        fileName: data.fileName,
        fileType: data.fileType,
        isEncrypted,
        iv,
      });

      const messagePayload = {
        id: newMessage._id.toString(),
        conversationId,
        content: text,
        senderId: userId,
        senderName,
        senderAvatar: (senderUser as any)?.profile?.avatar,
        fileUrl,
        fileName: newMessage.fileName,
        fileType: newMessage.fileType,
        isEncrypted,
        iv,
        createdAt: newMessage.createdAt,
        isRead: false,
        linkPreview: null as any,
      };

      // Deliver first; the link preview is a slow network call and used to block
      // every message containing a URL behind an un-timeboxed fetch.
      io.to(conversationId).emit('message:new', messagePayload);

      await Conversation.findByIdAndUpdate(conversationId, { lastMessage: newMessage._id });

      const participants = (await Conversation.findById(conversationId).select('participants').lean())
        ?.participants ?? [];
      const recipients = participants
        .map((p: any) => p.toString())
        .filter((id: string) => id !== userId);

      if (redisClient) {
        for (const participantId of recipients) {
          try {
            await redisClient.hIncrBy(`unread:${participantId}`, conversationId, 1);
            const counts = toCounts(await redisClient.hGetAll(`unread:${participantId}`));
            io.to(`user:${participantId}`).emit('unread_counts', counts);
          } catch (err) {
            console.error('[Chat] unread count update failed:', err);
          }
        }
      }

      // The queue was being created and passed around but never used, so push
      // notifications never fired for offline users.
      if (notificationQueue) {
        for (const receiverId of recipients) {
          notificationQueue
            .add('new-message', {
              senderId: userId,
              senderName,
              receiverId,
              conversationId,
              messageContent: isEncrypted ? '🔒 Secret message' : text.slice(0, 200),
            }, { removeOnComplete: true, attempts: 3 })
            .catch((err) => console.warn('[Chat] notification enqueue failed:', err.message));
        }
      }

      // Resolve the preview after the fact and patch the message in place.
      // Encrypted messages do not have plaintext URLs visible to the server.
      if (!isEncrypted) {
        const urlMatch = text.match(/https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/i);
        if (urlMatch) {
          const linkPreview = await fetchLinkPreview(urlMatch[0]);
          if (linkPreview) {
            await Message.findByIdAndUpdate(newMessage._id, { linkPreview });
            io.to(conversationId).emit('message:update', {
              id: newMessage._id.toString(),
              conversationId,
              linkPreview,
            });
          }
        }
      }
  }));

  // --- READ RECEIPTS ---
  // The client has always emitted this; there was no listener, so the
  // double-check-mark state could never become true.
  socket.on('message:read', validated(readReceiptSchema, socket, 'message:read', async (data) => {
      const { conversationId, messageId } = data;
      if (!(await isParticipant(conversationId))) return;

      await Message.updateOne(
        { _id: new Types.ObjectId(messageId), conversationId: new Types.ObjectId(conversationId) },
        { $addToSet: { readBy: new Types.ObjectId(userId) } }
      );

      io.to(conversationId).emit('message:read', { messageId, conversationId, userId });

      if (redisClient) {
        await redisClient.hSet(`unread:${userId}`, conversationId, 0);
        socket.emit('unread_counts', toCounts(await redisClient.hGetAll(`unread:${userId}`)));
      }
  }));

  // --- EDIT MESSAGE ---
  socket.on('message:edit', validated(editMessageSchema, socket, 'message:edit', async (data) => {
    const { conversationId, messageId, content } = data;
    if (!(await isParticipant(conversationId))) return;

    const message = await Message.findOne({
      _id: new Types.ObjectId(messageId),
      conversationId: new Types.ObjectId(conversationId),
    });

    if (!message) return;
    if (message.sender.toString() !== userId) {
      socket.emit('message:error', { error: 'You can only edit your own messages' });
      return;
    }
    if (message.isDeleted) {
      socket.emit('message:error', { error: 'That message was deleted' });
      return;
    }
    const age = Date.now() - new Date(message.createdAt).getTime();
    if (age > EDIT_WINDOW_MS) {
      socket.emit('message:error', { error: 'Messages can only be edited for 15 minutes' });
      return;
    }
    if (message.text === content) return;

    // Keep the previous text so an edit is auditable rather than silent.
    message.editHistory = [
      ...(message.editHistory ?? []),
      { text: message.text, editedAt: new Date(), editedBy: new Types.ObjectId(userId) },
    ] as any;
    message.text = content;
    message.isEdited = true;
    await message.save();

    io.to(conversationId).emit('message:update', {
      id: messageId,
      conversationId,
      content,
      isEdited: true,
      updatedAt: message.updatedAt,
    });
  }));

  // --- UNSEND / DELETE MESSAGE ---
  socket.on('message:delete', validated(deleteMessageSchema, socket, 'message:delete', async (data) => {
    const { conversationId, messageId, scope } = data;
    if (!(await isParticipant(conversationId))) return;

    const message = await Message.findOne({
      _id: new Types.ObjectId(messageId),
      conversationId: new Types.ObjectId(conversationId),
    });
    if (!message) return;

    if (scope === 'me') {
      // Hidden for this user only; everyone else still sees it.
      await Message.updateOne(
        { _id: message._id },
        { $addToSet: { hiddenFor: new Types.ObjectId(userId) } }
      );
      socket.emit('message:deleted', { id: messageId, conversationId, scope: 'me' });
      return;
    }

    if (message.sender.toString() !== userId) {
      socket.emit('message:error', { error: 'You can only unsend your own messages' });
      return;
    }

    // Soft delete: the row stays so replies and ordering survive, but the
    // content is cleared so it is genuinely gone.
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = new Types.ObjectId(userId) as any;
    message.text = '';
    message.fileUrl = undefined;
    message.fileName = undefined;
    message.fileType = undefined;
    message.linkPreview = undefined;
    await message.save();

    io.to(conversationId).emit('message:deleted', {
      id: messageId,
      conversationId,
      scope: 'everyone',
      deletedBy: userId,
    });
  }));

  // --- TYPING EVENTS ---
  const relayTyping = (event: 'typing:start' | 'typing:stop') =>
    validated(typingSchema, socket, event, async ({ conversationId }) => {
      if (!(await isParticipant(conversationId))) return;
      socket.to(conversationId).emit(event, { userId, conversationId });
    });

  socket.on('typing:start', relayTyping('typing:start'));
  socket.on('typing:stop', relayTyping('typing:stop'));

  // --- PRESENCE ---
  socket.on('presence:set', validated(presenceSchema, socket, 'presence:set', async ({ status }) => {
    if (redisClient) {
      await redisClient.set(`user:${userId}:status`, status).catch(() => {});
    }
    announcePresence(status);
  }));

  socket.on('disconnect', async () => {
    try {
      // Only go offline once the user's *last* socket closes. Otherwise closing
      // one of several open tabs marked the user offline for everyone.
      const remaining = await io.in(`user:${userId}`).fetchSockets();
      if (remaining.length > 0) return;

      if (redisClient) {
        await redisClient.set(`user:${userId}:status`, 'offline').catch(() => {});
      }
      announcePresence('offline');
    } catch (err) {
      console.error('[Chat] disconnect handler failed:', err);
    }
  });
};

import { Response } from 'express';
import { Types } from 'mongoose';
import { Message } from '../models/Message';
import { Conversation } from '../models/Conversation';
import { AuthenticatedRequest } from '../middleware/auth';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export const getMessagesByConversation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const conversationId = String(req.params.conversationId);
    if (!Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ error: 'Invalid conversation id' });
    }

    // Without this check any authenticated user could read any conversation's
    // history just by guessing or observing a conversation id.
    const isParticipant = await Conversation.exists({
      _id: new Types.ObjectId(conversationId),
      participants: new Types.ObjectId(userId),
    });
    if (!isParticipant) {
      return res.status(403).json({ error: 'Not a participant in this conversation' });
    }

    // Clamp so a client can't ask for the whole collection in one query.
    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const messages = await Message.find({
      conversationId: new Types.ObjectId(conversationId),
      isDeleted: { $ne: true },
      // "Delete for me" hides a message from one person without removing it
      // for anyone else.
      hiddenFor: { $ne: new Types.ObjectId(userId) },
    })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('sender', 'name email profile')
      .lean();

    const formatted = messages.reverse().map((msg: any) => ({
      id: msg._id.toString(),
      conversationId: msg.conversationId.toString(),
      senderId: msg.sender?._id?.toString() || msg.sender?.toString(),
      senderName: msg.sender?.name || msg.sender?.email || 'Unknown',
      senderAvatar: msg.sender?.profile?.avatar,
      content: msg.text,
      isEncrypted: Boolean(msg.isEncrypted),
      iv: msg.iv,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      fileType: msg.fileType,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      isEdited: Boolean(msg.isEdited),
      // "Read" means somebody other than the sender has read it. The old check
      // (`readBy.length > 0`) counted the sender's own read as a read receipt.
      isRead: (msg.readBy ?? []).some((id: any) => id.toString() !== (msg.sender?._id ?? msg.sender)?.toString()),
      linkPreview: msg.linkPreview,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[Chat] getMessages failed:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

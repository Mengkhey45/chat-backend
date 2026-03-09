import { Response } from 'express';
import { Message } from '../models/Message';
import { AuthenticatedRequest } from '../middleware/auth';

export const getMessagesByConversation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await Message.find({
      conversationId,
      isDeleted: { $ne: true }
    })
    .sort({ createdAt: -1 })
    .skip(Number(offset))
    .limit(Number(limit))
    .populate('sender', 'name email profile');

    // Format to match frontend Message interface and return in chronological order
    const formatted = messages.reverse().map((msg: any) => ({
      id: msg._id.toString(),
      conversationId: msg.conversationId.toString(),
      senderId: msg.sender?._id?.toString() || msg.sender?.toString(),
      senderName: msg.sender?.name || msg.sender?.email || 'Unknown',
      senderAvatar: msg.sender?.profile?.avatar,
      content: msg.text,
      fileUrl: msg.fileUrl,
      fileName: msg.fileName,
      fileType: msg.fileType,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
      isRead: msg.readBy?.length > 0,
      linkPreview: msg.linkPreview,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

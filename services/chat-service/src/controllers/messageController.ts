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
    .populate('sender', 'name email avatar status');

    // Return in chronological order
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
};

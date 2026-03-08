import { Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { AuthenticatedRequest } from '../middleware/auth';

export const getConversations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const conversations = await Conversation.find({
      participants: new Types.ObjectId(userId)
    } as any)
    .populate('participants', 'name email avatar status')
    .populate('lastMessage')
    .sort({ updatedAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

export const createConversation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { participants, name, isGroup } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Ensure current user is in participants and all are ObjectIds
    const allParticipants = Array.from(new Set([...participants, userId]))
      .map(id => new Types.ObjectId(id as string));

    // For DMs, check if one already exists
    if (!isGroup && allParticipants.length === 2) {
      const existing = await Conversation.findOne({
        isGroup: false,
        participants: { $all: allParticipants, $size: 2 }
      } as any);
      if (existing) {
        return res.json(existing);
      }
    }

    const conversation = await Conversation.create({
      participants: allParticipants,
      name,
      isGroup,
      groupAdmin: isGroup ? new Types.ObjectId(userId) : undefined
    });

    res.status(201).json(conversation);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

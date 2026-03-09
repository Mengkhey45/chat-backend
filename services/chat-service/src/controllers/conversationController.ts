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

    const formatted = conversations.map((conv: any) => {
      const participants = conv.participants || [];
      const isGroup = conv.isGroup;
      let name = conv.name;

      // For DMs, set name to the other participant's name
      if (!isGroup && !name) {
        const other = participants.find((p: any) => p._id?.toString() !== userId);
        name = other?.name || other?.email || 'Unknown';
      }

      return {
        id: conv._id.toString(),
        name: name || 'Unnamed',
        avatar: isGroup ? undefined : participants.find((p: any) => p._id?.toString() !== userId)?.avatar,
        type: isGroup ? 'group' : 'dm',
        members: participants.map((p: any) => p._id?.toString?.() || p.toString()),
        lastMessage: conv.lastMessage ? {
          id: conv.lastMessage._id?.toString(),
          content: conv.lastMessage.text,
          senderId: conv.lastMessage.sender?.toString(),
          createdAt: conv.lastMessage.createdAt,
        } : undefined,
        unreadCount: 0,
        createdAt: conv.createdAt,
      };
    });

    res.json(formatted);
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
      } as any).populate('participants', 'name email avatar status');
      if (existing) {
        const other = (existing.participants as any[]).find((p: any) => p._id.toString() !== userId);
        return res.json({
          id: existing._id.toString(),
          name: existing.name || other?.name || other?.email || 'Unknown',
          avatar: other?.avatar,
          type: 'dm',
          members: (existing.participants as any[]).map((p: any) => p._id.toString()),
          unreadCount: 0,
          createdAt: (existing as any).createdAt,
        });
      }
    }

    const conversation = await Conversation.create({
      participants: allParticipants,
      name,
      isGroup,
      groupAdmin: isGroup ? new Types.ObjectId(userId) : undefined
    });

    // Populate and return formatted
    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'name email avatar status');
    const other = !isGroup && populated
      ? (populated.participants as any[]).find((p: any) => p._id.toString() !== userId)
      : null;

    res.status(201).json({
      id: conversation._id.toString(),
      name: name || other?.name || other?.email || 'Unnamed',
      avatar: other?.avatar,
      type: isGroup ? 'group' : 'dm',
      members: allParticipants.map(p => p.toString()),
      unreadCount: 0,
      createdAt: (conversation as any).createdAt,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

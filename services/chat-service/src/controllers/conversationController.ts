import { Response } from 'express';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { FriendRequest } from '../../../../shared/models/FriendRequest';
import { AuthenticatedRequest } from '../middleware/auth';

const MAX_GROUP_SIZE = 100;

function formatConversation(conv: any, userId: string) {
  const participants = conv.participants || [];
  const other = participants.find((p: any) => p._id?.toString() !== userId);
  const isGroup = Boolean(conv.isGroup);
  const isE2EE = Boolean(conv.isE2EE);

  return {
    id: conv._id.toString(),
    name: conv.name || (isGroup ? 'Unnamed' : other?.name || other?.email || 'Unknown'),
    avatar: isGroup ? undefined : other?.profile?.avatar,
    type: isGroup ? 'group' : 'dm',
    isE2EE,
    members: participants.map((p: any) => p._id?.toString?.() || p.toString()),
    lastMessage: conv.lastMessage
      ? {
          id: conv.lastMessage._id?.toString(),
          content: conv.lastMessage.text,
          senderId: conv.lastMessage.sender?.toString(),
          isEncrypted: Boolean(conv.lastMessage.isEncrypted),
          iv: conv.lastMessage.iv,
          createdAt: conv.lastMessage.createdAt,
        }
      : undefined,
    unreadCount: 0, // authoritative value arrives over the socket's `unread_counts`
    createdAt: conv.createdAt,
    groupAdmin: conv.groupAdmin?.toString?.() ?? conv.groupAdmin,
    memberDetails: participants
      .filter((p: any) => p?._id)
      .map((p: any) => ({
        id: p._id.toString(),
        name: p.name || p.email || 'Unknown',
        email: p.email,
        avatar: p.profile?.avatar,
        publicKey: p.publicKey,
      })),
  };
}

/** Loads a conversation the caller belongs to, or null. */
async function loadOwnConversation(conversationId: string, userId: string) {
  if (!Types.ObjectId.isValid(conversationId)) return null;
  return Conversation.findOne({
    _id: new Types.ObjectId(conversationId),
    participants: new Types.ObjectId(userId),
  });
}

/** The set of user ids the caller has an accepted friend request with. */
async function friendIdsOf(userId: string): Promise<Set<string>> {
  const me = new Types.ObjectId(userId);
  const accepted = await FriendRequest.find({
    status: 'accepted',
    $or: [{ sender: me }, { receiver: me }],
  } as any).select('sender receiver').lean();

  const ids = new Set<string>();
  for (const r of accepted as any[]) {
    ids.add(r.sender.toString() === userId ? r.receiver.toString() : r.sender.toString());
  }
  return ids;
}

export const getConversations = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const conversations = await Conversation.find({
      participants: new Types.ObjectId(userId),
    } as any)
      .populate('participants', 'name email profile publicKey')
      .populate('lastMessage')
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();

    res.json(conversations.map((c) => formatConversation(c, userId)));
  } catch (error) {
    console.error('[Chat] getConversations failed:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

export const createConversation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { participants, name, isGroup, isE2EE } = req.body ?? {};

    if (!Array.isArray(participants)) {
      return res.status(400).json({ error: '`participants` must be an array of user ids' });
    }

    const ids = [...new Set([...participants.map(String), userId])];
    if (ids.some((id) => !Types.ObjectId.isValid(id))) {
      return res.status(400).json({ error: 'Invalid participant id' });
    }
    if (ids.length < 2) {
      return res.status(400).json({ error: 'A conversation needs at least two participants' });
    }
    if (ids.length > MAX_GROUP_SIZE) {
      return res.status(400).json({ error: `Groups are limited to ${MAX_GROUP_SIZE} members` });
    }
    if (!isGroup && ids.length !== 2) {
      return res.status(400).json({ error: 'A direct message must have exactly two participants' });
    }
    if (isGroup && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'A group needs a name' });
    }

    // You can only open a conversation with people you're actually friends with.
    // Without this, anyone could create a conversation with an arbitrary user id
    // and start messaging a stranger.
    const me = new Types.ObjectId(userId);
    const others = ids.filter((id) => id !== userId);
    const friends = await friendIdsOf(userId);
    if (others.some((id) => !friends.has(id))) {
      return res.status(403).json({ error: 'You can only start conversations with your friends' });
    }

    const allParticipants = ids.map((id) => new Types.ObjectId(id));

    if (!isGroup) {
      const existing = await Conversation.findOne({
        isGroup: false,
        isE2EE: Boolean(isE2EE),
        participants: { $all: allParticipants, $size: 2 },
      } as any)
        .populate('participants', 'name email profile publicKey')
        .lean();
      if (existing) return res.json(formatConversation(existing, userId));
    }

    const conversation = await Conversation.create({
      participants: allParticipants,
      name: typeof name === 'string' ? name.trim().slice(0, 100) : undefined,
      isGroup: Boolean(isGroup),
      isE2EE: Boolean(isE2EE),
      groupAdmin: isGroup ? me : undefined,
    });

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'name email profile publicKey')
      .lean();

    res.status(201).json(formatConversation(populated, userId));
  } catch (error) {
    console.error('[Chat] createConversation failed:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};


/** Rename a group. Admin only. */
export const updateConversation = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const conversation = await loadOwnConversation(String(req.params.conversationId), userId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!conversation.isGroup) return res.status(400).json({ error: 'Not a group' });
    if (conversation.groupAdmin?.toString() !== userId) {
      return res.status(403).json({ error: 'Only the group admin can rename this group' });
    }

    const { name } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'A group needs a name' });
    }

    conversation.name = name.trim().slice(0, 100);
    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'name email profile')
      .lean();
    res.json(formatConversation(populated, userId));
  } catch (error) {
    console.error('[Chat] updateConversation failed:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
};

/** Add members to a group. Admin only, and only people the admin is friends with. */
export const addMembers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const conversation = await loadOwnConversation(String(req.params.conversationId), userId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!conversation.isGroup) return res.status(400).json({ error: 'Not a group' });
    if (conversation.groupAdmin?.toString() !== userId) {
      return res.status(403).json({ error: 'Only the group admin can add members' });
    }

    const { members } = req.body ?? {};
    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ error: '`members` must be a non-empty array of user ids' });
    }
    if (members.some((id: any) => !Types.ObjectId.isValid(String(id)))) {
      return res.status(400).json({ error: 'Invalid member id' });
    }

    const existing = new Set(conversation.participants.map((p) => p.toString()));
    const toAdd = members.map(String).filter((id: string) => !existing.has(id));

    const friends = await friendIdsOf(userId);
    if (toAdd.some((id: string) => !friends.has(id))) {
      return res.status(403).json({ error: 'You can only add your friends to a group' });
    }
    if (existing.size + toAdd.length > MAX_GROUP_SIZE) {
      return res.status(400).json({ error: `Groups are limited to ${MAX_GROUP_SIZE} members` });
    }

    conversation.participants.push(...toAdd.map((id: string) => new Types.ObjectId(id)));
    await conversation.save();

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'name email profile')
      .lean();
    res.json(formatConversation(populated, userId));
  } catch (error) {
    console.error('[Chat] addMembers failed:', error);
    res.status(500).json({ error: 'Failed to add members' });
  }
};

/**
 * Remove a member, or leave the group yourself.
 *
 * The admin can remove anyone; anyone can remove themselves. When the admin
 * leaves, the role passes to the next member so the group isn't orphaned; when
 * the last member leaves, the group is deleted.
 */
export const removeMember = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const targetId = String(req.params.memberId);
    if (!Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ error: 'Invalid member id' });
    }

    const conversation = await loadOwnConversation(String(req.params.conversationId), userId);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (!conversation.isGroup) return res.status(400).json({ error: 'Not a group' });

    const isAdmin = conversation.groupAdmin?.toString() === userId;
    const isSelf = targetId === userId;
    if (!isAdmin && !isSelf) {
      return res.status(403).json({ error: 'Only the group admin can remove other members' });
    }

    conversation.participants = conversation.participants.filter(
      (p) => p.toString() !== targetId
    ) as any;

    if (conversation.participants.length === 0) {
      await Conversation.deleteOne({ _id: conversation._id });
      return res.json({ message: 'Group deleted', deleted: true });
    }

    if (conversation.groupAdmin?.toString() === targetId) {
      conversation.groupAdmin = conversation.participants[0];
    }
    await conversation.save();

    if (isSelf) return res.json({ message: 'You left the group', left: true });

    const populated = await Conversation.findById(conversation._id)
      .populate('participants', 'name email profile')
      .lean();
    res.json(formatConversation(populated, userId));
  } catch (error) {
    console.error('[Chat] removeMember failed:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
};

import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../middleware/auth';
import { FriendRequest } from '../../../../shared/models/FriendRequest';
import { Conversation } from '../models/Conversation';
import { User } from '../../../../shared/models/User';

export const getFriends = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized: missing userId in request' });

    const userObjectId = new Types.ObjectId(userId);

    // Friends are users where we have an 'accepted' friend request
    const requests = await FriendRequest.find({
      $or: [
        { sender: userObjectId, status: 'accepted' },
        { receiver: userObjectId, status: 'accepted' }
      ]
    } as any)
      .populate('sender', 'name email profile')
      .populate('receiver', 'name email profile');

    const friends = requests.map(reqDoc => {
      const sender = reqDoc.sender as any;
      const receiver = reqDoc.receiver as any;
      const otherUser = sender._id.toString() === userId ? receiver : sender;
      return {
        id: otherUser._id.toString(),
        userId: otherUser._id.toString(),
        name: otherUser.name || otherUser.email,
        email: otherUser.email,
        avatar: otherUser.profile?.avatar || undefined,
        status: 'offline',
      };
    });

    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
};

export const getPendingRequests = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const userObjectId = new Types.ObjectId(userId);

    const requests = await FriendRequest.find({
      receiver: userObjectId,
      status: 'pending'
    } as any).populate('sender', 'name email profile');

    const formatted = requests.map(r => ({
      id: r._id.toString(),
      fromUser: {
        id: (r.sender as any)._id.toString(),
        name: (r.sender as any).name,
        email: (r.sender as any).email,
        avatar: (r.sender as any).profile?.avatar,
      },
      toUserId: userId,
      status: r.status,
      createdAt: (r as any).createdAt,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
};

export const sendFriendRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { receiverEmail, receiverName, receiverId } = req.body;
    const senderId = req.user?.userId;

    if (!senderId) return res.status(401).json({ error: 'Unauthorized' });

    let receiver;
    if (receiverId) {
      receiver = await User.findById(receiverId);
    } else if (receiverEmail) {
      receiver = await User.findOne({ email: receiverEmail });
    } else if (receiverName) {
      receiver = await User.findOne({ name: receiverName });
    }

    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (receiver._id.toString() === senderId) {
      return res.status(400).json({ error: 'Cannot add yourself' });
    }

    const senderObjectId = new Types.ObjectId(senderId);
    const receiverObjectId = receiver._id as Types.ObjectId;

    const existing = await FriendRequest.findOne({
      $or: [
        { sender: senderObjectId, receiver: receiverObjectId },
        { sender: receiverObjectId, receiver: senderObjectId }
      ]
    } as any);

    if (existing) {
      return res.status(400).json({ error: 'Request already exists' });
    }

    const request = await FriendRequest.create({
      sender: senderObjectId,
      receiver: receiverObjectId,
      status: 'pending'
    });

    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ error: 'Failed to send request' });
  }
};

export const getUserPublicInfo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('name email avatar');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user._id.toString(), name: (user as any).name, email: (user as any).email, avatar: (user as any).avatar });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const checkFriendStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentUserId = req.user?.userId;
    const targetUserId = req.params.userId as string;
    if (!currentUserId) return res.status(401).json({ error: 'Unauthorized' });

    const currentOid = new Types.ObjectId(currentUserId);
    const targetOid = new Types.ObjectId(targetUserId);

    const request = await FriendRequest.findOne({
      $or: [
        { sender: currentOid, receiver: targetOid },
        { sender: targetOid, receiver: currentOid }
      ]
    } as any);

    if (!request) {
      return res.json({ status: 'none' });
    }

    // Determine direction
    const isSender = request.sender.toString() === currentUserId;
    res.json({
      status: request.status, // 'pending', 'accepted', 'rejected'
      direction: isSender ? 'outgoing' : 'incoming',
      requestId: request._id.toString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check friend status' });
  }
};

export const handleFriendRequest = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    const { status } = req.body; // 'accepted' or 'rejected'
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const request = await FriendRequest.findById(requestId);
    if (!request || request.receiver.toString() !== userId) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.status = status;
    await request.save();

    if (status === 'accepted') {
      // Create conversation if it doesn't exist
      const existing = await Conversation.findOne({
        isGroup: false,
        participants: { $all: [request.sender, request.receiver], $size: 2 }
      } as any);

      if (!existing) {
        await Conversation.create({
          participants: [request.sender, request.receiver],
          isGroup: false
        });
      }
    }

    res.json({ message: `Request ${status}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to handle request' });
  }
};

export const updatePublicKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { publicKey } = req.body ?? {};
    if (!publicKey || typeof publicKey !== 'string') {
      return res.status(400).json({ error: 'publicKey string is required' });
    }
    if (publicKey.length > 5000) {
      return res.status(400).json({ error: 'publicKey is too large' });
    }

    await User.findByIdAndUpdate(userId, { publicKey });
    res.json({ message: 'Public key updated successfully' });
  } catch (error) {
    console.error('[Chat] updatePublicKey failed:', error);
    res.status(500).json({ error: 'Failed to update public key' });
  }
};

export const getUserPublicKey = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = String(req.params.userId);
    if (!Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await User.findById(userId).select('publicKey').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ userId, publicKey: (user as any).publicKey || null });
  } catch (error) {
    console.error('[Chat] getUserPublicKey failed:', error);
    res.status(500).json({ error: 'Failed to fetch public key' });
  }
};

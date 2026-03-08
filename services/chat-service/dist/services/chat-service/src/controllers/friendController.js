"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleFriendRequest = exports.sendFriendRequest = exports.getFriends = void 0;
const FriendRequest_1 = require("../../../../shared/models/FriendRequest");
const Conversation_1 = require("../models/Conversation");
const user_1 = __importDefault(require("../../../auth-service/src/models/user")); // Using the User model from auth-service
const getFriends = async (req, res) => {
    try {
        const userId = req.user?.userId;
        // Friends are users where we have an 'accepted' friend request
        const requests = await FriendRequest_1.FriendRequest.find({
            $or: [
                { sender: userId, status: 'accepted' },
                { receiver: userId, status: 'accepted' }
            ]
        }).populate('sender receiver', 'name email avatar status');
        const friends = requests.map(req => {
            const otherUser = req.sender._id.toString() === userId ? req.receiver : req.sender;
            return otherUser;
        });
        res.json(friends);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch friends' });
    }
};
exports.getFriends = getFriends;
const sendFriendRequest = async (req, res) => {
    try {
        const { receiverEmail } = req.body;
        const senderId = req.user?.userId;
        const receiver = await user_1.default.findOne({ email: receiverEmail });
        if (!receiver) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (receiver._id.toString() === senderId) {
            return res.status(400).json({ error: 'Cannot add yourself' });
        }
        const existing = await FriendRequest_1.FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiver._id },
                { sender: receiver._id, receiver: senderId }
            ]
        });
        if (existing) {
            return res.status(400).json({ error: 'Request already exists' });
        }
        const request = await FriendRequest_1.FriendRequest.create({
            sender: senderId,
            receiver: receiver._id,
            status: 'pending'
        });
        res.status(201).json(request);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to send request' });
    }
};
exports.sendFriendRequest = sendFriendRequest;
const handleFriendRequest = async (req, res) => {
    try {
        const { requestId } = req.params;
        const { status } = req.body; // 'accepted' or 'rejected'
        const userId = req.user?.userId;
        const request = await FriendRequest_1.FriendRequest.findById(requestId);
        if (!request || request.receiver.toString() !== userId) {
            return res.status(404).json({ error: 'Request not found' });
        }
        request.status = status;
        await request.save();
        if (status === 'accepted') {
            // Create conversation
            await Conversation_1.Conversation.create({
                participants: [request.sender, request.receiver],
                isGroup: false
            });
        }
        res.json({ message: `Request ${status}` });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to handle request' });
    }
};
exports.handleFriendRequest = handleFriendRequest;

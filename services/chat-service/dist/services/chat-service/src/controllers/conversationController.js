"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConversation = exports.getConversations = void 0;
const Conversation_1 = require("../models/Conversation");
const getConversations = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const conversations = await Conversation_1.Conversation.find({
            participants: userId
        })
            .populate('participants', 'name email avatar status')
            .populate('lastMessage')
            .sort({ updatedAt: -1 });
        res.json(conversations);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
};
exports.getConversations = getConversations;
const createConversation = async (req, res) => {
    try {
        const { participants, name, isGroup } = req.body;
        const userId = req.user?.userId;
        // Ensure current user is in participants
        const allParticipants = Array.from(new Set([...participants, userId]));
        // For DMs, check if one already exists
        if (!isGroup && allParticipants.length === 2) {
            const existing = await Conversation_1.Conversation.findOne({
                isGroup: false,
                participants: { $all: allParticipants, $size: 2 }
            });
            if (existing) {
                return res.json(existing);
            }
        }
        const conversation = await Conversation_1.Conversation.create({
            participants: allParticipants,
            name,
            isGroup,
            groupAdmin: isGroup ? userId : undefined
        });
        res.status(201).json(conversation);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create conversation' });
    }
};
exports.createConversation = createConversation;

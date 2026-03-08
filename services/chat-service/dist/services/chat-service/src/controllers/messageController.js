"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMessagesByConversation = void 0;
const Message_1 = require("../models/Message");
const getMessagesByConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 50, offset = 0 } = req.query;
        const messages = await Message_1.Message.find({
            conversationId,
            isDeleted: { $ne: true }
        })
            .sort({ createdAt: -1 })
            .skip(Number(offset))
            .limit(Number(limit))
            .populate('sender', 'name email avatar status');
        // Return in chronological order
        res.json(messages.reverse());
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
};
exports.getMessagesByConversation = getMessagesByConversation;

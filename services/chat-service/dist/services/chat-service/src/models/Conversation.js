"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Conversation = void 0;
const mongoose_1 = require("mongoose");
const conversationSchema = new mongoose_1.Schema({
    name: { type: String, trim: true },
    isGroup: { type: Boolean, default: false },
    participants: [{ type: mongoose_1.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Message' }, // For the "Messenger" list view
    groupAdmin: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' } // Only used if isGroup is true
}, { timestamps: true });
exports.Conversation = (0, mongoose_1.model)('Conversation', conversationSchema);

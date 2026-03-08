"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FriendRequest = void 0;
const mongoose_1 = require("mongoose");
const friendRequestSchema = new mongoose_1.Schema({
    sender: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
}, { timestamps: true });
// Prevent duplicate requests between same users
friendRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });
const FriendRequest = (0, mongoose_1.model)('FriendRequest', friendRequestSchema);
exports.FriendRequest = FriendRequest;

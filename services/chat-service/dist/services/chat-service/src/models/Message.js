"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const mongoose_1 = require("mongoose");
// 2. Define the Schema (for MongoDB structure)
const messageSchema = new mongoose_1.Schema({
    linkPreview: {
        type: {
            url: { type: String },
            title: { type: String },
            description: { type: String },
            image: { type: String }
        },
        required: false,
        default: undefined
    },
    conversationId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true // 👈 Improves speed when loading history
    },
    sender: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    text: {
        type: String,
        required: true,
        trim: true
    },
    attachments: [{
            type: String
        }],
    readBy: [{
            type: mongoose_1.Schema.Types.ObjectId,
            ref: 'User'
        }],
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    },
    deletedAt: Date,
    deletedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: 'User',
    },
    isEdited: {
        type: Boolean,
        default: false
    },
    editHistory: [
        {
            text: String,
            editedAt: Date,
            editedBy: {
                type: mongoose_1.Schema.Types.ObjectId,
                ref: 'User',
            }
        }
    ]
}, {
    timestamps: true // 👈 Automatically adds createdAt and updatedAt
});
// 3. Create the Model
exports.Message = (0, mongoose_1.model)('Message', messageSchema);

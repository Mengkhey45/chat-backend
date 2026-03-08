import { Schema, model } from 'mongoose';
const friendRequestSchema = new Schema({
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
}, { timestamps: true });
// Prevent duplicate requests between same users
friendRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });
const FriendRequest = model('FriendRequest', friendRequestSchema);
export { FriendRequest };

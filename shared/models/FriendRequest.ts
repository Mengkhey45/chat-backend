import { Schema, model, Document, Types } from 'mongoose';

export interface IFriendRequest extends Document {
  sender: Types.ObjectId;
  receiver: Types.ObjectId;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Date;
}

const friendRequestSchema = new Schema<IFriendRequest>({
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

import mongoose from 'mongoose';
const FriendRequest = mongoose.models.FriendRequest as mongoose.Model<IFriendRequest> || model<IFriendRequest>('FriendRequest', friendRequestSchema);
export { FriendRequest };

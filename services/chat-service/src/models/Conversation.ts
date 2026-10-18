import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IConversation extends Document {
  name?: string;           // Only for Groups
  isGroup: boolean;
  isE2EE?: boolean;
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  groupAdmin?: Types.ObjectId;
}

const conversationSchema = new Schema<IConversation>({
  name: { type: String, trim: true }, 
  isGroup: { type: Boolean, default: false },
  isE2EE: { type: Boolean, default: false },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
  groupAdmin: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Every conversation lookup filters on participants; without this index each
// query is a full collection scan.
conversationSchema.index({ participants: 1, updatedAt: -1 });

export const Conversation = (mongoose.models.Conversation as mongoose.Model<IConversation>) || mongoose.model<IConversation>('Conversation', conversationSchema);

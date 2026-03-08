import { Schema, model, Document, Types } from 'mongoose';

export interface IConversation extends Document {
  name?: string;           // Only for Groups
  isGroup: boolean;
  participants: Types.ObjectId[];
  lastMessage?: Types.ObjectId;
  groupAdmin?: Types.ObjectId;
}

const conversationSchema = new Schema<IConversation>({
  name: { type: String, trim: true }, 
  isGroup: { type: Boolean, default: false },
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  lastMessage: { type: Schema.Types.ObjectId, ref: 'Message' },
  groupAdmin: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

export const Conversation = model<IConversation>('Conversation', conversationSchema);

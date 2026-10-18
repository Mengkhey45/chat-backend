import mongoose, { Schema, Document, Types } from 'mongoose';

// 1. Define the Interface (for TypeScript safety)
export interface IMessage extends Document {
    linkPreview?: {
      url: string;
      title?: string;
      description?: string;
      image?: string;
    };
  conversationId: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
  isEncrypted?: boolean;
  iv?: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  attachments?: string[]; // Array of URLs (Cloudflare R2)
  readBy: Types.ObjectId[];
  isDeleted?: boolean;
  hiddenFor?: Types.ObjectId[];
  deletedAt?: Date;
  deletedBy?: Types.ObjectId;
  isEdited?: boolean;
  editHistory?: Array<{
    text: string;
    editedAt: Date;
    editedBy: Types.ObjectId;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

// 2. Define the Schema (for MongoDB structure)
const messageSchema = new Schema<IMessage>({
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
    type: Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true,
    index: true // 👈 Improves speed when loading history
  },
  sender: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  text: { 
    type: String, 
    default: '',
    trim: true 
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  iv: {
    type: String
  },
  fileUrl: { type: String },
  fileName: { type: String },
  fileType: { type: String },
  attachments: [{ 
    type: String 
  }],
  readBy: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  // "Delete for me" — the message survives for everyone else.
  hiddenFor: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  deletedAt: Date,
  deletedBy: {
    type: Schema.Types.ObjectId,
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
        type: Schema.Types.ObjectId,
        ref: 'User',
      }
    }
  ]
},
{ 
  timestamps: true // 👈 Automatically adds createdAt and updatedAt
}
);

// History is always read as "newest N in this conversation" — make that a single
// index hit instead of a sort over every message in the conversation.
messageSchema.index({ conversationId: 1, createdAt: -1 });

// 3. Create the Model
export const Message = (mongoose.models.Message as mongoose.Model<IMessage>) || mongoose.model<IMessage>('Message', messageSchema);
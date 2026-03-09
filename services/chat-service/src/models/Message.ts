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
  attachments?: string[]; // Array of URLs (Cloudflare R2)
  readBy: Types.ObjectId[];
  isDeleted?: boolean;
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
    required: true,
    trim: true 
  },
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

// 3. Create the Model
export const Message = (mongoose.models.Message as mongoose.Model<IMessage>) || mongoose.model<IMessage>('Message', messageSchema);
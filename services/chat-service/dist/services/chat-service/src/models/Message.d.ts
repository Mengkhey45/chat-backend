import { Document, Types } from 'mongoose';
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
    attachments?: string[];
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
export declare const Message: import("mongoose").Model<IMessage, {}, {}, {}, Document<unknown, {}, IMessage, {}, import("mongoose").DefaultSchemaOptions> & IMessage & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IMessage>;
//# sourceMappingURL=Message.d.ts.map
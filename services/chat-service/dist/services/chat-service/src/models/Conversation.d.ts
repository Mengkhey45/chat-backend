import { Schema, Document } from 'mongoose';
export interface IConversation extends Document {
    name?: string;
    isGroup: boolean;
    participants: Schema.Types.ObjectId[];
    lastMessage?: Schema.Types.ObjectId;
    groupAdmin?: Schema.Types.ObjectId;
}
export declare const Conversation: import("mongoose").Model<IConversation, {}, {}, {}, Document<unknown, {}, IConversation, {}, import("mongoose").DefaultSchemaOptions> & IConversation & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IConversation>;
//# sourceMappingURL=Conversation.d.ts.map
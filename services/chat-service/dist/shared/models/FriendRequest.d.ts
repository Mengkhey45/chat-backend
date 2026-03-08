import { Schema, Document } from 'mongoose';
export interface IFriendRequest extends Document {
    sender: Schema.Types.ObjectId;
    receiver: Schema.Types.ObjectId;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: Date;
}
declare const FriendRequest: import("mongoose").Model<IFriendRequest, {}, {}, {}, Document<unknown, {}, IFriendRequest, {}, import("mongoose").DefaultSchemaOptions> & IFriendRequest & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IFriendRequest>;
export { FriendRequest };
//# sourceMappingURL=FriendRequest.d.ts.map
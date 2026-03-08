import mongoose, { Document } from "mongoose";
export interface IUser extends Document {
    email: string;
    passwordHash?: string;
    oauthProvider?: string;
    oauthProviderId?: string;
    name?: string;
    emailVerified?: boolean;
    emailVerification?: {
        codeHash?: string;
        expiresAt?: Date;
    };
    passwordReset?: {
        codeHash?: string;
        expiresAt?: Date;
    };
    profile?: {
        firstName?: string;
        lastName?: string;
        avatar?: string;
    };
    lastLogin?: Date;
    createdAt?: Date;
    updatedAt?: Date;
    toSafeObject(): object;
}
declare const User: mongoose.Model<IUser, {}, {}, {}, mongoose.Document<unknown, {}, IUser, {}, mongoose.DefaultSchemaOptions> & IUser & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
} & {
    id: string;
}, any, IUser>;
export { User };
//# sourceMappingURL=User.d.ts.map
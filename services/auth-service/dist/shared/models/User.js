import mongoose, { Schema } from "mongoose";
const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    passwordHash: {
        type: String,
        required: function () {
            // passwordHash required only if the account was created with a password (not via OAuth)
            return !this.oauthProvider;
        },
        select: false
    },
    oauthProvider: { type: String },
    oauthProviderId: { type: String, index: true },
    name: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    emailVerification: {
        codeHash: String,
        expiresAt: Date
    },
    passwordReset: {
        codeHash: String,
        expiresAt: Date
    },
    profile: {
        firstName: String,
        lastName: String,
        avatar: String
    },
    lastLogin: Date
}, { timestamps: true });
userSchema.methods.toSafeObject = function () {
    return {
        id: this._id,
        email: this.email,
        name: this.name,
        fullName: `${this.profile?.firstName || ""} ${this.profile?.lastName || ""}`.trim(),
        emailVerified: this.emailVerified,
        profile: this.profile,
        lastLogin: this.lastLogin,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};
const User = mongoose.model("User", userSchema);
export { User };
// export type { IUser }; // Removed duplicate export

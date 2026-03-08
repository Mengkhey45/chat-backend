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
    // OAuth provider info (e.g., 'google') and provider id
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
/**
 * Safe object without sensitive info
 */
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
/**
 * Find user by email (with password) – unused helper
 */
// userSchema.statics.findByEmail = function(email) {
//   return this.findOne({ email: email.toLowerCase().trim() }).select("+passwordHash");
// };
const User = mongoose.model("User", userSchema);
export default User;

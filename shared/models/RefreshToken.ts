import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * A refresh token session.
 *
 * The raw token is never stored — only a SHA-256 hash — so a database leak
 * doesn't hand out working sessions. Tokens rotate on every use, and `family`
 * ties every rotation of one login together so that replaying an already-used
 * token can revoke the whole chain (see tokens.ts).
 */
export interface IRefreshToken extends Document {
  user: Types.ObjectId;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  usedAt?: Date;
  revokedAt?: Date;
  userAgent?: string;
  ip?: string;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    revokedAt: Date,
    // Recorded so a user can be shown their active sessions later.
    userAgent: { type: String, maxlength: 300 },
    ip: { type: String, maxlength: 60 },
  },
  { timestamps: true }
);

// Mongo drops expired documents on its own, so revoked sessions don't accumulate.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken =
  (mongoose.models.RefreshToken as mongoose.Model<IRefreshToken>) ||
  mongoose.model<IRefreshToken>('RefreshToken', refreshTokenSchema);

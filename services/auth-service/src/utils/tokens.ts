import crypto from 'node:crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { RefreshToken } from '../../../../shared/models/RefreshToken';

/**
 * Two-token auth.
 *
 * The access token is a short-lived JWT the browser holds in memory and sends
 * as a Bearer header. The refresh token is an opaque random string in an
 * httpOnly cookie, so JavaScript — including any XSS on the page — cannot read
 * it. Previously a single 7-day JWT lived in localStorage: readable by any
 * script on the origin, and impossible to revoke before it expired.
 */

export const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
export const REFRESH_COOKIE = 'refresh_token';

const isProd = () => process.env.NODE_ENV === 'production';

export function signAccessToken(userId: string, email?: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET as string, {
    expiresIn: ACCESS_TOKEN_TTL,
  } as SignOptions);
}

const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

function cookieOptions() {
  return {
    httpOnly: true,
    // Secure requires https; leaving it on in local dev would drop the cookie.
    secure: isProd(),
    // Lax still sends the cookie on top-level navigation (the OAuth redirect)
    // while blocking it on cross-site POSTs, which is the CSRF case that matters.
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

/** Create a refresh session and set the cookie. `family` continues an existing chain. */
export async function issueRefreshToken(
  res: Response,
  req: Request,
  userId: string,
  family?: string
): Promise<void> {
  const raw = crypto.randomBytes(48).toString('base64url');

  await RefreshToken.create({
    user: userId,
    tokenHash: hash(raw),
    family: family ?? crypto.randomUUID(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: String(req.headers['user-agent'] ?? '').slice(0, 300),
    ip: (req.ip ?? '').slice(0, 60),
  });

  res.cookie(REFRESH_COOKIE, raw, cookieOptions());
}

// A flat shape rather than a discriminated union: this project compiles with
// `strict: false`, where narrowing on a boolean discriminant is unreliable.
export interface RotateResult {
  ok: boolean;
  userId?: string;
  family?: string;
  reason?: 'missing' | 'invalid' | 'expired' | 'reused';
}

/**
 * Validate a refresh token and mark it used.
 *
 * If a token that was already used shows up again, treat it as theft: the
 * legitimate client and the attacker now both hold tokens from the same chain,
 * and there is no way to tell which is which — so revoke the entire family and
 * force a fresh login.
 */
export async function rotateRefreshToken(raw: string | undefined): Promise<RotateResult> {
  if (!raw) return { ok: false, reason: 'missing' };

  const record = await RefreshToken.findOne({ tokenHash: hash(raw) });
  if (!record) return { ok: false, reason: 'invalid' };

  if (record.usedAt || record.revokedAt) {
    await RefreshToken.updateMany(
      { family: record.family, revokedAt: { $exists: false } },
      { revokedAt: new Date() }
    );
    console.warn(`[Auth] refresh token reuse detected; revoked family ${record.family}`);
    return { ok: false, reason: 'reused' };
  }

  if (record.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };

  record.usedAt = new Date();
  await record.save();

  return { ok: true, userId: record.user.toString(), family: record.family };
}

/** Revoke one session (logout) or every session for a user. */
export async function revokeRefreshToken(raw: string | undefined): Promise<void> {
  if (!raw) return;
  await RefreshToken.updateOne({ tokenHash: hash(raw) }, { revokedAt: new Date() });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { revokedAt: new Date() }
  );
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

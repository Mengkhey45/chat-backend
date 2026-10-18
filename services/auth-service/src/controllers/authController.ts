/**
 * Authentication Controller
 * Handles user signup, signin, email verification, and password reset.
 */

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { Request, Response } from "express";
import { ZodError } from "zod";
import User from "../models/user";
import { generateNumericCode, hashCode, addMinutes } from "../utils/authUtils";
import { 
  signupSchema, 
  signinSchema, 
  verifyEmailSchema, 
  resendVerificationSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} from "../utils/validators";
import { sendVerificationEmail, sendResetEmail } from "../utils/emailService";
import { checkPasswordStrength } from "../utils/passwordPolicy";
import {
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
  clearRefreshCookie,
  REFRESH_COOKIE,
  ACCESS_TOKEN_TTL,
} from "../utils/tokens";

const CONFIG = {
  CODE_EXPIRES_MIN: Number(process.env.EMAIL_CODE_EXPIRES_MIN) || 15,
  BCRYPT_SALT_ROUNDS: 12,
  MAX_FAILED_ATTEMPTS: 5,
};

/**
 * Lockout windows after 5, 6, 7... consecutive failed sign-ins. Growing the
 * delay makes online guessing impractical without permanently locking out a
 * real user who simply mistyped.
 */
const LOCKOUT_STEPS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

function lockoutFor(attempts: number): number {
  const index = Math.min(attempts - CONFIG.MAX_FAILED_ATTEMPTS, LOCKOUT_STEPS_MS.length - 1);
  return LOCKOUT_STEPS_MS[Math.max(0, index)];
}

/**
 * Print verification/reset codes to the console so you can still get into an
 * account when email delivery is broken.
 *
 * Development only. In production this would put a working password-reset code
 * for any account into the log stream, where anyone with log access — a hosting
 * dashboard, a log aggregator, a leaked backup — could use it to take over
 * accounts without ever touching the mailbox.
 */
const logSecurityCode = (type: string, email: string, code: string) => {
  if (process.env.NODE_ENV === 'production') return;
  console.log('-------------------------------------------');
  console.log(`[SECURITY] ${type} for: ${email}`);
  console.log(`[SECURITY] CODE: ${code}`);
  console.log('-------------------------------------------');
};

/**
 * Constant-time comparison. `!==` on a hash string returns as soon as two
 * characters differ, so response timing leaks how much of a 6-digit code was
 * correct — enough to guess one digit at a time instead of brute-forcing all
 * 10^6 combinations.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Helper to handle errors uniformly
 */
const handleError = (res: Response, err: any, defaultMsg: string) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ 
      error: "Validation failed", 
      details: err.issues.map((e) => `${(e.path as any[]).join('.')}: ${e.message}`) 
    });
  }
  console.error(`[Auth] ${defaultMsg}:`, err);
  // The message can carry driver/stack detail (connection strings, collection
  // names). Log it, don't ship it — except in development, where it's useful.
  res.status(500).json({
    error: defaultMsg,
    ...(process.env.NODE_ENV === 'production' ? {} : { details: err.message }),
  });
};

/**
 * SIGNUP - Creates a new user and sends verification email.
 */
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = signupSchema.parse(req.body);

    const strength = await checkPasswordStrength(password, { email, name });
    if (!strength.ok) {
      res.status(400).json({ error: strength.reason });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, CONFIG.BCRYPT_SALT_ROUNDS);
    const code = generateNumericCode();
    
    // Always log the code so user can verify manually via logs
    logSecurityCode('SIGNUP VERIFICATION', email, code);

    await User.create({
      email,
      name,
      passwordHash,
      emailVerified: false,
      emailVerification: { 
        codeHash: hashCode(code), 
        expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN) 
      },
    });

    try {
      await sendVerificationEmail(email, code);
    } catch (emailErr: any) {
      console.error('[Signup] Email delivery failed, but account was created.');
    }

    res.status(201).json({ 
      message: "Account created successfully.", 
      email: email,
      note: "Please check your email or system logs for verification code."
    });
  } catch (err: any) {
    handleError(res, err, "Signup failed");
  }
};

/**
 * VERIFY EMAIL - Activates user account with 6-digit code.
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = verifyEmailSchema.parse(req.body);
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.emailVerification) {
      res.status(400).json({ error: "Invalid verification request." });
      return;
    }

    if (new Date() > (user.emailVerification.expiresAt ?? new Date(0)) ||
        !timingSafeEqual(hashCode(cleanCode), user.emailVerification.codeHash ?? "")) {
      res.status(400).json({ error: "Invalid or expired code." });
      return;
    }

    user.emailVerified = true;
    user.emailVerification = undefined;
    await user.save();

    res.json({ message: "Email verified successfully! You can now log in." });
  } catch (err: any) {
    handleError(res, err, "Verification failed");
  }
};

/**
 * SIGNIN - Authenticates user and returns JWT.
 */
export const signin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = signinSchema.parse(req.body);
    const user = await User.findOne({ email }).select("+passwordHash");

    // Always compare against something so a missing account and a wrong password
    // take the same time — otherwise response timing reveals which emails exist.
    const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
    const passwordMatches = await bcrypt.compare(password, hash);

    if (user?.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: "Too many failed attempts. Try again shortly.",
        retryAfter,
      });
      return;
    }

    if (!user || !passwordMatches) {
      if (user) {
        const attempts = (user.failedLoginAttempts ?? 0) + 1;
        user.failedLoginAttempts = attempts;
        if (attempts >= CONFIG.MAX_FAILED_ATTEMPTS) {
          user.lockedUntil = new Date(Date.now() + lockoutFor(attempts));
          console.warn(`[Auth] account locked after ${attempts} failed attempts: ${email}`);
        }
        await user.save();
      }
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ error: "Verify your email first." });
      return;
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    const userId = user._id.toString();
    await issueRefreshToken(res, req, userId);

    res.json({
      token: signAccessToken(userId, user.email),
      expiresIn: ACCESS_TOKEN_TTL,
      user: { id: userId, email: user.email, name: user.name },
    });
  } catch (err: any) {
    handleError(res, err, "Signin failed");
  }
};

/**
 * Exchange the refresh cookie for a new access token, rotating the refresh
 * token in the process. The browser calls this on page load and whenever an
 * access token expires.
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = (req as any).cookies?.[REFRESH_COOKIE];
    const result = await rotateRefreshToken(raw);

    if (!result.ok || !result.userId) {
      clearRefreshCookie(res);
      res.status(401).json({ error: "Session expired", reason: result.reason });
      return;
    }

    const user = await User.findById(result.userId);
    if (!user || !user.emailVerified) {
      clearRefreshCookie(res);
      res.status(401).json({ error: "Session expired" });
      return;
    }

    await issueRefreshToken(res, req, result.userId, result.family);

    res.json({
      token: signAccessToken(result.userId, user.email),
      expiresIn: ACCESS_TOKEN_TTL,
      user: { id: result.userId, email: user.email, name: user.name },
    });
  } catch (err: any) {
    handleError(res, err, "Refresh failed");
  }
};

/**
 * FORGOT PASSWORD - Generates reset code.
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const cleanEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      // Return success to hide user existence
      res.json({ message: "If account exists, a reset code was sent." });
      return;
    }

    const code = generateNumericCode();
    logSecurityCode('PASSWORD RESET', cleanEmail, code);

    user.passwordReset = { 
      codeHash: hashCode(code), 
      expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN) 
    };
    await user.save();

    try {
      await sendResetEmail(cleanEmail, code);
    } catch (err) {
      console.error('[ForgotPassword] Reset email delivery failed.');
    }

    res.json({ message: "If account exists, a reset code was sent." });
  } catch (err: any) {
    handleError(res, err, "Forgot password failed");
  }
};

/**
 * RESET PASSWORD - Sets new password using code.
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    const strength = await checkPasswordStrength(newPassword, { email: cleanEmail });
    if (!strength.ok) {
      res.status(400).json({ error: strength.reason });
      return;
    }

    const user = await User.findOne({ email: cleanEmail });

    if (!user || !user.passwordReset) {
      res.status(400).json({ error: "Invalid reset request or no active reset code found for this email." });
      return;
    }

    if (new Date() > (user.passwordReset.expiresAt ?? new Date(0)) ||
        !timingSafeEqual(hashCode(cleanCode), user.passwordReset.codeHash ?? "")) {
      res.status(400).json({ error: "Invalid or expired reset code." });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, CONFIG.BCRYPT_SALT_ROUNDS);
    user.passwordReset = undefined;
    user.emailVerified = true;
    user.passwordChangedAt = new Date();
    // A password reset is how someone recovers a compromised account, so every
    // existing session has to die with it.
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
    await revokeAllForUser(user._id.toString());

    res.json({ message: "Password reset successful! You can now log in." });
  } catch (err: any) {
    handleError(res, err, "Reset failed");
  }
};

/**
 * RESEND VERIFICATION - Sends a new verification code.
 */
export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = resendVerificationSchema.parse(req.body);
    const user = await User.findOne({ email });

    if (!user) {
      res.status(404).json({ error: "No account found." });
      return;
    }

    if (user.emailVerified) {
      res.status(400).json({ error: "Email is already verified." });
      return;
    }

    const code = generateNumericCode();
    logSecurityCode('RESEND VERIFICATION', email, code);

    user.emailVerification = {
      codeHash: hashCode(code),
      expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN),
    };
    await user.save();

    try {
      await sendVerificationEmail(email, code);
    } catch (err) {
      console.error('[ResendVerification] Email delivery failed.');
    }

    res.json({ message: "Verification code sent to your email." });
  } catch (err: any) {
    handleError(res, err, "Resend verification failed");
  }
};

/**
 * LOGOUT
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  // Logout used to be a no-op that returned 200 while the token stayed valid
  // for its full 7 days. Now the session is actually revoked server-side.
  await revokeRefreshToken((req as any).cookies?.[REFRESH_COOKIE]);
  clearRefreshCookie(res);
  res.json({ message: "Logged out successfully" });
};

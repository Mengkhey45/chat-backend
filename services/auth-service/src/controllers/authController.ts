
/**
 * Authentication Controller (short version)
 */

import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import User from "../models/user";
import { generateNumericCode, hashCode, addMinutes } from "../utils/authUtils";
import { signupSchema, signinSchema, verifyEmailSchema, resendVerificationSchema, forgotPasswordSchema, resetPasswordSchema } from "../utils/validators";
import { sendVerificationEmail, sendResetEmail } from "../utils/emailService";
import { Request, Response } from "express";

const CONFIG = {
  // CODE_LENGTH: Number(process.env.CODE_LENGTH) || 6, // unused (generateNumericCode has its own default length)
  CODE_EXPIRES_MIN: Number(process.env.EMAIL_CODE_EXPIRES_MIN) || 15,
  BCRYPT_SALT_ROUNDS: 12,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
};

/**
 * Signup
 */
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('[Signup] Starting signup for:', req.body.email);
    const { email, password, name } = signupSchema.parse(req.body);

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ error: "Email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, CONFIG.BCRYPT_SALT_ROUNDS);
    const code = generateNumericCode();
    
    console.log('[Signup] Creating user in database...');
    const user = await User.create({
      email,
      name,
      passwordHash,
      emailVerified: false,
      emailVerification: { codeHash: hashCode(code), expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN) },
    });

    console.log('[Signup] User created. Attempting to send verification email...');
    try {
      await sendVerificationEmail(email, code);
      console.log('[Signup] Verification email sent successfully');
    } catch (emailErr: any) {
      console.error('[Signup] FAILED to send verification email:', emailErr.message);
      // We don't return 500 here so the user is still created.
      // They can try "resend verification" later.
    }

    res.status(201).json({ 
      message: "Account created successfully", 
      email: email,
      note: "If you don't receive an email, please try 'Resend Verification' later."
    });
  } catch (err: any) {
    console.error('[Signup] CRITICAL ERROR:', err);
    res.status(500).json({ error: "Signup failed", details: err.message });
  }
};

/**
 * Verify Email
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {

    const { email, code } = verifyEmailSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user || !user.emailVerification) {
      res.status(400).json({ error: "Invalid verification" });
      return;
    }

    if (
      new Date() > (user.emailVerification.expiresAt ?? new Date(0)) ||
      hashCode(code) !== (user.emailVerification.codeHash ?? "")
    ) {
      res.status(400).json({ error: "Invalid or expired code" });
      return;
    }

    user.emailVerified = true;
    user.emailVerification = undefined;
    await user.save();

    res.json({ message: "Email verified successfully" });
  } catch {
    res.status(500).json({ error: "Verification failed" });
  }
};

/**
 * Signin
 */
export const signin = async (req: Request, res: Response): Promise<void> => {
  try {

    const { email, password } = signinSchema.parse(req.body);
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash ?? ""))) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    if (!user.emailVerified) {
      res.status(403).json({ error: "Verify your email first" });
      return;
    }

    // Include email in token payload so downstream middleware relying on email continues to work
    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: CONFIG.JWT_EXPIRES_IN } as SignOptions
    );
    res.json({ token, user: { id: user._id.toString(), email: user.email, name: user.name } });
  } catch {
    res.status(500).json({ error: "Signin failed" });
  }
};

/**
 * Resend Verification (short version to match route expectation)
 */
export const resendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = resendVerificationSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      res.status(404).json({ error: "No account found with this email address" });
      return;
    }
    if (user.emailVerified) {
      res.status(400).json({ error: "Email is already verified" });
      return;
    }

    const code = generateNumericCode();
    user.emailVerification = {
      codeHash: hashCode(code),
      expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN),
    };
    await user.save();
    await sendVerificationEmail(normalizedEmail, code);

    res.json({ message: "Verification code sent to your email" });
  } catch (error) {
    res.status(500).json({ error: "Failed to resend verification code. Please try again." });
  }
};

/**
 * Forgot Password
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (user) {
      const code = generateNumericCode();
      user.passwordReset = { codeHash: hashCode(code), expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN) };
      await user.save();
      await sendResetEmail(email, code);
    }
    res.json({ message: "If account exists, reset code sent" });
  } catch {
    res.status(500).json({ error: "Request failed" });
  }
};

/**
 * Reset Password
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
    const user = await User.findOne({ email });
    if (!user || !user.passwordReset) {
      res.status(400).json({ error: "Invalid reset request" });
      return;
    }

    if (
      new Date() > (user.passwordReset.expiresAt ?? new Date(0)) ||
      hashCode(code) !== (user.passwordReset.codeHash ?? "")
    ) {
      res.status(400).json({ error: "Invalid or expired reset code" });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, CONFIG.BCRYPT_SALT_ROUNDS);
    user.passwordReset = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch {
    res.status(500).json({ error: "Reset failed" });
  }
};

/**
 * Logout
 */
export const logout = (req: Request, res: Response): void => {
  res.json({ message: "Logged out successfully" });
};

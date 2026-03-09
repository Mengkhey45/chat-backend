/**
 * Authentication Controller
 * Handles user signup, signin, email verification, and password reset.
 */

import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { Request, Response } from "express";
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

const CONFIG = {
  CODE_EXPIRES_MIN: Number(process.env.EMAIL_CODE_EXPIRES_MIN) || 15,
  BCRYPT_SALT_ROUNDS: 12,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
};

/**
 * Helper to log security codes to the console for manual bypass if email fails.
 */
const logSecurityCode = (type: string, email: string, code: string) => {
  console.log('-------------------------------------------');
  console.log(`[SECURITY] ${type} for: ${email}`);
  console.log(`[SECURITY] CODE: ${code}`);
  console.log('-------------------------------------------');
};

/**
 * SIGNUP - Creates a new user and sends verification email.
 */
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = signupSchema.parse(req.body);

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
    console.error('[Signup] Error:', err.message);
    res.status(500).json({ error: "Signup failed", details: err.message });
  }
};

/**
 * VERIFY EMAIL - Activates user account with 6-digit code.
 */
export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = verifyEmailSchema.parse(req.body);
    const user = await User.findOne({ email });

    if (!user || !user.emailVerification) {
      res.status(400).json({ error: "Invalid verification request." });
      return;
    }

    if (new Date() > (user.emailVerification.expiresAt ?? new Date(0)) ||
        hashCode(code) !== (user.emailVerification.codeHash ?? "")) {
      res.status(400).json({ error: "Invalid or expired code." });
      return;
    }

    user.emailVerified = true;
    user.emailVerification = undefined;
    await user.save();

    res.json({ message: "Email verified successfully! You can now log in." });
  } catch (err: any) {
    res.status(500).json({ error: "Verification failed." });
  }
};

/**
 * SIGNIN - Authenticates user and returns JWT.
 */
export const signin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = signinSchema.parse(req.body);
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash ?? ""))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ error: "Verify your email first." });
      return;
    }

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email },
      process.env.JWT_SECRET as string,
      { expiresIn: CONFIG.JWT_EXPIRES_IN } as SignOptions
    );

    res.json({ 
      token, 
      user: { id: user._id.toString(), email: user.email, name: user.name } 
    });
  } catch (err: any) {
    console.error('[Signin] Error:', err);
    res.status(500).json({ error: "Signin failed", details: err.message });
  }
};

/**
 * FORGOT PASSWORD - Generates reset code.
 */
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = forgotPasswordSchema.parse(req.body);
    const user = await User.findOne({ email });

    if (!user) {
      // Return success to hide user existence
      res.json({ message: "If account exists, a reset code was sent." });
      return;
    }

    const code = generateNumericCode();
    logSecurityCode('PASSWORD RESET', email, code);

    user.passwordReset = { 
      codeHash: hashCode(code), 
      expiresAt: addMinutes(new Date(), CONFIG.CODE_EXPIRES_MIN) 
    };
    await user.save();

    try {
      await sendResetEmail(email, code);
    } catch (err) {
      console.error('[ForgotPassword] Reset email delivery failed.');
    }

    res.json({ message: "If account exists, a reset code was sent." });
  } catch (err: any) {
    console.error('[ForgotPassword] Error:', err);
    res.status(500).json({ error: "Request failed", details: err.message });
  }
};

/**
 * RESET PASSWORD - Sets new password using code.
 */
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code, newPassword } = resetPasswordSchema.parse(req.body);
    const user = await User.findOne({ email });

    if (!user || !user.passwordReset) {
      res.status(400).json({ error: "Invalid reset request." });
      return;
    }

    if (new Date() > (user.passwordReset.expiresAt ?? new Date(0)) ||
        hashCode(code) !== (user.passwordReset.codeHash ?? "")) {
      res.status(400).json({ error: "Invalid or expired reset code." });
      return;
    }

    user.passwordHash = await bcrypt.hash(newPassword, CONFIG.BCRYPT_SALT_ROUNDS);
    user.passwordReset = undefined;
    await user.save();

    res.json({ message: "Password reset successful! You can now log in." });
  } catch (err: any) {
    res.status(500).json({ error: "Reset failed." });
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
    res.status(500).json({ error: "Failed to resend code." });
  }
};

/**
 * LOGOUT
 */
export const logout = (req: Request, res: Response): void => {
  res.json({ message: "Logged out successfully" });
};

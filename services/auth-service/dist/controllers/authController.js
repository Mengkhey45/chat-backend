"use strict";
/**
 * Authentication Controller (short version)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logout = exports.resetPassword = exports.forgotPassword = exports.resendVerification = exports.signin = exports.verifyEmail = exports.signup = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../models/user"));
const authUtils_1 = require("../utils/authUtils");
const validators_1 = require("../utils/validators");
const emailService_1 = require("../utils/emailService");
const CONFIG = {
    // CODE_LENGTH: Number(process.env.CODE_LENGTH) || 6, // unused (generateNumericCode has its own default length)
    CODE_EXPIRES_MIN: Number(process.env.EMAIL_CODE_EXPIRES_MIN) || 15,
    BCRYPT_SALT_ROUNDS: 12,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
};
/**
 * Signup
 */
const signup = async (req, res) => {
    try {
        const { email, password, name } = validators_1.signupSchema.parse(req.body);
        const existing = await user_1.default.findOne({ email });
        if (existing) {
            res.status(409).json({ error: "Email already exists" });
            return;
        }
        const passwordHash = await bcryptjs_1.default.hash(password, CONFIG.BCRYPT_SALT_ROUNDS);
        const code = (0, authUtils_1.generateNumericCode)();
        const user = await user_1.default.create({
            email,
            name,
            passwordHash,
            emailVerified: false,
            emailVerification: { codeHash: (0, authUtils_1.hashCode)(code), expiresAt: (0, authUtils_1.addMinutes)(new Date(), CONFIG.CODE_EXPIRES_MIN) },
        });
        await (0, emailService_1.sendVerificationEmail)(email, code);
        res.status(201).json({ message: "Account created, check your email" });
    }
    catch (err) {
        res.status(500).json({ error: "Signup failed" });
    }
};
exports.signup = signup;
/**
 * Verify Email
 */
const verifyEmail = async (req, res) => {
    try {
        const { email, code } = validators_1.verifyEmailSchema.parse(req.body);
        const user = await user_1.default.findOne({ email });
        if (!user || !user.emailVerification) {
            res.status(400).json({ error: "Invalid verification" });
            return;
        }
        if (new Date() > (user.emailVerification.expiresAt ?? new Date(0)) ||
            (0, authUtils_1.hashCode)(code) !== (user.emailVerification.codeHash ?? "")) {
            res.status(400).json({ error: "Invalid or expired code" });
            return;
        }
        user.emailVerified = true;
        user.emailVerification = undefined;
        await user.save();
        res.json({ message: "Email verified successfully" });
    }
    catch {
        res.status(500).json({ error: "Verification failed" });
    }
};
exports.verifyEmail = verifyEmail;
/**
 * Signin
 */
const signin = async (req, res) => {
    try {
        const { email, password } = validators_1.signinSchema.parse(req.body);
        const user = await user_1.default.findOne({ email }).select("+passwordHash");
        if (!user || !(await bcryptjs_1.default.compare(password, user.passwordHash ?? ""))) {
            res.status(401).json({ error: "Invalid credentials" });
            return;
        }
        if (!user.emailVerified) {
            res.status(403).json({ error: "Verify your email first" });
            return;
        }
        // Include email in token payload so downstream middleware relying on email continues to work
        const token = jsonwebtoken_1.default.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: CONFIG.JWT_EXPIRES_IN });
        res.json({ token, user: { id: user._id, email: user.email, name: user.name } });
    }
    catch {
        res.status(500).json({ error: "Signin failed" });
    }
};
exports.signin = signin;
/**
 * Resend Verification (short version to match route expectation)
 */
const resendVerification = async (req, res) => {
    try {
        const { email } = validators_1.resendVerificationSchema.parse(req.body);
        const normalizedEmail = email.toLowerCase().trim();
        const user = await user_1.default.findOne({ email: normalizedEmail });
        if (!user) {
            res.status(404).json({ error: "No account found with this email address" });
            return;
        }
        if (user.emailVerified) {
            res.status(400).json({ error: "Email is already verified" });
            return;
        }
        const code = (0, authUtils_1.generateNumericCode)();
        user.emailVerification = {
            codeHash: (0, authUtils_1.hashCode)(code),
            expiresAt: (0, authUtils_1.addMinutes)(new Date(), CONFIG.CODE_EXPIRES_MIN),
        };
        await user.save();
        await (0, emailService_1.sendVerificationEmail)(normalizedEmail, code);
        res.json({ message: "Verification code sent to your email" });
    }
    catch (error) {
        res.status(500).json({ error: "Failed to resend verification code. Please try again." });
    }
};
exports.resendVerification = resendVerification;
/**
 * Forgot Password
 */
const forgotPassword = async (req, res) => {
    try {
        const { email } = validators_1.forgotPasswordSchema.parse(req.body);
        const user = await user_1.default.findOne({ email });
        if (user) {
            const code = (0, authUtils_1.generateNumericCode)();
            user.passwordReset = { codeHash: (0, authUtils_1.hashCode)(code), expiresAt: (0, authUtils_1.addMinutes)(new Date(), CONFIG.CODE_EXPIRES_MIN) };
            await user.save();
            await (0, emailService_1.sendResetEmail)(email, code);
        }
        res.json({ message: "If account exists, reset code sent" });
    }
    catch {
        res.status(500).json({ error: "Request failed" });
    }
};
exports.forgotPassword = forgotPassword;
/**
 * Reset Password
 */
const resetPassword = async (req, res) => {
    try {
        const { email, code, newPassword } = validators_1.resetPasswordSchema.parse(req.body);
        const user = await user_1.default.findOne({ email });
        if (!user || !user.passwordReset) {
            res.status(400).json({ error: "Invalid reset request" });
            return;
        }
        if (new Date() > (user.passwordReset.expiresAt ?? new Date(0)) ||
            (0, authUtils_1.hashCode)(code) !== (user.passwordReset.codeHash ?? "")) {
            res.status(400).json({ error: "Invalid or expired reset code" });
            return;
        }
        user.passwordHash = await bcryptjs_1.default.hash(newPassword, CONFIG.BCRYPT_SALT_ROUNDS);
        user.passwordReset = undefined;
        await user.save();
        res.json({ message: "Password reset successful" });
    }
    catch {
        res.status(500).json({ error: "Reset failed" });
    }
};
exports.resetPassword = resetPassword;
/**
 * Logout
 */
const logout = (req, res) => {
    res.json({ message: "Logged out successfully" });
};
exports.logout = logout;

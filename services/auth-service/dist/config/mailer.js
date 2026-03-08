"use strict";
/**
 * Email Service (short version)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMail = exports.initMailer = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
let transporter = null;
const initMailer = async (env) => {
    transporter = nodemailer_1.default.createTransport({
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT) || 587,
        secure: env.SMTP_SECURE === "true",
        auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS,
        },
    });
    await transporter.verify();
    console.log("📧 Email service initialized");
};
exports.initMailer = initMailer;
const sendMail = async (options) => {
    if (!transporter)
        throw new Error("Email service not initialized");
    const info = await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
    });
    console.log(`📧 Email sent: ${info.messageId}`);
    return info;
};
exports.sendMail = sendMail;
// ...existing code...


/**
 * Email Service (short version)
 */

import nodemailer from "nodemailer";
import type { Transporter, SentMessageInfo } from "nodemailer";

let transporter: Transporter | null = null;

/**
 * Initialize email transporter
 */
interface MailEnv {
  SMTP_HOST: string;
  SMTP_PORT: string | number;
  SMTP_SECURE: string;
  SMTP_USER: string;
  SMTP_PASS: string;
}

export const initMailer = async (env: MailEnv): Promise<void> => {
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === "true",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    // Add a short timeout to prevent hanging the whole server
    connectionTimeout: 5000, 
    greetingTimeout: 5000,
    socketTimeout: 5000
  });
  
  // Temporarily skip verification to allow server to start
  // await transporter.verify();
  console.log("📧 Email service configured (verification skipped)");
};

/**
 * Send email
 */

interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export const sendMail = async (options: MailOptions): Promise<SentMessageInfo> => {
  if (!transporter) throw new Error("Email service not initialized");
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

// ...existing code...

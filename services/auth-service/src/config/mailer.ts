
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
    connectionTimeout: 10000, 
    greetingTimeout: 10000,
    socketTimeout: 10000
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
  if (!transporter) {
    console.error("❌ Email service not initialized - transporter is null");
    throw new Error("Email service not initialized");
  }

  try {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    console.log(`📧 Attempting to send email from ${from} to ${options.to}...`);
    
    const info = await transporter.sendMail({
      from: from,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    
    console.log(`📧 Email sent successfully! ID: ${info.messageId}`);
    return info;
  } catch (error: any) {
    console.error("❌ CRITICAL: Failed to send email via nodemailer:");
    console.error("   Error Message:", error.message);
    console.error("   Error Code:", error.code);
    console.error("   SMTP Config Used:", {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      user: process.env.SMTP_USER
    });
    throw error;
  }
};

// ...existing code...

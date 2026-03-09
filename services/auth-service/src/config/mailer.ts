/**
 * Email Service Configuration
 * Optimized for Gmail and Cloud Environments
 */

import nodemailer from "nodemailer";
import type { Transporter, SentMessageInfo } from "nodemailer";

let transporter: Transporter | null = null;

interface MailEnv {
  SMTP_HOST: string;
  SMTP_PORT: string | number;
  SMTP_SECURE: string;
  SMTP_USER: string;
  SMTP_PASS: string;
}

/**
 * Initialize the email transporter.
 * Uses the 'gmail' service preset for maximum compatibility.
 */
export const initMailer = async (env: MailEnv): Promise<void> => {
  console.log(`[Mailer] Initializing for ${env.SMTP_USER} using Gmail service...`);

  transporter = nodemailer.createTransport({
    service: 'gmail', // Standard Gmail preset
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    pool: true, // Use connection pooling
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 20000, // 20 seconds
  });

  console.log("📧 Email service initialized");
};

interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Sends an email with detailed logging.
 */
export const sendMail = async (options: MailOptions): Promise<SentMessageInfo> => {
  if (!transporter) {
    throw new Error("Email service not initialized.");
  }

  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER;

  try {
    const info = await transporter.sendMail({
      from: `"Discord Chat" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    
    console.log(`[Mailer] SUCCESS: Email sent to ${options.to}`);
    return info;
  } catch (error: any) {
    console.error(`[Mailer] ERROR: ${error.message}`);
    throw error;
  }
};

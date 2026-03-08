/**
 * Email Service Configuration
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
 * Initialize the email transporter with robust settings for cloud environments.
 */
export const initMailer = async (env: MailEnv): Promise<void> => {
  const port = Number(env.SMTP_PORT) || 587;
  // port 465 uses secure: true (Implicit TLS), port 587 uses secure: false (STARTTLS)
  const isSecure = env.SMTP_SECURE === "true" || port === 465;

  console.log(`[Mailer] Initializing: ${env.SMTP_HOST}:${port} (Secure: ${isSecure})`);

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: port,
    secure: isSecure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    // Reliability settings for Railway/Cloud
    connectionTimeout: 15000, 
    greetingTimeout: 15000,
    socketTimeout: 30000,
    tls: {
      // Do not fail on invalid certs
      rejectUnauthorized: false
    }
  });

  console.log("📧 Email service initialized (verification deferred)");
};

interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Sends an email and provides detailed logging for debugging.
 */
export const sendMail = async (options: MailOptions): Promise<SentMessageInfo> => {
  if (!transporter) {
    console.error("[Mailer] CRITICAL: Service not initialized.");
    throw new Error("Email service not initialized");
  }

  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@app.com';

  try {
    console.log(`[Mailer] Sending "${options.subject}" to: ${options.to}`);
    
    const info = await transporter.sendMail({
      from: `Discord Chat <${from}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    
    console.log(`[Mailer] SUCCESS: Email sent (ID: ${info.messageId})`);
    return info;
  } catch (error: any) {
    console.error(`[Mailer] ERROR: Failed to send to ${options.to}`);
    console.error(`  - Reason: ${error.message}`);
    console.error(`  - Code: ${error.code}`);
    throw error;
  }
};

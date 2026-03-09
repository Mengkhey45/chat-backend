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
 * Initialize the email transporter.
 * NOTE: Cloud providers like Railway often block port 465. 
 * Port 587 with SMTP_SECURE=false is recommended.
 */
export const initMailer = async (env: MailEnv): Promise<void> => {
  let port = Number(env.SMTP_PORT) || 587;
  let isSecure = env.SMTP_SECURE === "true";

  // Auto-fix: If port is 465, it MUST be secure. If 587, it MUST NOT be secure (it uses STARTTLS).
  if (port === 465) isSecure = true;
  if (port === 587) isSecure = false;

  console.log(`[Mailer] Initializing: ${env.SMTP_HOST}:${port} (SSL/TLS: ${isSecure})`);

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: port,
    secure: isSecure,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: {
      rejectUnauthorized: false // Helps with self-signed certs in some environments
    }
  });

  console.log("📧 Email service ready");
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
    throw new Error("Email service not initialized. Call initMailer first.");
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
    
    console.log(`[Mailer] SUCCESS: "${options.subject}" sent to ${options.to}`);
    return info;
  } catch (error: any) {
    console.error(`[Mailer] ERROR: Failed to send to ${options.to}`);
    console.error(`  - Message: ${error.message}`);
    
    if (error.code === 'ETIMEDOUT' && process.env.SMTP_PORT === '465') {
      console.error(`  - TIP: Port 465 is timed out. PLEASE CHANGE SMTP_PORT TO 587 IN RAILWAY VARIABLES.`);
    }
    
    throw error;
  }
};

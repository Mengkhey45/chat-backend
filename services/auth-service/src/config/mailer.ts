/**
 * Email Service Configuration
 * Support for Resend (Production API) and Gmail (Local SMTP)
 */

import nodemailer from "nodemailer";
import { Resend } from 'resend';
import type { Transporter, SentMessageInfo } from "nodemailer";

let transporter: Transporter | null = null;
let resend: Resend | null = null;

interface MailEnv {
  SMTP_HOST: string;
  SMTP_PORT: string | number;
  SMTP_SECURE: string;
  SMTP_USER: string;
  SMTP_PASS: string;
  RESEND_API_KEY?: string;
}

/**
 * Initialize the email service.
 * Prefers Resend API if RESEND_API_KEY is present, otherwise falls back to Gmail SMTP.
 */
export const initMailer = async (env: MailEnv): Promise<void> => {
  if (env.RESEND_API_KEY) {
    console.log("[Mailer] Initializing with Resend API (Recommended for Production)");
    resend = new Resend(env.RESEND_API_KEY);
    return;
  }

  console.log(`[Mailer] Initializing with Gmail SMTP: ${env.SMTP_USER}`);
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
};

interface MailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Sends an email using the available service.
 */
export const sendMail = async (options: MailOptions): Promise<any> => {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_USER || 'onboarding@resend.dev';
  const fromName = "Discord Chat";

  // 1. Try Resend (API based, works on Railway)
  if (resend) {
    try {
      console.log(`[Mailer] Sending via Resend API to: ${options.to}`);
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html || '',
        text: options.text || '',
      });

      if (error) throw error;
      console.log(`[Mailer] SUCCESS: Email sent via Resend ID: ${data?.id}`);
      return data;
    } catch (error: any) {
      console.error(`[Mailer] Resend ERROR: ${error.message}`);
      throw error;
    }
  }

  // 2. Fallback to Nodemailer (SMTP based, works locally)
  if (transporter) {
    try {
      console.log(`[Mailer] Sending via SMTP to: ${options.to}`);
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      console.log(`[Mailer] SUCCESS: Email sent via SMTP ID: ${info.messageId}`);
      return info;
    } catch (error: any) {
      console.error(`[Mailer] SMTP ERROR: ${error.message}`);
      throw error;
    }
  }

  throw new Error("Mailer not initialized. Check your environment variables.");
};

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
    console.log("[Mailer] Using Resend API");
    resend = new Resend(env.RESEND_API_KEY);
  }

  if (env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });

    // Check the credentials now rather than discovering they're dead the first
    // time somebody tries to reset their password. Gmail app passwords are
    // revoked whenever 2FA is toggled or the password is regenerated, and the
    // failure is otherwise silent until a user hits it.
    if (!resend) {
      console.log(`[Mailer] Using SMTP: ${env.SMTP_USER}`);
      try {
        await transporter.verify();
        console.log('[Mailer] SMTP credentials verified');
      } catch (err: any) {
        console.error(
          `[Mailer] SMTP credentials REJECTED (${err.message?.split('\n')[0]}).\n` +
          '          Password reset and verification emails will not be delivered.\n' +
          '          Fix: regenerate the Gmail app password, or set RESEND_API_KEY.'
        );
      }
    }
  }

  if (!resend && !transporter) {
    console.warn('[Mailer] No email transport configured — codes will only appear in the logs.');
  }
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
  const fromName = process.env.APP_NAME || "Chatly";

  // 1. Resend first — an HTTPS API, so it works on hosts that block outbound
  // SMTP ports (Railway, Vercel functions, many container platforms).
  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html || '',
        text: options.text || '',
      });

      if (error) throw error;
      console.log(`[Mailer] sent via Resend (${data?.id})`);
      return data;
    } catch (error: any) {
      console.error(`[Mailer] Resend failed: ${error.message}`);
      // Fall through to SMTP if it's configured, rather than giving up.
      if (!transporter) throw error;
    }
  }

  // 2. Fallback to Nodemailer (SMTP based, works locally)
  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      console.log(`[Mailer] sent via SMTP (${info.messageId})`);
      return info;
    } catch (error: any) {
      console.error(`[Mailer] SMTP ERROR: ${error.message}`);
      throw error;
    }
  }

  throw new Error("Mailer not initialized. Check your environment variables.");
};

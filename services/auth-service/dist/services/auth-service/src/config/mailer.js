/**
 * Email Service (short version)
 */
import nodemailer from "nodemailer";
let transporter = null;
export const initMailer = async (env) => {
    transporter = nodemailer.createTransport({
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
export const sendMail = async (options) => {
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
// ...existing code...

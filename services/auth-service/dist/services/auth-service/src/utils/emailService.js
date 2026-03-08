import { sendMail } from '../config/mailer';
const CONFIG = {
    CODE_EXPIRES_MIN: Number(process.env.EMAIL_CODE_EXPIRES_MIN) || 15
};
export const sendVerificationEmail = async (userEmail, code) => {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Email Verification</h2>
      <p>Thank you for registering! Please use the following verification code to complete your registration:</p>
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 20px 0;">
        ${code}
      </div>
      <p><strong>This code will expire in ${CONFIG.CODE_EXPIRES_MIN} minutes.</strong></p>
      <p>If you didn't request this verification, please ignore this email.</p>
    </div>
  `;
    await sendMail({
        to: userEmail,
        // from: process.env.EMAIL_FROM, // sendMail uses process.env.EMAIL_FROM internally
        subject: 'Verify your email address',
        html,
        text: `Your verification code is ${code}. It expires in ${CONFIG.CODE_EXPIRES_MIN} minutes.`
    });
};
export const sendResetEmail = async (userEmail, code) => {
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2>Password Reset Request</h2>
      <p>You have requested to reset your password. Please use the following code:</p>
      <div style="background-color: #f5f5f5; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 20px 0;">
        ${code}
      </div>
      <p><strong>This code will expire in ${CONFIG.CODE_EXPIRES_MIN} minutes.</strong></p>
      <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
    </div>
  `;
    await sendMail({
        to: userEmail,
        // from: process.env.EMAIL_FROM, // sendMail uses process.env.EMAIL_FROM internally
        subject: 'Password Reset Code',
        html,
        text: `Your password reset code is ${code}. It expires in ${CONFIG.CODE_EXPIRES_MIN} minutes.`
    });
};
// ...existing code...

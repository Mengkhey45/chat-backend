import { z } from 'zod';
export const signupSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    name: z.string().min(1)
});
export const signinSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6)
});
export const verifyEmailSchema = z.object({
    email: z.string().email(),
    code: z.string().min(1)
});
export const resendVerificationSchema = z.object({
    email: z.string().email()
});
export const forgotPasswordSchema = z.object({
    email: z.string().email()
});
export const resetPasswordSchema = z.object({
    email: z.string().email(),
    code: z.string().min(1),
    newPassword: z.string().min(6)
});

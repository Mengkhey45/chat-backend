
import { z } from 'zod';

// Length is enforced here; checkPasswordStrength() in passwordPolicy.ts adds the
// guessability and breach checks that a length rule alone can't catch.
const password = z.string().min(10, 'Password must be at least 10 characters').max(200);

export const signupSchema = z.object({
	email: z.string().email(),
	password,
	name: z.string().min(1).max(80)
});

export const signinSchema = z.object({
	email: z.string().email(),
	// Not the strong schema: existing accounts may predate the current policy.
	password: z.string().min(1).max(200)
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
	newPassword: password
});

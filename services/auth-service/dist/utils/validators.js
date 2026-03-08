"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.resendVerificationSchema = exports.verifyEmailSchema = exports.signinSchema = exports.signupSchema = void 0;
const zod_1 = require("zod");
exports.signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
    name: zod_1.z.string().min(1)
});
exports.signinSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6)
});
exports.verifyEmailSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    code: zod_1.z.string().min(1)
});
exports.resendVerificationSchema = zod_1.z.object({
    email: zod_1.z.string().email()
});
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email()
});
exports.resetPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    code: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(6)
});

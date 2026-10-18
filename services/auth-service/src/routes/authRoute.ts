
import express, { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import * as authController from "../controllers/authController";

const router = express.Router();

// Strict limiter for sensitive ops
const strictLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 5,
  message: { error: "Too many attempts. Try again in 3 minutes." },
  skip: () => process.env.NODE_ENV === "development",
});

// Moderate limiter for verification
const verificationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: "Too many verification attempts. Try again in 5 minutes." },
  skip: () => process.env.NODE_ENV === "development",
});



// Routes
router.post("/signup", strictLimiter, authController.signup);
router.post("/signin", strictLimiter, authController.signin);
router.post("/verify-email", verificationLimiter, authController.verifyEmail);
router.post("/resend-verification", verificationLimiter, authController.resendVerification);
router.post("/forgot-password", strictLimiter, authController.forgotPassword);
router.post("/reset-password", strictLimiter, authController.resetPassword);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);

export default router;

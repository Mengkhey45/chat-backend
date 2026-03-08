"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const authController = __importStar(require("../controllers/authController"));
const router = express_1.default.Router();
// Mount google oauth route
const googleRouter = require('./authGoogleRoute');
router.use('/google', googleRouter);
// Strict limiter for sensitive ops
const strictLimiter = (0, express_rate_limit_1.default)({
    windowMs: 3 * 60 * 1000,
    max: 5,
    message: { error: "Too many attempts. Try again in 3 minutes." },
    skip: () => process.env.NODE_ENV === "development",
});
// Moderate limiter for verification
const verificationLimiter = (0, express_rate_limit_1.default)({
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
router.post("/logout", authController.logout);
exports.default = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
/**
 * Extract JWT token from request
 */
const getToken = (req) => {
    if (req.headers.authorization?.startsWith("Bearer ")) {
        return req.headers.authorization.split(" ")[1];
    }
    // if (req.cookies?.token) return req.cookies.token; // unused: cookie-parser not configured and token not set in cookies
    return null;
};
/**
 * Auth middleware: protect routes
 */
const authMiddleware = (req, res, next) => {
    const token = getToken(req);
    if (!token) {
        res.status(401).json({ message: "No token provided" });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        res.status(401).json({ message: "Invalid or expired token" });
        return;
    }
};
exports.authMiddleware = authMiddleware;
// Support both default export and named export for compatibility
// ...existing code...

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const getToken = (req) => {
    if (req.headers.authorization?.startsWith("Bearer ")) {
        return req.headers.authorization.split(" ")[1];
    }
    return null;
};
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
    catch (err) {
        res.status(401).json({ message: "Invalid or expired token" });
    }
};
exports.authMiddleware = authMiddleware;

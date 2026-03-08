"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const user_1 = __importDefault(require("../models/user"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * GET /api/me
 * Get current user profile
 */
router.get("/me", auth_1.authMiddleware, async (req, res) => {
    const user = await user_1.default.findById(req.user.id);
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    res.json({ user: user.toSafeObject() });
});
/**
 * PUT /api/me
 * Update current user profile
 */
router.put("/me", auth_1.authMiddleware, async (req, res) => {
    const user = await user_1.default.findById(req.user.id);
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const { name, profile } = req.body;
    if (name !== undefined)
        user.name = name.trim();
    if (profile)
        user.profile = { ...user.profile, ...profile };
    await user.save();
    res.json({ message: "Profile updated", user: user.toSafeObject() });
});
/**
 * GET /api/account/stats
 * Get account info
 */
router.get("/account/stats", auth_1.authMiddleware, async (req, res) => {
    const user = await user_1.default.findById(req.user.id);
    if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
    }
    const stats = {
        accountAge: user.createdAt,
        lastLogin: user.lastLogin,
        emailVerified: user.emailVerified,
        profileCompleteness: calculateProfileCompleteness(user),
        accountStatus: "active"
    };
    res.json({ stats });
});
// Minimal profile completeness calculation
const calculateProfileCompleteness = (user) => {
    const fields = [user.name, user.profile?.firstName, user.profile?.lastName, user.emailVerified];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
};
exports.default = router;
module.exports = router;

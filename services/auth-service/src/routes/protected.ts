
import express, { Response } from "express";
import User from "../models/user";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";

const router = express.Router();

/**
 * GET /api/me
 * Get current user profile
 */
router.get("/me", authMiddleware, async (req, res: Response) => {
  const user = await User.findById((req as AuthenticatedRequest).user?.userId);
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
router.put("/me", authMiddleware, async (req, res: Response) => {
  const user = await User.findById((req as AuthenticatedRequest).user?.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { name, profile } = req.body;
  if (name !== undefined) user.name = name.trim();
  if (profile) user.profile = { ...user.profile, ...profile };
  await user.save();
  res.json({ message: "Profile updated", user: user.toSafeObject() });
});

/**
 * GET /api/account/stats
 * Get account info
 */
router.get("/account/stats", authMiddleware, async (req, res: Response) => {
  const user = await User.findById((req as AuthenticatedRequest).user?.userId);
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
const calculateProfileCompleteness = (user: any): number => {
  const fields = [user.name, user.profile?.firstName, user.profile?.lastName, user.emailVerified];
  const completed = fields.filter(Boolean).length;
  return Math.round((completed / fields.length) * 100);
};
export default router;

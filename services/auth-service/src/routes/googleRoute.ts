import express, { Request, Response } from "express";
import passport from "passport";
import crypto from "node:crypto";
import { issueRefreshToken, signAccessToken, ACCESS_TOKEN_TTL } from "../utils/tokens";
import User from "../models/user";

const router = express.Router();

const frontend = () => (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

// In-memory single-use authorization code store (60s lifetime)
const oauthCodeStore = new Map<string, { userId: string; expiresAt: number }>();

// Periodic cleanup of expired codes
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of oauthCodeStore.entries()) {
    if (entry.expiresAt <= now) {
      oauthCodeStore.delete(code);
    }
  }
}, 30_000);

// Step 1: Redirect to Google login
router.get(
  "/",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

// Step 2: Callback from Google
router.get(
  "/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${frontend()}/login?error=google_auth_failed`,
  }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!user?._id) {
        return res.redirect(`${frontend()}/login?error=google_auth_failed`);
      }

      const userId = user._id.toString();

      // Issue single-use short-lived authorization code for cross-domain exchange
      const code = crypto.randomBytes(32).toString("hex");
      oauthCodeStore.set(code, {
        userId,
        expiresAt: Date.now() + 60_000,
      });

      // Also set refresh cookie as secondary fallback
      await issueRefreshToken(res, req, userId);

      res.redirect(`${frontend()}/auth/callback?code=${code}`);
    } catch (err) {
      console.error("[Auth] Google callback error:", err);
      res.redirect(`${frontend()}/login?error=google_auth_failed`);
    }
  }
);

// Step 3: One-time code exchange for JWT session
router.post("/exchange", async (req: Request, res: Response) => {
  try {
    const { code } = req.body ?? {};
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    const entry = oauthCodeStore.get(code);
    if (!entry) {
      return res.status(400).json({ error: "Invalid or expired authorization code" });
    }

    // Invalidate immediately (single-use protection)
    oauthCodeStore.delete(code);

    if (Date.now() > entry.expiresAt) {
      return res.status(400).json({ error: "Authorization code has expired" });
    }

    const user = await User.findById(entry.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Ensure fresh refresh session cookie is also issued
    await issueRefreshToken(res, req, entry.userId);

    const token = signAccessToken(entry.userId, user.email);

    res.json({
      token,
      expiresIn: ACCESS_TOKEN_TTL,
      user: {
        id: entry.userId,
        email: user.email,
        name: user.name,
        profile: user.profile,
      },
    });
  } catch (err: any) {
    console.error("[Auth] Google code exchange error:", err);
    res.status(500).json({ error: "Code exchange failed" });
  }
});

export default router;

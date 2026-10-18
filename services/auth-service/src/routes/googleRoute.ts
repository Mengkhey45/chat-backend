import express, { Request, Response } from "express";
import passport from "passport";
import { issueRefreshToken } from "../utils/tokens";

const router = express.Router();

const frontend = () => process.env.FRONTEND_URL || "http://localhost:3000";

// Step 1: Redirect to Google login
router.get(
  "/",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

// Step 2: Callback
router.get(
  "/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
  }),
  async (req: Request, res: Response) => {
    try {
      const user = req.user as any;
      if (!user?._id) {
        return res.redirect(`${frontend()}/login?error=google_auth_failed`);
      }

      // The previous version signed the whole "safe user" object as the JWT
      // payload, which had an `id` field but no `userId` — the key every auth
      // middleware and the socket handshake actually read. Google sign-ins
      // therefore produced tokens that failed every authorization check.
      //
      // Only the refresh cookie is set here; the frontend exchanges it for an
      // access token. Putting a token in the redirect URL would leak it into
      // browser history, referrer headers and any proxy log along the way.
      await issueRefreshToken(res, req, user._id.toString());

      res.redirect(`${frontend()}/auth/callback`);
    } catch (err) {
      console.error("[Auth] Google callback error:", err);
      res.redirect(`${frontend()}/login?error=google_auth_failed`);
    }
  }
);

export default router;

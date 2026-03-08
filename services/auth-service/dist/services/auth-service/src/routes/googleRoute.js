import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
const router = express.Router();
// Step 1: Redirect to Google login
router.get("/", passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
}));
// Step 2: Callback
router.get("/callback", passport.authenticate("google", {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/signin?error=google_auth_failed`,
}), (req, res) => {
    try {
        if (!req.user) {
            console.error("No user in Google callback request");
            res.send(`
          <script>
            window.localStorage.setItem("auth_error", "Authentication failed");
            window.close();
          </script>
        `);
            return;
        }
        const safeUser = req.user.toSafeObject();
        const token = jwt.sign(safeUser, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
        console.log("Google auth successful, sending token to frontend");
        const frontendCallback = `${process.env.FRONTEND_URL || "http://localhost:3000"}/auth/callback`;
        const redirectUrl = `${frontendCallback}?token=${encodeURIComponent(token)}`;
        res.redirect(redirectUrl);
    }
    catch (err) {
        console.error("Google callback error:", err);
        res.send(`
        <script>
          window.localStorage.setItem("auth_error", "Token generation failed");
          window.close();
        </script>
      `);
    }
});
export default router;

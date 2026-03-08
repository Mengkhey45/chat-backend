"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const passport_1 = __importDefault(require("passport"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = express_1.default.Router();
// Step 1: Redirect to Google login
router.get("/", passport_1.default.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account"
}));
// Step 2: Callback
router.get("/callback", passport_1.default.authenticate("google", {
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
        const token = jsonwebtoken_1.default.sign(safeUser, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });
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
exports.default = router;

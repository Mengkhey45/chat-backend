import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import User from "../models/user";
/**
 * Google Strategy
 */
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:4000/api/auth/google/callback",
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails && profile.emails.length
            ? profile.emails[0].value.toLowerCase()
            : null;
        if (!email)
            return done(new Error("Google account has no email"));
        let user = await User.findOne({
            $or: [
                { oauthProvider: "google", oauthProviderId: profile.id },
                { email },
            ],
        });
        if (!user) {
            user = await User.create({
                email,
                name: profile.displayName,
                oauthProvider: "google",
                oauthProviderId: profile.id,
                emailVerified: true,
                profile: {
                    firstName: profile.name?.givenName,
                    lastName: profile.name?.familyName,
                    avatar: profile.photos && profile.photos.length
                        ? profile.photos[0].value
                        : undefined,
                },
                lastLogin: new Date(),
            });
        }
        else {
            user.lastLogin = new Date();
            if (!user.oauthProvider || !user.oauthProviderId) {
                user.oauthProvider = "google";
                user.oauthProviderId = profile.id;
                await user.save();
            }
        }
        return done(null, user);
    }
    catch (err) {
        return done(err);
    }
}));

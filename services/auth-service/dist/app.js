"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const passport_1 = __importDefault(require("passport"));
const db_1 = __importDefault(require("./config/db"));
const mailer_1 = require("./config/mailer");
// import { errorHandler } from './middleware/errorHandler';
const authRoute_1 = __importDefault(require("./routes/authRoute"));
const protected_1 = __importDefault(require("./routes/protected"));
const googleRoute_1 = __importDefault(require("./routes/googleRoute"));
require("./config/passport");
const app = (0, express_1.default)();
// Middleware
app.use((0, helmet_1.default)());
app.use(express_1.default.json());
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000'],
    // credentials: true
}));
app.use(passport_1.default.initialize());
// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`, {
        body: req.body,
        headers: {
            origin: req.get('Origin'),
            contentType: req.get('Content-Type'),
            authorization: req.get('Authorization')
        }
    });
    next();
});
// Rate limiter for auth
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'development' ? 0 : 20,
    message: { error: 'Too many requests' },
    skip: () => process.env.NODE_ENV === 'development'
});
// Routes
app.use('/api/auth', authLimiter, authRoute_1.default);
app.use('/api/auth/google', googleRoute_1.default);
app.use('/api', protected_1.default);
// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
// Global error handler
// app.use(errorHandler);
// Start server
const PORT = process.env.PORT || 4000;
const startServer = async () => {
    try {
        await (0, mailer_1.initMailer)({
            SMTP_HOST: process.env.SMTP_HOST ?? '',
            SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
            SMTP_SECURE: process.env.SMTP_SECURE ?? 'false',
            SMTP_USER: process.env.SMTP_USER ?? '',
            SMTP_PASS: process.env.SMTP_PASS ?? ''
        });
        // Note: connectDB ignores the passed URI and reads from process.env.MONGO_URI internally
        await (0, db_1.default)();
        app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
    }
    catch (err) {
        console.error('❌ Failed to start server:', err.message);
        process.exit(1);
    }
};
startServer();

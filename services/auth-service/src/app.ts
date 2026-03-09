import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import connectDB from './config/db';
import { initMailer } from './config/mailer';
// import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoute';
import protectedRoutes from './routes/protected';
import authGoogleRoutes from './routes/googleRoute';
import './config/passport';

const app = express();

// 1. CORS MUST BE FIRST to handle preflight OPTIONS requests
app.use(cors({
  origin: function (origin, callback) {
    // Allow all origins for now to resolve the issue, then we can restrict later
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// 2. Other middleware
app.use(helmet());
app.use(express.json());
app.use(passport.initialize());

// Add request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path}`, {
    origin: req.get('Origin'),
    method: req.method
  });
  next();
});


// Rate limiter for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 0 : 20,
  message: { error: 'Too many requests' },
  skip: () => process.env.NODE_ENV === 'development'
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/google', authGoogleRoutes);
app.use('/api', protectedRoutes);



// 404 handler
app.use((req: Request, res: Response) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
// app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;
const startServer = async () => {
  try {
    await initMailer({
      SMTP_HOST: process.env.SMTP_HOST ?? '',
      SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
      SMTP_SECURE: process.env.SMTP_SECURE ?? 'false',
      SMTP_USER: process.env.SMTP_USER ?? '',
      SMTP_PASS: process.env.SMTP_PASS ?? '',
      RESEND_API_KEY: process.env.RESEND_API_KEY
    });
    // Note: connectDB ignores the passed URI and reads from process.env.MONGO_URI internally
    await connectDB();
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  } catch (err: any) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
};

startServer();
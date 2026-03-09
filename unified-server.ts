import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createClient } from 'redis';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import passport from 'passport';
import rateLimit from 'express-rate-limit';

// Auth service imports
import { initMailer } from './services/auth-service/src/config/mailer';
import './services/auth-service/src/config/passport';
import authRoutes from './services/auth-service/src/routes/authRoute';
import protectedRoutes from './services/auth-service/src/routes/protected';
import authGoogleRoutes from './services/auth-service/src/routes/googleRoute';

// Chat service imports
import chatApiRoutes from './services/chat-service/src/routes/api';
import { registerChatHandlers } from './services/chat-service/src/sockets/chatHandler';

// File service imports
import { getUploadUrl } from './services/file-service/src/controllers/fileController';

const app = express();
const httpServer = createServer(app);

// ======== MIDDLEWARE ========
app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

app.use(helmet());
app.use(express.json());
app.use(passport.initialize());

app.use((req, res, next) => {
  console.log(`[Unified] ${req.method} ${req.path}`);
  next();
});

// Rate limiter for auth
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 0 : 20,
  message: { error: 'Too many requests' },
  skip: () => process.env.NODE_ENV === 'development'
});

// ======== HEALTH CHECK ========
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'unified-server' }));

// ======== AUTH SERVICE ROUTES ========
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/google', authGoogleRoutes);
app.use('/api', protectedRoutes);

// ======== CHAT SERVICE ROUTES ========
app.use('/api/chat', chatApiRoutes);

// ======== FILE SERVICE ROUTES ========
const fileRouter = express.Router();
fileRouter.get('/', (_req, res) => res.json({ message: 'File Service Ready' }));
fileRouter.post('/upload-url', getUploadUrl);
app.use('/api/files', fileRouter);

// ======== 404 ========
app.use((req, res) => {
  console.warn(`[Unified] 404: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found', path: req.url });
});

// ======== REDIS & SOCKET.IO ========
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let notificationQueue: Queue | null = null;
let redisClient: any = null;

const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// Socket.IO auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    socket.data.userId = payload.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ======== START SERVER ========
async function startServer() {
  // Initialize mailer
  await initMailer({
    SMTP_HOST: process.env.SMTP_HOST ?? '',
    SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
    SMTP_SECURE: process.env.SMTP_SECURE ?? 'false',
    SMTP_USER: process.env.SMTP_USER ?? '',
    SMTP_PASS: process.env.SMTP_PASS ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY
  });

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('MongoDB Connected...');

  // Connect to Redis (optional — app works without it)
  try {
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);

    // Dynamic import to avoid crash if redis-adapter isn't available
    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    redisClient = pubClient;

    const queueConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    notificationQueue = new Queue('notification-queue', { connection: queueConnection });

    // Start notification worker
    try {
      const { startNotificationWorker } = await import('./services/notification-service/src/workers/notificationWorker');
      startNotificationWorker();
      console.log('Notification worker started');
    } catch (err) {
      console.warn('Notification worker failed to start:', err);
    }

    console.log('Redis connected, Socket.IO adapter ready');
  } catch (err) {
    console.warn('Redis unavailable, running without real-time adapter:', (err as Error).message);
  }

  // Socket.IO connection handler
  io.on('connection', (socket) => {
    if (notificationQueue && redisClient) {
      registerChatHandlers(io, socket, notificationQueue, redisClient);
    } else {
      console.warn('Socket connected but Redis/Queue unavailable — limited functionality');
      socket.disconnect();
    }
  });

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`🚀 Unified Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start unified server:', err);
  process.exit(1);
});

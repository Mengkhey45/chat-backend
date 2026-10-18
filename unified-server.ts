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
import cookieParser from 'cookie-parser';
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
import { authMiddleware } from './services/chat-service/src/middleware/auth';
import { registerChatHandlers } from './services/chat-service/src/sockets/chatHandler';
import { registerCallHandlers } from './services/chat-service/src/sockets/callHandler';
import { getIceServers } from './services/chat-service/src/controllers/callController';

// File service imports
import { getUploadUrl } from './services/file-service/src/controllers/fileController';

// ======== ENV VALIDATION ========
// Fail at boot rather than 500ing on the first request that needs the value.
const REQUIRED_ENV = ['JWT_SECRET', 'MONGO_URI'] as const;
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`FATAL: missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}
if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET as string).length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

const IS_PROD = process.env.NODE_ENV === 'production';

// ======== CORS ORIGINS ========
// Previously this reflected *any* origin while also sending credentials, which lets
// any website on the internet call the API with a logged-in user's browser.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);

const DEV_ORIGINS = [
  'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002',
  'http://127.0.0.1:3000', 'http://127.0.0.1:3001',
];

const allowedOrigins = IS_PROD ? ALLOWED_ORIGINS : [...new Set([...ALLOWED_ORIGINS, ...DEV_ORIGINS])];

if (allowedOrigins.length === 0) {
  console.warn('WARNING: no ALLOWED_ORIGINS/FRONTEND_URL set — browser requests will be rejected.');
}

function isOriginAllowed(origin?: string): boolean {
  // No Origin header: same-origin, curl, or a server-to-server call. Not a CSRF vector.
  if (!origin) return true;
  return allowedOrigins.includes(origin.replace(/\/$/, ''));
}

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isOriginAllowed(origin ?? undefined)) return callback(null, true);
    console.warn(`[CORS] blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
};

const app = express();
const httpServer = createServer(app);

// Behind nginx/Railway: needed so express-rate-limit keys on the real client IP
// instead of rate-limiting the proxy as a single client.
app.set('trust proxy', 1);

// ======== MIDDLEWARE ========
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // This origin serves JSON, never HTML, so it needs no script or style
  // sources at all. A response that somehow renders as a document can then run
  // nothing.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  // Tell browsers to use https for the next two years, including subdomains.
  // Only meaningful over https, and ignored on plain http, so it is safe in dev.
  hsts: { maxAge: 63072000, includeSubDomains: true, preload: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(passport.initialize());

// Browsers won't send or accept the refresh cookie cross-site without this, and
// the allowlist above is what keeps it from being a free-for-all.
app.disable('x-powered-by');

if (!IS_PROD) {
  app.use((req, _res, next) => {
    console.log(`[Unified] ${req.method} ${req.path}`);
    next();
  });
}

// Global limiter: blunt protection against a single host flooding the API.
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !IS_PROD,
}));

// Auth endpoints get a tighter budget on top of the per-route limiters.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  message: { error: 'Too many requests' },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !IS_PROD,
});

// ======== HEALTH CHECK ========
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'unified-server' }));

// ======== AUTH SERVICE ROUTES ========
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/auth/google', authGoogleRoutes);
app.use('/api', protectedRoutes);

// ======== CHAT SERVICE ROUTES ========
app.use('/api/chat', chatApiRoutes);

// ======== CALL ROUTES ========
// Authenticated: TURN credentials are a paid resource and must not be handed
// out to anonymous callers, who could use the relay for arbitrary traffic.
app.get('/api/calls/ice-servers', authMiddleware, getIceServers);

// ======== FILE SERVICE ROUTES ========
// authMiddleware was missing here: anyone could mint presigned R2 upload URLs.
const fileRouter = express.Router();
fileRouter.use(authMiddleware);
fileRouter.get('/', (_req, res) => res.json({ message: 'File Service Ready' }));
fileRouter.post('/upload-url', rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !IS_PROD,
}), getUploadUrl);
app.use('/api/files', fileRouter);

// ======== 404 ========
app.use((req, res) => {
  console.warn(`[Unified] 404: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found', path: req.url });
});

// ======== ERROR HANDLER ========
// Without this, a thrown error in any handler falls through to Express's default
// handler, which leaks the stack trace to the client.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  console.error('[Unified] Unhandled error:', err);
  res.status(err?.status || 500).json({
    error: 'Internal server error',
    ...(IS_PROD ? {} : { detail: err?.message }),
  });
});

// ======== REDIS & SOCKET.IO ========
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let notificationQueue: Queue | null = null;
let redisClient: any = null;

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) =>
      isOriginAllowed(origin ?? undefined)
        ? callback(null, true)
        : callback(new Error('Not allowed by CORS')),
    credentials: true,
  },
  maxHttpBufferSize: 1 * 1024 * 1024, // base64 payloads are no longer sent over the socket
});

// Socket.IO auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No token'));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    if (!payload?.userId) return next(new Error('Invalid token'));
    socket.data.userId = String(payload.userId);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

// ======== START SERVER ========
async function startServer() {
  await initMailer({
    SMTP_HOST: process.env.SMTP_HOST ?? '',
    SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
    SMTP_SECURE: process.env.SMTP_SECURE ?? 'false',
    SMTP_USER: process.env.SMTP_USER ?? '',
    SMTP_PASS: process.env.SMTP_PASS ?? '',
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  });

  await mongoose.connect(process.env.MONGO_URI as string);
  console.log('MongoDB Connected...');

  // Redis is optional — the app degrades to a single-node, no-unread-badge mode.
  try {
    // node-redis retries a failed connection forever by default, so awaiting
    // connect() on an unreachable host hangs startServer() and the HTTP server
    // never reaches listen(). Bound the attempts and give up quickly.
    const socketOptions = {
      connectTimeout: 3000,
      reconnectStrategy: (retries: number) => (retries >= 3 ? false : 200),
    };
    const pubClient = createClient({ url: REDIS_URL, socket: socketOptions });
    const subClient = pubClient.duplicate();
    // node-redis emits 'error' on every retry; an unhandled 'error' would crash
    // the process, so absorb them and let connect() reject.
    let redisWarned = false;
    const onRedisError = (e: Error) => {
      if (!redisWarned) {
        redisWarned = true;
        console.warn('[Redis] connection error:', e.message);
      }
    };
    pubClient.on('error', onRedisError);
    subClient.on('error', onRedisError);
    await Promise.all([pubClient.connect(), subClient.connect()]);

    const { createAdapter } = await import('@socket.io/redis-adapter');
    io.adapter(createAdapter(pubClient, subClient));
    redisClient = pubClient;

    const queueConnection = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    notificationQueue = new Queue('notification-queue', { connection: queueConnection as any });

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

  io.on('connection', (socket) => {
    console.log(`[Socket] User connected: ${socket.data.userId}`);
    registerChatHandlers(io, socket, notificationQueue as any, redisClient);
    registerCallHandlers(io, socket);
  });

  const PORT = Number(process.env.PORT) || 4000;

  // Without a listener for this, EADDRINUSE surfaces as an unhandled 'error'
  // event and a stack trace instead of an actionable message.
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`FATAL: port ${PORT} is already in use. Set PORT to a free port or stop the other process.`);
      process.exit(1);
    }
    console.error('FATAL: HTTP server error:', err);
    process.exit(1);
  });

  httpServer.listen(PORT, () => {
    console.log(`🚀 Unified Server running on port ${PORT}`);
    console.log(`   Allowed origins: ${allowedOrigins.join(', ') || '(none)'}`);
  });
}

// Drain in-flight requests and close DB handles instead of dropping them.
async function shutdown(signal: string) {
  console.log(`\n[Unified] ${signal} received, shutting down...`);
  io.close();
  httpServer.close();
  await mongoose.connection.close().catch(() => {});
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

startServer().catch((err) => {
  console.error('Failed to start unified server:', err);
  process.exit(1);
});

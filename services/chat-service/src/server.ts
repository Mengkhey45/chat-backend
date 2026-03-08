import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import mongoose from 'mongoose';
import { registerChatHandlers } from './sockets/chatHandler';
import apiRoutes from './routes/api';

const app = express();
const httpServer = createServer(app);

// 1. Traceability Header - Helps confirm which service is responding
app.use((req, res, next) => {
  res.setHeader('X-Service-Name', 'chat-service');
  console.log(`[ChatService] Incoming: ${req.method} ${req.url}`);
  next();
});

// 2. Standard Middleware
const allowedOrigins = [
  'http://localhost:3000',
  'https://richguyovn-chat.vercel.app',
  'https://richguyovn-chat-h01xky915-mengkheys-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      console.warn(`[CORS] ChatService Request from unauthorized origin: ${origin}`);
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

// 3. REST API Routes
// Handle requests arriving with /api/chat prefix (passed by Nginx)
app.use('/api/chat', apiRoutes);
// Handle requests arriving with /api prefix (in case Nginx strips /chat)
app.use('/api', apiRoutes);
// Handle direct requests
app.use('/', apiRoutes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'chat-service' }));

// 4. Custom 404
app.use((req, res) => {
  console.warn(`[ChatService] 404: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: "Route not found in Chat Service",
    received_path: req.url 
  });
});

// Redis & BullMQ
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();
const queueConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });
const notificationQueue = new Queue('notification-queue', { connection: queueConnection });

const io = new Server(httpServer, { cors: { origin: "*" } });

// Socket Auth
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("No token"));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    socket.data.userId = payload.userId;
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

async function startServer() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chat');
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  io.on('connection', (socket) => {
    registerChatHandlers(io, socket, notificationQueue, pubClient);
  });

  const PORT = process.env.CHAT_PORT || 5000;
  httpServer.listen(PORT, () => {
    console.log(`🔥 Chat Service running on port ${PORT}`);
  });
}

startServer().catch(err => console.error("Failed to start server:", err));

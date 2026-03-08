"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("redis");
const bullmq_1 = require("bullmq");
const ioredis_1 = require("ioredis");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const chatHandler_1 = require("./sockets/chatHandler");
const api_1 = __importDefault(require("./routes/api"));
const _dirname = path_1.default.resolve();
dotenv_1.default.config({ path: path_1.default.resolve(_dirname, '../../../.env') });
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// REST API Routes
app.use('/api', api_1.default);
// Redis Setup
const pubClient = (0, redis_1.createClient)({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();
// BullMQ Setup
const queueConnection = new ioredis_1.Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
});
const notificationQueue = new bullmq_1.Queue('notification-queue', { connection: queueConnection });
const io = new socket_io_1.Server(httpServer, {
    cors: { origin: "*" }
});
// --- 🛡️ SOCKET AUTH MIDDLEWARE ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication error: No token provided"));
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        socket.data.userId = payload.userId;
        next();
    }
    catch (err) {
        next(new Error("Authentication error: Invalid token"));
    }
});
async function startServer() {
    // Connect to MongoDB
    await mongoose_1.default.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/chat');
    console.log('📦 Connected to MongoDB');
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter((0, redis_adapter_1.createAdapter)(pubClient, subClient));
    io.on('connection', (socket) => {
        const userId = socket.data.userId;
        console.log(`👤 User Verified: ${userId}`);
        pubClient.set(`user:${userId}:status`, 'online');
        (0, chatHandler_1.registerChatHandlers)(io, socket, notificationQueue, pubClient);
        socket.on('disconnect', async () => {
            await pubClient.set(`user:${userId}:status`, 'offline');
            console.log('❌ User Disconnected');
        });
    });
    const PORT = process.env.CHAT_PORT || 5000;
    httpServer.listen(PORT, () => {
        console.log(`🔥 Chat Service running on port ${PORT}`);
    });
}
startServer().catch(err => console.error("Failed to start server:", err));

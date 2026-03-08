import express from 'express';
import { authMiddleware } from '../middleware/auth';
import * as conversationController from '../controllers/conversationController';
import * as messageController from '../controllers/messageController';
import * as friendController from '../controllers/friendController';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

// Conversation Routes
router.get('/conversations', conversationController.getConversations);
router.post('/conversations', conversationController.createConversation);

// Message Routes
router.get('/messages/:conversationId', messageController.getMessagesByConversation);

// Friend Routes (assuming friendController has these)
router.get('/friends', friendController.getFriends);
router.post('/friends/request', friendController.sendFriendRequest);
router.put('/friends/request/:requestId', friendController.handleFriendRequest);

export default router;

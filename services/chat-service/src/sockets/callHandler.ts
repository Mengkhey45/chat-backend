import { Server, Socket } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { Conversation } from '../models/Conversation';
import { User } from '../../../../shared/models/User';
import {
  validated,
  callOfferSchema,
  callAnswerSchema,
  callIceSchema,
  callIdSchema,
} from '../validation/socketSchemas';

/**
 * 1:1 WebRTC signalling.
 *
 * The server never sees audio or video — media flows peer-to-peer (or via TURN).
 * All this does is relay SDP offers/answers and ICE candidates between two
 * users, and enforce that both of them are entitled to be in the call.
 */

type CallState = 'ringing' | 'connected';

interface ActiveCall {
  callId: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  callType: 'audio' | 'video';
  state: CallState;
  startedAt: number;
  ringTimeout: NodeJS.Timeout;
}

const RING_TIMEOUT_MS = 45_000;

/**
 * In-process registry. This is deliberately not in Redis: a call's two peers
 * are connected to one server in the common deployment, and the signalling is
 * short-lived. If you scale to multiple backend instances behind a load
 * balancer, move this into Redis alongside the Socket.IO adapter, or calls
 * between users on different instances will not connect.
 */
const activeCalls = new Map<string, ActiveCall>();
const userToCall = new Map<string, string>();

const room = (userId: string) => `user:${userId}`;

function endCall(io: Server, call: ActiveCall, reason: string, exceptUserId?: string) {
  clearTimeout(call.ringTimeout);
  activeCalls.delete(call.callId);
  userToCall.delete(call.callerId);
  userToCall.delete(call.calleeId);

  for (const uid of [call.callerId, call.calleeId]) {
    if (uid === exceptUserId) continue;
    io.to(room(uid)).emit('call:ended', {
      callId: call.callId,
      reason,
      durationMs: call.state === 'connected' ? Date.now() - call.startedAt : 0,
    });
  }
}

/** The other party in a call, or null if this user isn't in it. */
function counterpart(call: ActiveCall, userId: string): string | null {
  if (call.callerId === userId) return call.calleeId;
  if (call.calleeId === userId) return call.callerId;
  return null;
}

/**
 * Look up a call and confirm the caller of this event actually belongs to it.
 * Without this check, knowing a callId would be enough to hang up or inject
 * ICE candidates into someone else's call.
 */
function authorizedCall(callId: string, userId: string): ActiveCall | null {
  const call = activeCalls.get(callId);
  if (!call) return null;
  return counterpart(call, userId) ? call : null;
}

export function registerCallHandlers(io: Server, socket: Socket) {
  const userId: string = socket.data.userId;

  socket.on(
    'call:offer',
    validated(callOfferSchema, socket, 'call:offer', async (data) => {
      const conversation = await Conversation.findOne({
        _id: new Types.ObjectId(data.conversationId),
        participants: new Types.ObjectId(userId),
      })
        .select('participants isGroup')
        .lean();

      if (!conversation) {
        socket.emit('call:failed', { reason: 'not-a-participant' });
        return;
      }
      if (conversation.isGroup) {
        socket.emit('call:failed', { reason: 'group-calls-unsupported' });
        return;
      }

      const calleeId = conversation.participants
        .map((p: any) => p.toString())
        .find((id: string) => id !== userId);

      if (!calleeId) {
        socket.emit('call:failed', { reason: 'no-recipient' });
        return;
      }

      if (userToCall.has(userId)) {
        socket.emit('call:failed', { reason: 'already-in-call' });
        return;
      }
      if (userToCall.has(calleeId)) {
        socket.emit('call:failed', { reason: 'callee-busy' });
        return;
      }

      // No point ringing someone with no connected client.
      const calleeSockets = await io.in(room(calleeId)).fetchSockets();
      if (calleeSockets.length === 0) {
        socket.emit('call:failed', { reason: 'callee-offline' });
        return;
      }

      const callId = randomUUID();
      const caller = await User.findById(userId).select('name email profile').lean();

      const call: ActiveCall = {
        callId,
        conversationId: data.conversationId,
        callerId: userId,
        calleeId,
        callType: data.callType,
        state: 'ringing',
        startedAt: Date.now(),
        ringTimeout: setTimeout(() => {
          const stale = activeCalls.get(callId);
          if (stale && stale.state === 'ringing') endCall(io, stale, 'no-answer');
        }, RING_TIMEOUT_MS),
      };

      activeCalls.set(callId, call);
      userToCall.set(userId, callId);
      userToCall.set(calleeId, callId);

      io.to(room(calleeId)).emit('call:incoming', {
        callId,
        conversationId: data.conversationId,
        callType: data.callType,
        sdp: data.sdp,
        from: {
          id: userId,
          name: (caller as any)?.name || (caller as any)?.email || 'Unknown',
          avatar: (caller as any)?.profile?.avatar,
        },
      });

      socket.emit('call:ringing', { callId, calleeId, callType: data.callType });
    })
  );

  socket.on(
    'call:answer',
    validated(callAnswerSchema, socket, 'call:answer', async (data) => {
      const call = activeCalls.get(data.callId);
      // Only the person being rung may answer.
      if (!call || call.calleeId !== userId) return;

      clearTimeout(call.ringTimeout);
      call.state = 'connected';
      call.startedAt = Date.now();

      io.to(room(call.callerId)).emit('call:accepted', {
        callId: call.callId,
        sdp: data.sdp,
      });
    })
  );

  socket.on(
    'call:ice',
    validated(callIceSchema, socket, 'call:ice', async (data) => {
      const call = authorizedCall(data.callId, userId);
      if (!call) return;
      const other = counterpart(call, userId)!;
      io.to(room(other)).emit('call:ice', {
        callId: call.callId,
        candidate: data.candidate,
      });
    })
  );

  socket.on(
    'call:reject',
    validated(callIdSchema, socket, 'call:reject', async (data) => {
      const call = activeCalls.get(data.callId);
      if (!call || call.calleeId !== userId) return;
      endCall(io, call, 'rejected');
    })
  );

  socket.on(
    'call:end',
    validated(callIdSchema, socket, 'call:end', async (data) => {
      const call = authorizedCall(data.callId, userId);
      if (!call) return;
      endCall(io, call, 'hung-up');
    })
  );

  socket.on('disconnect', async () => {
    const callId = userToCall.get(userId);
    if (!callId) return;

    // Another tab may still be holding the call open.
    const remaining = await io.in(room(userId)).fetchSockets();
    if (remaining.length > 0) return;

    const call = activeCalls.get(callId);
    if (call) endCall(io, call, 'peer-disconnected', userId);
  });
}

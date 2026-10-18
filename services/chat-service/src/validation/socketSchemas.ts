import { z } from 'zod';
import { Types } from 'mongoose';

/**
 * Schemas for every inbound socket event.
 *
 * Socket payloads are just as attacker-controlled as an HTTP body, but unlike
 * the REST routes these handlers used to trust their input and hand-roll checks.
 * Validating at the boundary means a handler body can assume its data is shaped
 * correctly and within limits.
 */

export const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

export const MAX_TEXT_LENGTH = 10_000;

export const joinRoomSchema = objectId;

export const sendMessageSchema = z.object({
  conversationId: objectId,
  content: z.string().max(MAX_TEXT_LENGTH).default(''),
  // Set by the client after a successful presigned upload.
  fileUrl: z.string().url().max(2048).optional(),
  // Legacy base64 path, kept for setups without object storage configured.
  fileData: z.string().max(12_000_000).optional(),
  fileName: z.string().max(200).optional(),
  fileType: z.string().max(100).optional(),
  isEncrypted: z.boolean().optional(),
  iv: z.string().max(100).optional(),
});

export const readReceiptSchema = z.object({
  conversationId: objectId,
  messageId: objectId,
});

export const editMessageSchema = z.object({
  conversationId: objectId,
  messageId: objectId,
  content: z.string().min(1).max(MAX_TEXT_LENGTH),
});

export const deleteMessageSchema = z.object({
  conversationId: objectId,
  messageId: objectId,
  /** 'everyone' unsends for all participants; 'me' hides it for you only. */
  scope: z.enum(['everyone', 'me']).default('everyone'),
});

export const typingSchema = z.object({
  conversationId: objectId,
});

export const presenceSchema = z.object({
  status: z.enum(['online', 'away', 'offline']),
});

// ---------- calling ----------

export const callTypeSchema = z.enum(['audio', 'video']);

/**
 * SDP and ICE payloads are relayed verbatim between peers, so they are bounded
 * by size and shape but not otherwise interpreted by the server.
 */
const sessionDescriptionSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().max(64_000),
});

export const callOfferSchema = z.object({
  conversationId: objectId,
  callType: callTypeSchema,
  sdp: sessionDescriptionSchema,
});

export const callAnswerSchema = z.object({
  callId: z.string().uuid(),
  sdp: sessionDescriptionSchema,
});

export const callIceSchema = z.object({
  callId: z.string().uuid(),
  candidate: z.object({
    candidate: z.string().max(2000),
    sdpMid: z.string().max(100).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(255).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  }),
});

export const callIdSchema = z.object({
  callId: z.string().uuid(),
});

/**
 * Wraps a handler so it only runs on a valid payload. An invalid one is
 * reported back to the sender instead of throwing inside the socket handler,
 * where it would otherwise be an unhandled rejection.
 */
export function validated<T extends z.ZodTypeAny>(
  schema: T,
  socket: { emit: (event: string, ...args: any[]) => void },
  event: string,
  handler: (data: z.infer<T>) => void | Promise<void>
) {
  return async (raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      console.warn(`[Socket] rejected ${event}: ${parsed.error.issues[0]?.message}`);
      socket.emit('socket:error', {
        event,
        error: 'Invalid payload',
        detail: parsed.error.issues[0]?.message,
      });
      return;
    }
    try {
      await handler(parsed.data);
    } catch (err) {
      console.error(`[Socket] ${event} failed:`, err);
      socket.emit('socket:error', { event, error: 'Server error' });
    }
  };
}

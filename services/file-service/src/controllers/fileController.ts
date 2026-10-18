import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { s3 } from "../config/s3";
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { Request, Response } from "express";

const REQUIRED_ENV = ["R2_BUCKET_NAME", "R2_PUBLIC_DOMAIN", "R2_ENDPOINT"] as const;

// Only these can be uploaded. Without a whitelist the presigned URL will happily
// accept text/html, which then serves as stored XSS off the public R2 domain.
const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'application/pdf', 'text/plain',
]);

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Lazily created: building the queue at import time crashes the whole unified
// server when Redis is down, even though file uploads are an optional feature.
let mediaQueue: Queue | null = null;
function getMediaQueue(): Queue | null {
  if (mediaQueue) return mediaQueue;
  if (!process.env.REDIS_URL) return null;
  try {
    const connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    mediaQueue = new Queue('media-queue', { connection });
  } catch (err) {
    console.warn('[Files] media queue unavailable:', (err as Error).message);
  }
  return mediaQueue;
}

/** Strip any path/traversal characters so the caller can't choose where the object lands. */
function safeName(name: string): string {
  return name.split(/[\\/]/).pop()!.replace(/[^\w.\-]/g, '_').slice(0, 100) || 'file';
}

const getUploadUrl = async (req: Request, res: Response) => {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[Files] missing env: ${missing.join(', ')}`);
    return res.status(503).json({ error: "File uploads are not configured" });
  }

  try {
    const { fileType, fileName, fileSize } = req.body ?? {};

    if (typeof fileType !== 'string' || typeof fileName !== 'string') {
      return res.status(400).json({ error: "Missing fileType or fileName" });
    }
    if (!ALLOWED_TYPES.has(fileType)) {
      return res.status(415).json({ error: `Unsupported file type: ${fileType}` });
    }
    if (typeof fileSize === 'number' && fileSize > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "File exceeds 25MB limit" });
    }

    const fileKey = `uploads/${randomUUID()}-${safeName(fileName)}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME as string,
      Key: fileKey,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    await getMediaQueue()
      ?.add('process-image', { fileKey, bucket: process.env.R2_BUCKET_NAME })
      .catch((err) => console.warn('[Files] could not enqueue media job:', err.message));

    res.json({
      uploadUrl: signedUrl,
      fileUrl: `${process.env.R2_PUBLIC_DOMAIN}/${fileKey}`,
      fileKey,
    });
  } catch (error: any) {
    console.error('[Files] presign failed:', error);
    res.status(500).json({ error: "Could not generate upload URL" });
  }
};

export { getMediaQueue, getUploadUrl };

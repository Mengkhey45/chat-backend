import { Worker } from 'bullmq';
import sharp from 'sharp';
import { s3 } from '../config/s3';
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379');

export const mediaWorker = new Worker('media-queue', async (job) => {
  const { fileKey, bucket } = job.data;

  // 1. Download original from R2
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: fileKey }));
  const streamToBuffer = (stream: any): Promise<Buffer> => 
    new Promise((res, rej) => {
      const chunks: any[] = [];
      stream.on("data", (chunk: any) => chunks.push(chunk));
      stream.on("error", rej);
      stream.on("end", () => res(Buffer.concat(chunks)));
    });

  const buffer = await streamToBuffer(response.Body);

  // 2. Resize with Sharp
  const thumbnailBuffer = await sharp(buffer)
    .resize(300, 300, { fit: 'cover' }) // Messenger-style square preview
    .jpeg({ quality: 80 })
    .toBuffer();

  // 3. Upload Thumbnail back to R2
  const thumbKey = fileKey.replace('uploads/', 'thumbnails/');
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: thumbKey,
    Body: thumbnailBuffer,
    ContentType: 'image/jpeg'
  }));

  console.log(`✅ Thumbnail created: ${thumbKey}`);
}, { connection });
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://redis:6379', {
  maxRetriesPerRequest: null
});

export const startNotificationWorker = () => {
  const worker = new Worker(
    'notification-queue', // Must match the name in Chat Service
    async (job: Job) => {
      const { senderId, receiverId, messageContent } = job.data;

      console.log(`🔔 Processing Notification for User: ${receiverId}`);
      console.log(`✉️ Content: "${messageContent}" from ${senderId}`);

      // HERE IS WHERE YOU WOULD CALL:
      // 1. Firebase Admin SDK (for Mobile Push)
      // 2. Twilio/SendGrid (for Email/SMS)
      // 3. Web Push API (for Browser alerts)
      
      // For now, let's simulate a delay (like an API call)
      await new Promise((res) => setTimeout(res, 1000));

      console.log(`✅ Notification sent to ${receiverId}`);
    },
    { connection }
  );

  worker.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed: ${err.message}`);
  });
};
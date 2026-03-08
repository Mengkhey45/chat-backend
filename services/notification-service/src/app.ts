import dotenv from 'dotenv';
import path from 'path';
import { startNotificationWorker } from './workers/notificationWorker';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

console.log('👷 Notification Worker Service Starting...');

try {
  startNotificationWorker();
  console.log('🚀 Worker is listening for jobs on Redis');
} catch (error) {
  console.error('Failed to start worker:', error);
}
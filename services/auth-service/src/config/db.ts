import mongoose from 'mongoose';
import type { ConnectOptions } from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string, {} as ConnectOptions);
    console.log('MongoDB Connected...');
  } catch (error) {
    const err = error as Error;
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

export default connectDB;

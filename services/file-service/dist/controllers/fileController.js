import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/s3";
import { v4 as uuidv4 } from "uuid";
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
// Validate required environment variables
const requiredEnv = ["R2_BUCKET_NAME", "R2_PUBLIC_DOMAIN", "REDIS_URL"];
for (const key of requiredEnv) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}
const queueConnection = new IORedis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null
});
const mediaQueue = new Queue('media-queue', { connection: queueConnection });
const getUploadUrl = async (req, res) => {
    try {
        const { fileType, fileName } = req.body;
        if (!fileType || !fileName) {
            return res.status(400).json({ error: "Missing fileType or fileName" });
        }
        const fileKey = `uploads/${uuidv4()}-${fileName}`;
        const command = new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: fileKey,
            ContentType: fileType,
        });
        // URL expires in 60 seconds
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 });
        // Signal the worker to process the image after upload
        await mediaQueue.add('process-image', {
            fileKey: fileKey,
            bucket: process.env.R2_BUCKET_NAME
        });
        res.json({
            uploadUrl: signedUrl,
            fileUrl: `${process.env.R2_PUBLIC_DOMAIN}/${fileKey}`
        });
    }
    catch (error) {
        res.status(500).json({ error: error?.message || "Could not generate upload URL" });
    }
};
export { mediaQueue, getUploadUrl };
//# sourceMappingURL=fileController.js.map
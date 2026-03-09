import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { getUploadUrl } from './controllers/fileController';

const app = express();
const PORT = process.env.PORT || 6000;

app.use(cors({
    origin: function (origin, callback) {
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'file-service' });
});

// File routes
const fileRouter = express.Router();

fileRouter.get('/', (req, res) => {
    res.json({ message: 'File Service Ready' });
});

// Route to get a presigned URL for uploading to R2/S3
fileRouter.post('/upload-url', getUploadUrl);

app.use('/api/files', fileRouter);

app.listen(PORT, () => {
    console.log(`📂 File Service running on port ${PORT}`);
});

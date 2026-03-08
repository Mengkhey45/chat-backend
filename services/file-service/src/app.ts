import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 6000;

app.use(express.json());

app.get('/', (req, res) => {
    res.send('File Service Placeholder');
});

app.listen(PORT, () => {
    console.log(`File Service running on port ${PORT}`);
});

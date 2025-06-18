import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/poker';

app.use(cors());
app.use(express.json());

// 路由
app.use('/api/auth', authRoutes);

// 启动HTTP服务器
const server = app.listen(PORT, () => {
  console.log(`Express server running on http://localhost:${PORT}`);
});

// 连接MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('MongoDB connected');
}).catch((err) => {
  console.error('MongoDB connection error:', err);
});

// WebSocket服务器
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('message', (message) => {
    // 这里处理前端发来的消息
    console.log('Received:', message.toString());
    ws.send('pong');
  });
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});
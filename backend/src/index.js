import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/room.js';
import Room from './models/Room.js';
import User from './models/User.js';
import { roomChannels, broadcastToRoom } from './ws-broadcast.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/poker';

app.use(cors());
app.use(express.json());

// 路由
app.use('/api/auth', authRoutes);
app.use('/api/room', roomRoutes);

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

// 房间列表订阅者集合
const roomListSubscribers = new Set();

function broadcastRoomListUpdate() {
  for (const ws of roomListSubscribers) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'roomListUpdate' }));
  }
}

function shuffleDeck() {
  // 生成并洗牌
  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const deck = [];
  for (const s of suits) for (const r of ranks) deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

wss.on('connection', (ws) => {
  ws.userId = null;
  ws.roomId = null;
  ws.isRoomList = false;

  ws.on('message', async (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    // 房间列表订阅
    if (data.type === 'subscribeRoomList') {
      ws.isRoomList = true;
      roomListSubscribers.add(ws);
      return;
    }
    // 处理消息类型
    if (data.type === 'joinRoom') {
      ws.userId = data.userId;
      ws.roomId = data.roomId;
      if (!roomChannels.has(ws.roomId)) roomChannels.set(ws.roomId, new Set());
      roomChannels.get(ws.roomId).add(ws);
      // 推送最新房间状态
      const room = await Room.findById(ws.roomId);
      broadcastToRoom(ws.roomId, { type: 'roomUpdate', room });
    }
    if (data.type === 'ready' || data.type === 'unready') {
      // 更新玩家准备状态
      const room = await Room.findById(ws.roomId);
      if (!room) return;
      const player = room.players.find(p => p.userId.equals(ws.userId));
      if (player) player.isReady = (data.type === 'ready');
      await room.save();
      broadcastToRoom(ws.roomId, { type: 'roomUpdate', room });
    }
    if (data.type === 'startGame') {
      // 只有房主能开始，且所有人已准备
      const room = await Room.findById(ws.roomId);
      if (!room) return;
      if (room.owner.toString() !== ws.userId) return;
      if (!room.players.every(p => p.isReady)) return;
      // 发牌
      const deck = shuffleDeck();
      const hands = {};
      for (const p of room.players) {
        hands[p.userId] = [deck.pop(), deck.pop()];
      }
      room.status = 'playing';
      await room.save();
      broadcastToRoom(ws.roomId, { type: 'gameStart', hands, room });
    }
    if (data.type === 'leaveRoom') {
      // 主动离开房间，移除玩家并广播
      const room = await Room.findById(data.roomId);
      if (room) {
        const before = room.players.length;
        room.players = room.players.filter(p => p.userId.toString() !== data.userId);
        if (room.players.length !== before) {
          // 如果房主离开，转让房主或解散房间
          if (room.owner.toString() === data.userId) {
            if (room.players.length > 0) {
              room.owner = room.players[0].userId;
              await room.save();
              broadcastToRoom(data.roomId, { type: 'roomUpdate', room });
            } else {
              await room.deleteOne();
              broadcastToRoom(data.roomId, { type: 'roomUpdate', room: null });
            }
          } else {
            await room.save();
            broadcastToRoom(data.roomId, { type: 'roomUpdate', room });
          }
        }
      }
    }
    if (data.type === 'joinRoom' || data.type === 'leaveRoom' || data.type === 'ready' || data.type === 'unready') {
      setTimeout(broadcastRoomListUpdate, 100); // 延迟，确保数据库已更新
    }
    if (data.type === 'startGame') {
      setTimeout(broadcastRoomListUpdate, 100);
    }
  });

  ws.on('close', async () => {
    // 断开时移除
    if (ws.roomId && roomChannels.has(ws.roomId)) {
      roomChannels.get(ws.roomId).delete(ws);
      if (roomChannels.get(ws.roomId).size === 0) roomChannels.delete(ws.roomId);
    }
    // 自动将玩家从房间移除并广播
    if (ws.roomId && ws.userId) {
      const room = await Room.findById(ws.roomId);
      if (room) {
        const before = room.players.length;
        room.players = room.players.filter(p => p.userId.toString() !== ws.userId);
        if (room.players.length !== before) {
          // 如果房主离开，转让房主或解散房间
          if (room.owner.toString() === ws.userId) {
            if (room.players.length > 0) {
              room.owner = room.players[0].userId;
              await room.save();
              broadcastToRoom(ws.roomId, { type: 'roomUpdate', room });
            } else {
              await room.deleteOne();
              broadcastToRoom(ws.roomId, { type: 'roomUpdate', room: null });
            }
          } else {
            await room.save();
            broadcastToRoom(ws.roomId, { type: 'roomUpdate', room });
          }
        }
      }
    }
    if (ws.isRoomList) roomListSubscribers.delete(ws);
    // 房间解散或玩家离开后也广播
    setTimeout(broadcastRoomListUpdate, 100);
  });
});

export { broadcastRoomListUpdate };
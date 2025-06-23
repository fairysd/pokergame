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

function getNextActionIndex(room, fromIndex) {
  // 获取下一个未弃牌且有筹码的玩家索引
  for (let i = 1; i < room.playerStates.length; i++) {
    const idx = (fromIndex + i) % room.playerStates.length;
    const p = room.playerStates[idx];
    if (!p.hasFolded && p.chips > 0) return idx;
  }
  return null;
}

function isBettingRoundOver(room) {
  const active = room.playerStates.filter(p => !p.hasFolded && p.chips > 0);
  if (active.length <= 1) return true;
  // actedUserIds去重
  const acted = Array.from(new Set(room.actedUserIds));
  if (acted.length < active.length) return false;
  if (!active.every(p => p.bet === room.currentBet)) return false;
  return true;
}

// 新下注轮结束判断
function isBettingRoundOverV2(room) {
  const active = room.playerStates.filter(p => !p.hasFolded && !p.isAllIn);
  if (active.length <= 1) return true;
  if (!active.every((p, i) => room.acted[i])) return false;
  if (!active.every(p => p.bet === room.currentBet)) return false;
  return true;
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
      try {
        await room.save();
      } catch (err) {
        if (err.name === 'VersionError') return;
        throw err;
      }
      broadcastToRoom(ws.roomId, { type: 'roomUpdate', room });
    }
    if (data.type === 'startGame') {
      // 只有房主能开始，且所有人已准备
      const room = await Room.findById(ws.roomId);
      if (!room) return;
      if (room.owner.toString() !== ws.userId) return;
      if (!room.players.every(p => p.isReady)) return;
      // 初始化牌桌
      const deck = shuffleDeck();
      room.status = 'playing';
      room.communityCards = [];
      room.pot = 0;
      room.currentStage = 'preflop';
      room.betHistory = [];
      room.deck = [...deck];
      // 分配座位和初始化玩家状态
      room.playerStates = room.players.map((p, i) => ({
        userId: p.userId,
        username: p.username,
        chips: 1000,
        hand: [deck.pop(), deck.pop()],
        bet: 0,
        hasFolded: false,
        isAllIn: false,
        seat: i
      }));
      // 分配庄家、小盲、大盲
      const n = room.playerStates.length;
      room.dealerIndex = 0;
      room.smallBlindIndex = n > 2 ? 1 : 0;
      room.bigBlindIndex = n > 2 ? 2 : 1;
      // 小盲下注1，大盲下注2
      room.playerStates[room.smallBlindIndex].chips -= 1;
      room.playerStates[room.smallBlindIndex].bet = 1;
      room.playerStates[room.bigBlindIndex].chips -= 2;
      room.playerStates[room.bigBlindIndex].bet = 2;
      room.pot = 3;
      room.currentBet = 2;
      room.minRaise = 2;
      room.lastAggressor = room.bigBlindIndex;
      // 初始化下注轮状态
      room.acted = Array(n).fill(false);
      room.actionIndex = (room.bigBlindIndex + 1) % n;
      // 跳过已全下或弃牌玩家
      while (room.playerStates[room.actionIndex].hasFolded || room.playerStates[room.actionIndex].isAllIn) {
        room.actionIndex = (room.actionIndex + 1) % n;
      }
      try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
      broadcastToRoom(ws.roomId, { type: 'tableUpdate', table: room.toObject() });
    }
    if (data.type === 'bet' || data.type === 'raise') {
      const room = await Room.findById(ws.roomId);
      if (!room || room.status !== 'playing') return;
      const idx = room.actionIndex;
      const player = room.playerStates[idx];
      if (!player || player.hasFolded || player.isAllIn) return;
      const amount = data.amount;
      if (amount < room.minRaise || amount > player.chips) return;
      player.chips -= amount;
      player.bet += amount;
      room.pot += amount;
      room.currentBet = player.bet;
      room.minRaise = Math.max(room.minRaise, amount);
      room.betHistory.push({ userId: player.userId, action: data.type, amount, stage: room.currentStage });
      room.acted[idx] = true;
      room.lastAggressor = idx;
      if (player.chips === 0) player.isAllIn = true;
      // 切换到下一个行动玩家
      let nextIdx = (idx + 1) % room.playerStates.length;
      while (room.playerStates[nextIdx].hasFolded || room.playerStates[nextIdx].isAllIn) {
        nextIdx = (nextIdx + 1) % room.playerStates.length;
        if (nextIdx === idx) break;
      }
      room.actionIndex = nextIdx;
      // 判断下注轮是否结束
      if (isBettingRoundOverV2(room)) {
        setTimeout(() => { wss.emit('nextStage', ws.roomId); }, 300);
      }
      try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
      broadcastToRoom(ws.roomId, { type: 'tableUpdate', table: room.toObject() });
    }
    if (data.type === 'call') {
      const room = await Room.findById(ws.roomId);
      if (!room || room.status !== 'playing') return;
      const idx = room.actionIndex;
      const player = room.playerStates[idx];
      if (!player || player.hasFolded || player.isAllIn) return;
      const toCall = room.currentBet - player.bet;
      if (toCall > player.chips) return;
      player.chips -= toCall;
      player.bet += toCall;
      room.pot += toCall;
      room.betHistory.push({ userId: player.userId, action: 'call', amount: toCall, stage: room.currentStage });
      room.acted[idx] = true;
      if (player.chips === 0) player.isAllIn = true;
      let nextIdx = (idx + 1) % room.playerStates.length;
      while (room.playerStates[nextIdx].hasFolded || room.playerStates[nextIdx].isAllIn) {
        nextIdx = (nextIdx + 1) % room.playerStates.length;
        if (nextIdx === idx) break;
      }
      room.actionIndex = nextIdx;
      if (isBettingRoundOverV2(room)) {
        setTimeout(() => { wss.emit('nextStage', ws.roomId); }, 300);
      }
      try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
      broadcastToRoom(ws.roomId, { type: 'tableUpdate', table: room.toObject() });
    }
    if (data.type === 'check') {
      const room = await Room.findById(ws.roomId);
      if (!room || room.status !== 'playing') return;
      const idx = room.actionIndex;
      const player = room.playerStates[idx];
      if (!player || player.hasFolded || player.isAllIn || player.bet !== room.currentBet) return;
      room.betHistory.push({ userId: player.userId, action: 'check', amount: 0, stage: room.currentStage });
      room.acted[idx] = true;
      let nextIdx = (idx + 1) % room.playerStates.length;
      while (room.playerStates[nextIdx].hasFolded || room.playerStates[nextIdx].isAllIn) {
        nextIdx = (nextIdx + 1) % room.playerStates.length;
        if (nextIdx === idx) break;
      }
      room.actionIndex = nextIdx;
      if (isBettingRoundOverV2(room)) {
        setTimeout(() => { wss.emit('nextStage', ws.roomId); }, 300);
      }
      try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
      broadcastToRoom(ws.roomId, { type: 'tableUpdate', table: room.toObject() });
    }
    if (data.type === 'fold') {
      const room = await Room.findById(ws.roomId);
      if (!room || room.status !== 'playing') return;
      const idx = room.actionIndex;
      const player = room.playerStates[idx];
      if (!player || player.hasFolded) return;
      player.hasFolded = true;
      room.betHistory.push({ userId: player.userId, action: 'fold', amount: 0, stage: room.currentStage });
      room.acted[idx] = true;
      let nextIdx = (idx + 1) % room.playerStates.length;
      while (room.playerStates[nextIdx].hasFolded || room.playerStates[nextIdx].isAllIn) {
        nextIdx = (nextIdx + 1) % room.playerStates.length;
        if (nextIdx === idx) break;
      }
      room.actionIndex = nextIdx;
      if (isBettingRoundOverV2(room)) {
        setTimeout(() => { wss.emit('nextStage', ws.roomId); }, 300);
      }
      try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
      broadcastToRoom(ws.roomId, { type: 'tableUpdate', table: room.toObject() });
    }
    if (data.type === 'allin') {
      const room = await Room.findById(ws.roomId);
      if (!room || room.status !== 'playing') return;
      const idx = room.actionIndex;
      const player = room.playerStates[idx];
      if (!player || player.hasFolded || player.isAllIn) return;
      const amount = player.chips;
      player.bet += amount;
      room.pot += amount;
      player.chips = 0;
      player.isAllIn = true;
      room.betHistory.push({ userId: player.userId, action: 'allin', amount, stage: room.currentStage });
      room.acted[idx] = true;
      let nextIdx = (idx + 1) % room.playerStates.length;
      while (room.playerStates[nextIdx].hasFolded || room.playerStates[nextIdx].isAllIn) {
        nextIdx = (nextIdx + 1) % room.playerStates.length;
        if (nextIdx === idx) break;
      }
      room.actionIndex = nextIdx;
      if (isBettingRoundOverV2(room)) {
        setTimeout(() => { wss.emit('nextStage', ws.roomId); }, 300);
      }
      try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
      broadcastToRoom(ws.roomId, { type: 'tableUpdate', table: room.toObject() });
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
              try {
                await room.save();
              } catch (err) {
                if (err.name === 'VersionError') return;
                throw err;
              }
              broadcastToRoom(data.roomId, { type: 'roomUpdate', room });
            } else {
              await room.deleteOne();
              broadcastToRoom(data.roomId, { type: 'roomUpdate', room: null });
            }
          } else {
            try {
              await room.save();
            } catch (err) {
              if (err.name === 'VersionError') return;
              throw err;
            }
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
              try {
                await room.save();
              } catch (err) {
                if (err.name === 'VersionError') return;
                throw err;
              }
              broadcastToRoom(ws.roomId, { type: 'roomUpdate', room });
            } else {
              await room.deleteOne();
              broadcastToRoom(ws.roomId, { type: 'roomUpdate', room: null });
            }
          } else {
            try {
              await room.save();
            } catch (err) {
              if (err.name === 'VersionError') return;
              throw err;
            }
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

// 自动推进阶段
wss.on('nextStage', async (roomId) => {
  const room = await Room.findById(roomId);
  if (!room || room.status !== 'playing') return;
  // 发公共牌
  if (room.currentStage === 'preflop') {
    room.currentStage = 'flop';
    room.communityCards = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
  } else if (room.currentStage === 'flop') {
    room.currentStage = 'turn';
    room.communityCards.push(room.deck.pop());
  } else if (room.currentStage === 'turn') {
    room.currentStage = 'river';
    room.communityCards.push(room.deck.pop());
  } else if (room.currentStage === 'river') {
    room.currentStage = 'showdown';
    // TODO: 结算与比牌
  }
  // 重置下注状态
  room.playerStates.forEach(p => { p.bet = 0; if (!p.hasFolded && !p.isAllIn) p.acted = false; });
  room.acted = room.playerStates.map(p => (!p.hasFolded && !p.isAllIn) ? false : true);
  room.currentBet = 0;
  room.minRaise = 2;
  room.lastAggressor = null;
  // 设置下一个行动玩家（庄家左侧第一个未弃牌未全下玩家）
  const n = room.playerStates.length;
  let idx = (room.dealerIndex + 1) % n;
  while (room.playerStates[idx].hasFolded || room.playerStates[idx].isAllIn) {
    idx = (idx + 1) % n;
  }
  room.actionIndex = idx;
  try { await room.save(); } catch (err) { if (err.name === 'VersionError') return; throw err; }
  broadcastToRoom(roomId, { type: 'tableUpdate', table: room.toObject() });
});

export { broadcastRoomListUpdate };
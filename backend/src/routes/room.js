import express from 'express';
import Room from '../models/Room.js';
import User from '../models/User.js';
import { verifyToken } from '../utils/jwt.js';
import { broadcastToRoom } from '../ws-broadcast.js';
import { broadcastRoomListUpdate } from '../index.js';

const router = express.Router();

// 鉴权中间件
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: '未登录' });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ message: '无效token' });
  req.user = user;
  next();
}

// 创建房间
router.post('/create', auth, async (req, res) => {
  const { name, maxPlayers } = req.body;
  if (!name) return res.status(400).json({ message: '房间名不能为空' });
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    const room = await Room.create({
      name,
      owner: user._id,
      players: [{ userId: user._id, username: user.username, isReady: false }],
      maxPlayers: maxPlayers || 6
    });
    res.json(room);
    broadcastRoomListUpdate();
  } catch (err) {
    res.status(500).json({ message: '创建房间失败', error: err.message });
  }
});

// 加入房间
router.post('/join', auth, async (req, res) => {
  const { roomId } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: '房间不存在' });
    if (room.players.find(p => p.userId.equals(user._id))) {
      return res.status(400).json({ message: '已在房间中' });
    }
    if (room.players.length >= room.maxPlayers) {
      return res.status(400).json({ message: '房间已满' });
    }
    room.players.push({ userId: user._id, username: user.username, isReady: false });
    await room.save();
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: '加入房间失败', error: err.message });
  }
});

// 离开房间
router.post('/leave', auth, async (req, res) => {
  const { roomId } = req.body;
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: '用户不存在' });
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: '房间不存在' });
    room.players = room.players.filter(p => !p.userId.equals(user._id));
    // 如果房主离开，转让房主或解散房间
    if (room.owner.equals(user._id)) {
      if (room.players.length > 0) {
        room.owner = room.players[0].userId;
      } else {
        await room.deleteOne();
        // 广播房间解散
        broadcastToRoom(roomId, { type: 'roomUpdate', room: null });
        broadcastRoomListUpdate();
        return res.json({ message: '房间已解散' });
      }
    }
    await room.save();
    // 广播最新房间状态
    broadcastToRoom(roomId, { type: 'roomUpdate', room });
    broadcastRoomListUpdate();
    res.json({ message: '已离开房间' });
  } catch (err) {
    res.status(500).json({ message: '离开房间失败', error: err.message });
  }
});

// 获取房间列表
router.get('/list', async (req, res) => {
  try {
    const rooms = await Room.find({}, 'name owner players maxPlayers status createdAt');
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: '获取房间列表失败', error: err.message });
  }
});

// 获取房间详情
router.get('/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: '房间不存在' });
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: '获取房间详情失败', error: err.message });
  }
});

export default router; 
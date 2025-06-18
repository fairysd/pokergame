import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../utils/jwt.js';

const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  try {
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: '用户名已存在' });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hash });
    const token = generateToken({ id: user._id, username: user.username });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ message: '注册失败', error: err.message });
  }
});

// 登录
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }
  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }
    const token = generateToken({ id: user._id, username: user.username });
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ message: '登录失败', error: err.message });
  }
});

export default router;
import mongoose from 'mongoose';

const betActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['bet', 'call', 'raise', 'check', 'fold', 'allin'], required: true },
  amount: { type: Number, default: 0 },
  stage: { type: String },
  timestamp: { type: Date, default: Date.now }
}, { _id: false });

const playerStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  chips: { type: Number, default: 1000 },
  hand: { type: [String], default: [] },
  bet: { type: Number, default: 0 },
  hasFolded: { type: Boolean, default: false },
  isAllIn: { type: Boolean, default: false },
  seat: { type: Number, default: 0 }
}, { _id: false });

const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  username: { type: String, required: true },
  isReady: { type: Boolean, default: false }
}, { _id: false });

const roomSchema = new mongoose.Schema({
  name: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  players: [playerSchema],
  maxPlayers: { type: Number, default: 6 },
  status: { type: String, enum: ['waiting', 'playing'], default: 'waiting' },
  createdAt: { type: Date, default: Date.now },

  // 牌桌相关
  dealerIndex: { type: Number, default: 0 },
  smallBlindIndex: { type: Number, default: 1 },
  bigBlindIndex: { type: Number, default: 2 },
  communityCards: { type: [String], default: [] },
  pot: { type: Number, default: 0 },
  currentStage: { type: String, enum: ['preflop', 'flop', 'turn', 'river', 'showdown'], default: 'preflop' },
  deck: { type: [String], default: [] },
  actionIndex: { type: Number, default: 0 },
  currentBet: { type: Number, default: 0 },
  minRaise: { type: Number, default: 2 },
  lastAggressor: { type: Number, default: null },
  acted: { type: [Boolean], default: [] },
  playerStates: { type: [playerStateSchema], default: [] },
  betHistory: { type: [betActionSchema], default: [] }
});

export default mongoose.model('Room', roomSchema); 
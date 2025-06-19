import mongoose from 'mongoose';

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
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('Room', roomSchema); 
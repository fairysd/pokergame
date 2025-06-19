import Room from './models/Room.js';

// 这里的roomChannels和broadcastToRoom要与index.js保持同步
export const roomChannels = global._roomChannels = global._roomChannels || new Map();

export function broadcastToRoom(roomId, data) {
  const set = roomChannels.get(roomId);
  if (set) {
    for (const ws of set) {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(data));
    }
  }
} 
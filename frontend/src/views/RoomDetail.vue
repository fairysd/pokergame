<template>
  <div class="room-detail-container" v-if="room">
    <div class="my-username">我的用户名：{{ username }}</div>
    <h2>{{ room.name }}</h2>
    <div>房主：{{ ownerName }}</div>
    <div>状态：{{ room.status === 'waiting' ? '等待中' : '游戏中' }}</div>
    <div>人数：{{ room.players.length }}/{{ room.maxPlayers }}</div>
    <h3>玩家列表</h3>
    <ul>
      <li v-for="p in room.players" :key="p.userId">
        {{ p.username }}
        <span v-if="room.owner === p.userId">(房主)</span>
        <span v-if="p.isReady" style="color:green;">✔已准备</span>
        <span v-else style="color:#888;">未准备</span>
        <span v-if="hands && hands[p.userId]"> 手牌: {{ hands[p.userId].join(' ') }}</span>
      </li>
    </ul>
    <div class="actions">
      <button v-if="room.status === 'waiting'" @click="toggleReady">
        {{ myReady ? '取消准备' : '准备' }}
      </button>
      <button v-if="isOwner && room.status === 'waiting' && allReady" @click="startGame">开始游戏</button>
      <button @click="leaveRoom">离开房间</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
  <div v-else>加载中...</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import axios from 'axios';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';

const route = useRoute();
const router = useRouter();
const room = ref(null);
const error = ref('');
const ws = ref(null);
const hands = ref(null);
const userStore = useUserStore();

async function fetchRoom() {
  try {
    const res = await axios.get(`http://localhost:3001/api/room/${route.params.id}`);
    room.value = res.data;
  } catch (err) {
    error.value = err.response?.data?.message || '加载失败';
  }
}

function connectWS() {
  ws.value = new WebSocket('ws://localhost:3001');
  ws.value.onopen = () => {
    ws.value.send(JSON.stringify({ type: 'joinRoom', roomId: route.params.id, userId: userStore.userId }));
  };
  ws.value.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'roomUpdate') {
      if (data.room === null) {
        error.value = '房间已解散';
        setTimeout(() => router.push('/rooms'), 1200);
        return;
      }
      room.value = data.room;
      hands.value = null;
    }
    if (data.type === 'gameStart') {
      room.value = data.room;
      hands.value = data.hands;
    }
  };
}

function sendWS(type) {
  if (ws.value && ws.value.readyState === 1) {
    ws.value.send(JSON.stringify({ type, roomId: route.params.id, userId: userStore.userId }));
  }
}

function toggleReady() {
  sendWS(myReady.value ? 'unready' : 'ready');
}

function startGame() {
  sendWS('startGame');
}

async function leaveRoom() {
  try {
    const token = userStore.token;
    await axios.post('http://localhost:3001/api/room/leave', {
      roomId: room.value._id
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (ws.value && ws.value.readyState === 1) {
      ws.value.send(JSON.stringify({ type: 'leaveRoom', roomId: room.value._id, userId: userStore.userId }));
    }
    if (ws.value) ws.value.close();
    router.push('/rooms');
  } catch (err) {
    error.value = err.response?.data?.message || '离开失败';
  }
}

const ownerName = computed(() => {
  if (!room.value) return '';
  const owner = room.value.players.find(p => p.userId === room.value.owner);
  return owner ? owner.username : '';
});

const myReady = computed(() => {
  if (!room.value) return false;
  const me = room.value.players.find(p => p.userId === userStore.userId);
  return me ? me.isReady : false;
});

const isOwner = computed(() => room.value && room.value.owner === userStore.userId);
const allReady = computed(() => room.value && room.value.players.length > 1 && room.value.players.every(p => p.isReady));

const username = computed(() => userStore.username);
const userId = computed(() => userStore.userId);

onMounted(() => {
  userStore.initFromStorage();
  // 兼容老用户，userId存入localStorage
  fetchRoom();
  connectWS();
});
onUnmounted(() => {
  if (ws.value) ws.value.close();
});
</script>

<style scoped>
.room-detail-container {
  max-width: 400px;
  margin: 40px auto;
  padding: 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px #eee;
}
.my-username {
  font-size: 15px;
  color: #666;
  margin-bottom: 8px;
}
ul {
  list-style: none;
  padding: 0;
}
li {
  padding: 4px 0;
}
.actions {
  margin-top: 16px;
}
button {
  margin-right: 8px;
  padding: 8px 16px;
  background: #42b983;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.error {
  color: red;
  margin-top: 8px;
}
</style> 
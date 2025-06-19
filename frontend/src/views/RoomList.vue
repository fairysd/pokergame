npm<template>
  <div class="room-list-container">
    <div class="my-username">我的用户名：{{ username }}</div>
    <h2>房间列表</h2>
    <div v-if="myRoomId" class="my-room-tip">
      <button @click="router.push(`/room/${myRoomId}`)">进入我的房间</button>
    </div>
    <button @click="showCreate = true">创建房间</button>
    <div v-if="rooms.length === 0" class="empty">暂无房间</div>
    <ul>
      <li v-for="room in rooms" :key="room._id" class="room-item">
        <span>{{ room.name }}（{{ room.players.length }}/{{ room.maxPlayers }}）</span>
        <button @click="joinRoom(room._id)">加入</button>
      </li>
    </ul>
    <!-- 创建房间弹窗 -->
    <div v-if="showCreate" class="modal">
      <div class="modal-content">
        <h3>创建房间</h3>
        <form @submit.prevent="createRoom">
          <input v-model="roomName" placeholder="房间名" required />
          <input v-model.number="maxPlayers" type="number" min="2" max="9" placeholder="最大人数(2-9)" />
          <button type="submit">创建</button>
          <button type="button" @click="showCreate = false">取消</button>
        </form>
        <div v-if="error" class="error">{{ error }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';

const rooms = ref([]);
const showCreate = ref(false);
const roomName = ref('');
const maxPlayers = ref(6);
const error = ref('');
const router = useRouter();
const userStore = useUserStore();
const ws = ref(null);

function connectWS() {
  ws.value = new WebSocket('ws://localhost:3001');
  ws.value.onopen = () => {
    ws.value.send(JSON.stringify({ type: 'subscribeRoomList' }));
  };
  ws.value.onmessage = (e) => {
    const data = JSON.parse(e.data);
    if (data.type === 'roomListUpdate') {
      fetchRooms();
    }
  };
}

onMounted(() => {
  userStore.initFromStorage();
  fetchRooms();
  connectWS();
});

onUnmounted(() => {
  if (ws.value) ws.value.close();
});

const username = computed(() => userStore.username);
const userId = computed(() => userStore.userId);
const myRoomId = ref(null);

async function fetchRooms() {
  const res = await axios.get('http://localhost:3001/api/room/list');
  rooms.value = res.data;
  // 检查自己是否在某个房间
  if (userId.value) {
    const found = rooms.value.find(room => room.players.some(p => p.userId === userId.value));
    myRoomId.value = found ? found._id : null;
  }
}

async function createRoom() {
  error.value = '';
  try {
    const token = localStorage.getItem('token');
    const res = await axios.post('http://localhost:3001/api/room/create', {
      name: roomName.value,
      maxPlayers: maxPlayers.value
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    showCreate.value = false;
    roomName.value = '';
    maxPlayers.value = 6;
    router.push(`/room/${res.data._id}`);
  } catch (err) {
    error.value = err.response?.data?.message || '创建失败';
  }
}

async function joinRoom(roomId) {
  try {
    const token = localStorage.getItem('token');
    await axios.post('http://localhost:3001/api/room/join', {
      roomId
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    router.push(`/room/${roomId}`);
  } catch (err) {
    alert(err.response?.data?.message || '加入失败');
  }
}
</script>

<style scoped>
.room-list-container {
  max-width: 480px;
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
.room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #eee;
}
.empty {
  color: #888;
  margin: 16px 0;
}
button {
  margin-left: 8px;
  padding: 4px 12px;
  background: #42b983;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.modal {
  position: fixed;
  left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.2);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-content {
  background: #fff;
  padding: 24px;
  border-radius: 8px;
  min-width: 260px;
}
.error {
  color: red;
  margin-top: 8px;
}
.my-room-tip {
  margin-bottom: 16px;
}
</style> 
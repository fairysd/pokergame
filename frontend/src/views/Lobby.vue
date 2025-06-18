<template>
  <div class="lobby-container">
    <h2>欢迎，{{ username }}</h2>
    <button @click="logout">退出登录</button>
    <div class="ws-status">
      WebSocket状态：<span :style="{color: wsConnected ? 'green' : 'red'}">{{ wsConnected ? '已连接' : '未连接' }}</span>
    </div>
    <div>
      <button @click="sendPing">发送Ping</button>
      <div v-if="wsMsg">收到消息：{{ wsMsg }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const username = localStorage.getItem('username') || '';
const router = useRouter();

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  router.push('/login');
}

const ws = ref(null);
const wsConnected = ref(false);
const wsMsg = ref('');

function connectWS() {
  ws.value = new WebSocket('ws://localhost:3001');
  ws.value.onopen = () => {
    wsConnected.value = true;
  };
  ws.value.onclose = () => {
    wsConnected.value = false;
  };
  ws.value.onmessage = (e) => {
    wsMsg.value = e.data;
  };
}

function sendPing() {
  if (ws.value && wsConnected.value) {
    ws.value.send('ping');
  }
}

onMounted(connectWS);
onUnmounted(() => {
  if (ws.value) ws.value.close();
});
</script>

<style scoped>
.lobby-container {
  max-width: 400px;
  margin: 60px auto;
  padding: 32px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 8px #eee;
  text-align: center;
}
.ws-status {
  margin: 16px 0;
}
button {
  margin: 8px;
  padding: 8px 16px;
  font-size: 16px;
  background: #42b983;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
</style> 
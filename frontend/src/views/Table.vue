<template>
  <div class="table-container" v-if="table">
    <div class="table-header">
      <div>底池：{{ table.pot }}</div>
      <div>阶段：{{ stageText }}</div>
    </div>
    <div class="community-cards">
      <span v-for="(card, i) in table.communityCards" :key="i" class="card">{{ card }}</span>
    </div>
    <div class="players">
      <div v-for="(p, idx) in table.playerStates" :key="p.userId" :class="['player', { current: table.actionIndex === idx, folded: p.hasFolded, allin: p.isAllIn }]">
        <div>{{ p.username }} <span v-if="table.actionIndex === idx">(行动)</span></div>
        <div>筹码: {{ p.chips }}</div>
        <div>当前下注: {{ p.bet }}</div>
        <div v-if="p.userId === userId || table.currentStage === 'showdown'">手牌: <span v-for="(c, i) in p.hand" :key="i" class="card">{{ c }}</span></div>
        <div v-if="p.hasFolded" style="color:#888;">已弃牌</div>
        <div v-if="p.isAllIn && !p.hasFolded" style="color:#c00;">全下</div>
      </div>
    </div>
    {{ toCall}}
    <div class="actions" v-if="isMyTurn">
      <div>当前最大注：{{ table.currentBet }}，你已下注：{{ myState.bet || 0 }}，需跟注：{{ toCall }}</div>
      <input v-model.number="betAmount" type="number" min="1" :max="myState.chips" placeholder="下注/加注金额" />
      <button @click="bet" :disabled="betAmount < table.minRaise || betAmount > myState.chips ">下注/加注</button>
      <button @click="call" :disabled="toCall === 0 || toCall > myState.chips">跟注</button>
      <button @click="check" :disabled="toCall !== 0">过牌</button>
      <button @click="allin" :disabled="myState.chips === 0">全下</button>
      <button @click="fold">弃牌</button>
    </div>
    <div class="actions" v-if="isOwner && table.currentStage !== 'showdown'">
      <!-- <button @click="nextStage">进入下一阶段</button> -->
    </div>
    <div v-if="table.currentStage === 'showdown'" class="showdown">摊牌阶段，结算未实现</div>
    <button class="back-btn" @click="router.push(`/room/${roomId}`)">返回房间</button>
  </div>
  <div v-else>加载中...</div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';
import axios from 'axios';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const roomId = route.params.roomId;
const userId = userStore.userId;
const username = userStore.username;
const table = ref(null);
const ws = ref(null);
const betAmount = ref(1);
const players = ref([]);
const isOwner = ref(false);

const stageText = computed(() => {
  switch (table.value?.currentStage) {
    case 'preflop': return '翻牌前';
    case 'flop': return '翻牌';
    case 'turn': return '转牌';
    case 'river': return '河牌';
    case 'showdown': return '摊牌';
    default: return '';
  }
});

const myState = computed(() => {
  if (!table.value) return {};
  return table.value.playerStates.find(p => String(p.userId) === String(userId)) || {};
});

const toCall = computed(() => Math.max(0, (table.value?.currentBet || 0) - (myState.value.bet || 0)));

const myIndex = computed(() => table.value?.playerStates.findIndex(p => String(p.userId) == String(userId)));
const isMyTurn = computed(() => myIndex.value === table.value?.actionIndex && !myState.value.hasFolded && !myState.value.isAllIn && table.value.currentStage !== 'showdown');

function bet() {
  if (ws.value && betAmount.value > 0 && betAmount.value <= myState.value.chips ) {
    ws.value.send(JSON.stringify({ type: 'bet', amount: betAmount.value }));
    betAmount.value = 1;
  }
}
function call() {
  if (ws.value && toCall.value > 0 && toCall.value <= myState.value.chips) {
    ws.value.send(JSON.stringify({ type: 'call' }));
  }
}
function fold() {
  if (ws.value) ws.value.send(JSON.stringify({ type: 'fold' }));
}
function check() {
  if (ws.value && toCall.value === 0) ws.value.send(JSON.stringify({ type: 'check' }));
}
function nextStage() {
  if (ws.value) ws.value.send(JSON.stringify({ type: 'nextStage' }));
}
function allin() {
  if (ws.value && myState.value.chips > 0) {
    ws.value.send(JSON.stringify({ type: 'allin' }));
  }
}

async function fetchPlayers() {
  // 获取玩家用户名映射
  const res = await axios.get(`http://localhost:3001/api/room/${roomId}`);
  players.value = res.data.players;
  isOwner.value = res.data.owner === userId;
}

function connectWS() {
  ws.value = new WebSocket('ws://localhost:3001');
  ws.value.onopen = () => {
    ws.value.send(JSON.stringify({ type: 'joinRoom', roomId, userId }));
  };
  ws.value.onmessage = (e) => {
    const data = JSON.parse(e.data);
    console.log(data.table)
    if (data.type === 'tableUpdate') {
      table.value = data.table;
      console.log(table.value)
      fetchPlayers();
    }
  };
}

async function fetchTable() {
  const res = await axios.get(`http://localhost:3001/api/room/${roomId}`);
  if (!table.value) {
    table.value = res.data

  }
}

onMounted(() => {
  fetchPlayers();
  connectWS();
  fetchTable();
});
onUnmounted(() => {
  if (ws.value) ws.value.close();
});
</script>

<style scoped>
.table-container {
  max-width: 700px;
  margin: 40px auto;
  padding: 24px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px #eee;
}
.table-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}
.community-cards {
  margin-bottom: 16px;
}
.card {
  display: inline-block;
  width: 36px;
  height: 48px;
  background: #f5f5f5;
  border: 1px solid #bbb;
  border-radius: 4px;
  text-align: center;
  line-height: 48px;
  font-size: 20px;
  margin-right: 8px;
}
.players {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 16px;
}
.player {
  min-width: 120px;
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  background: #fafafa;
  position: relative;
}
.player.current {
  border: 2px solid #42b983;
  background: #eafff3;
}
.player.folded {
  opacity: 0.5;
}
.player.allin {
  border: 2px solid #c00;
  background: #fff0f0;
}
.actions {
  margin-bottom: 16px;
}
.showdown {
  color: #c00;
  font-weight: bold;
  margin-bottom: 12px;
}
.back-btn {
  margin-top: 12px;
  background: #888;
}
</style> 
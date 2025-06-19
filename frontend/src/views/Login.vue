<template>
  <div class="login-container">
    <h2>登录</h2>
    <form @submit.prevent="onLogin">
      <input v-model="username" placeholder="用户名" required />
      <input v-model="password" type="password" placeholder="密码" required />
      <button type="submit">登录</button>
    </form>
    <p>没有账号？<router-link to="/register">注册</router-link></p>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';
import { useUserStore } from '../stores/user';

const username = ref('');
const password = ref('');
const error = ref('');
const router = useRouter();
const userStore = useUserStore();

async function onLogin() {
  error.value = '';
  try {
    const res = await axios.post('http://localhost:3001/api/auth/login', {
      username: username.value,
      password: password.value
    });
    const token = res.data.token;
    const payload = JSON.parse(atob(token.split('.')[1]));
    userStore.setUser({
      userId: payload.id,
      username: res.data.username,
      token
    });
    router.push('/rooms');
  } catch (err) {
    error.value = err.response?.data?.message || '登录失败';
  }
}
</script>

<style scoped>
.login-container {
  max-width: 320px;
  margin: 80px auto;
  padding: 32px;
  border: 1px solid #eee;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 2px 8px #eee;
}
input {
  display: block;
  width: 100%;
  margin-bottom: 16px;
  padding: 8px;
  font-size: 16px;
}
button {
  width: 100%;
  padding: 8px;
  font-size: 16px;
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
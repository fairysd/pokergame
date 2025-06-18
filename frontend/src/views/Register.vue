<template>
  <div class="register-container">
    <h2>注册</h2>
    <form @submit.prevent="onRegister">
      <input v-model="username" placeholder="用户名" required />
      <input v-model="password" type="password" placeholder="密码" required />
      <button type="submit">注册</button>
    </form>
    <p>已有账号？<router-link to="/login">登录</router-link></p>
    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';
import { useRouter } from 'vue-router';

const username = ref('');
const password = ref('');
const error = ref('');
const router = useRouter();

async function onRegister() {
  error.value = '';
  try {
    const res = await axios.post('http://localhost:3001/api/auth/register', {
      username: username.value,
      password: password.value
    });
    localStorage.setItem('token', res.data.token);
    localStorage.setItem('username', res.data.username);
    router.push('/lobby');
  } catch (err) {
    error.value = err.response?.data?.message || '注册失败';
  }
}
</script>

<style scoped>
.register-container {
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
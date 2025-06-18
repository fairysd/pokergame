import { createRouter, createWebHistory } from 'vue-router';
import Login from '../views/Login.vue';
import Register from '../views/Register.vue';
import Lobby from '../views/Lobby.vue';

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/lobby', component: Lobby }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router; 
import { createRouter, createWebHistory } from 'vue-router';
import Login from '../views/Login.vue';
import Register from '../views/Register.vue';
import Lobby from '../views/Lobby.vue';
import RoomList from '../views/RoomList.vue';
import RoomDetail from '../views/RoomDetail.vue';

const routes = [
  { path: '/', redirect: '/login' },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/lobby', component: Lobby },
  { path: '/rooms', component: RoomList },
  { path: '/room/:id', component: RoomDetail }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router; 
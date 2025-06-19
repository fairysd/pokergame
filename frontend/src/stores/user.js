import { defineStore } from 'pinia';

export const useUserStore = defineStore('user', {
  state: () => ({
    userId: '',
    username: '',
    token: ''
  }),
  actions: {
    setUser({ userId, username, token }) {
      this.userId = userId;
      this.username = username;
      this.token = token;
      localStorage.setItem('userId', userId);
      localStorage.setItem('username', username);
      localStorage.setItem('token', token);
    },
    clearUser() {
      this.userId = '';
      this.username = '';
      this.token = '';
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      localStorage.removeItem('token');
    },
    initFromStorage() {
      this.userId = localStorage.getItem('userId') || '';
      this.username = localStorage.getItem('username') || '';
      this.token = localStorage.getItem('token') || '';
    }
  }
}); 
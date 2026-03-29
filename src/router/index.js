import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from '../pages/HomePage.vue'
import LoginPage from '../pages/LoginPage.vue'
import RegisterPage from '../pages/RegisterPage.vue'
import UserProfilePage from '../pages/UserProfilePage.vue'
import UserProfileEditPage from '../pages/UserProfileEditPage.vue'
import AdDetailsPage from '../pages/AdDetailsPage.vue'
import AdCreatePage from '../pages/AdCreatePage.vue'
import AdEditPage from '../pages/AdEditPage.vue'
import FavoritesPage from '../pages/FavoritesPage.vue'
import ChatPage from '../pages/ChatPage.vue'
import AdminDashboardPage from '../pages/AdminDashboardPage.vue'

const routes = [
  { path: '/', component: HomePage },
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegisterPage },
  { path: '/profile/:id', component: UserProfilePage },
  { path: '/profile/:id/edit', component: UserProfileEditPage },
  { path: '/ads/create', component: AdCreatePage },
  { path: '/ads/:id/edit', component: AdEditPage },
  { path: '/ads/:id', component: AdDetailsPage },
  { path: '/category/:id', component: HomePage },
  { path: '/favorites', component: FavoritesPage },
  { path: '/chat', component: ChatPage },
  { path: '/chat/:conversationId', component: ChatPage },
  { path: '/chat/ad/:adId', component: ChatPage },
  { path: '/admin', component: AdminDashboardPage },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

export default router

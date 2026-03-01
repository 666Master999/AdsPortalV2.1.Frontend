import { createRouter, createWebHistory } from 'vue-router'

import HomePage from '../pages/HomePage.vue'
import LoginPage from '../pages/LoginPage.vue'
import RegisterPage from '../pages/RegisterPage.vue'
import UserProfilePage from '../pages/UserProfilePage.vue'
import AdListPage from '../pages/AdListPage.vue'
import AdDetailsPage from '../pages/AdDetailsPage.vue'
import AdCreatePage from '../pages/AdCreatePage.vue'
import FavoritesPage from '../pages/FavoritesPage.vue'
import ChatPage from '../pages/ChatPage.vue'
import AdminDashboardPage from '../pages/AdminDashboardPage.vue'

const routes = [
  { path: '/', component: HomePage },
  { path: '/login', component: LoginPage },
  { path: '/register', component: RegisterPage },
  { path: '/profile', component: UserProfilePage },
  { path: '/ads', component: AdListPage },
  { path: '/ads/create', component: AdCreatePage },
  { path: '/ads/:id', component: AdDetailsPage },
  { path: '/favorites', component: FavoritesPage },
  { path: '/chat/:adId', component: ChatPage },
  { path: '/admin', component: AdminDashboardPage },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

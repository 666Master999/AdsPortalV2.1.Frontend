import { createRouter, createWebHashHistory } from 'vue-router'

import HomePage from '../pages/HomePage.vue'
import LoginPage from '../pages/LoginPage.vue'
import RegisterPage from '../pages/RegisterPage.vue'
import BlockedPage from '../pages/BlockedPage.vue'
import UserProfilePage from '../pages/UserProfilePage.vue'
import UserProfileEditPage from '../pages/UserProfileEditPage.vue'
import AdDetailsPage from '../pages/AdDetailsPage.vue'
import AdCreatePage from '../pages/AdCreatePage.vue'
import AdEditPage from '../pages/AdEditPage.vue'
import FavoritesPage from '../pages/FavoritesPage.vue'
import ChatPage from '../pages/ChatPage.vue'
import AdminDashboardPage from '../pages/AdminDashboardPage.vue'
import { useUserStore } from '../stores/userStore'
import { createRouteAccessGuard } from '../guards/routeAccessGuard'

const routes = [
  { path: '/', component: HomePage, meta: { public: true } },
  { path: '/login', component: LoginPage, meta: { public: true } },
  { path: '/register', component: RegisterPage, meta: { public: true } },
  { path: '/blocked', component: BlockedPage, meta: { public: true } },
  { path: '/users/:id', component: UserProfilePage, meta: { public: true } },
  { path: '/profile/:id', component: UserProfilePage, meta: { public: true } },
  { path: '/profile', component: UserProfilePage, meta: { requiresAuth: true } },
  { path: '/profile/ads', component: UserProfilePage, meta: { requiresAuth: true } },
  { path: '/profile/:id/edit', component: UserProfileEditPage, meta: { requiresAuth: true } },
  { path: '/users/:id/edit', component: UserProfileEditPage, meta: { requiresAuth: true } },
  {
    path: '/ads/create',
    component: AdCreatePage,
    meta: { requiresAuth: true, requiresNoRestrictions: ['PostBan'] },
  },
  {
    path: '/create-ad',
    component: AdCreatePage,
    meta: { requiresAuth: true, requiresNoRestrictions: ['PostBan'] },
  },
  {
    path: '/ads/:id/edit',
    component: AdEditPage,
    meta: { requiresAuth: true, requiresNoRestrictions: ['PostBan'] },
  },
  { path: '/ads/:id', component: AdDetailsPage, meta: { public: true } },
  { path: '/category/:id', component: HomePage, meta: { public: true } },
  { path: '/favorites', component: FavoritesPage, meta: { requiresAuth: true } },
  { path: '/chat', component: ChatPage, meta: { requiresAuth: true } },
  { path: '/chat/:conversationId', component: ChatPage, meta: { requiresAuth: true } },
  { path: '/chat/ad/:adId', component: ChatPage, meta: { requiresAuth: true } },
  {
    path: '/admin',
    component: AdminDashboardPage,
    meta: {
      requiresAuth: true,
      requireAnyRole: ['Moderator', 'Admin', 'SuperAdmin'],
    },
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(createRouteAccessGuard({
  getUserStore: () => useUserStore(),
}))

export default router

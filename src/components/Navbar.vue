<script setup>
import { onMounted } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useRouter } from 'vue-router'

const userStore = useUserStore()
const router = useRouter()

onMounted(() => {
  userStore.refreshUser()
})

function handleLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-light bg-white shadow-sm mb-4">
    <div class="container">
      <router-link class="navbar-brand fw-bold" to="/">AdsPortal V2</router-link>
      <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link" to="/ads/create">Создать</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link" to="/favorites">Избранное</router-link>
          </li>
          <li class="nav-item dropdown" v-if="userStore.isAdmin">
            <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Админ
            </a>
            <ul class="dropdown-menu">
              <li>
                <router-link class="dropdown-item" to="/admin?tab=ads">Объявления</router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/admin?tab=users">Пользователи</router-link>
              </li>
              <li>
                <router-link class="dropdown-item" to="/admin?tab=complaints">Жалобы</router-link>
              </li>
            </ul>
          </li>
        </ul>
        <div class="d-flex align-items-center">
          <template v-if="userStore.token">
            <router-link class="nav-link me-2" :to="`/profile/${userStore.user.userId}`">
              {{ userStore.user.userName || userStore.user.userLogin }}
            </router-link>
            <button class="btn btn-danger btn-sm" @click="handleLogout">Выйти</button>
          </template>
          <template v-else>
            <router-link class="btn btn-outline-primary me-2" to="/login">Войти</router-link>
            <router-link class="btn btn-primary" to="/register">Регистрация</router-link>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

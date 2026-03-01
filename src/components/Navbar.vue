<script setup>
import { useUserStore } from '../stores/userStore'
import { useRouter } from 'vue-router'

const userStore = useUserStore()
const router = useRouter()

function handleLogout() {
  userStore.logout()
  router.push('/login')
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark mb-4">
    <div class="container">
      <router-link class="navbar-brand" to="/">AdsPortal</router-link>
      <button class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#navbarNav">
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav me-auto">
          <li class="nav-item">
            <router-link class="nav-link" to="/">Главная</router-link>
          </li>
          <li class="nav-item">
            <router-link class="nav-link" to="/ads">Объявления</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link" to="/ads/create">Создать</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link" to="/favorites">Избранное</router-link>
          </li>
          <li class="nav-item" v-if="userStore.user?.role === 'admin'">
            <router-link class="nav-link" to="/admin">Админ</router-link>
          </li>
        </ul>
        <ul class="navbar-nav">
          <template v-if="userStore.token">
            <li class="nav-item">
              <router-link class="nav-link" to="/profile">Профиль</router-link>
            </li>
            <li class="nav-item">
              <button class="btn btn-outline-light btn-sm ms-2" @click="handleLogout">Выйти</button>
            </li>
          </template>
          <template v-else>
            <li class="nav-item">
              <router-link class="nav-link" to="/login">Войти</router-link>
            </li>
            <li class="nav-item">
              <router-link class="nav-link" to="/register">Регистрация</router-link>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </nav>
</template>

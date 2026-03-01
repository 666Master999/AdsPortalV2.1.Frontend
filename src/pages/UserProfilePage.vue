<script setup>
import { onMounted } from 'vue'
import { useUserStore } from '../stores/userStore'

const userStore = useUserStore()

onMounted(() => {
  userStore.loadProfile()
})
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Профиль</h1>
    <div v-if="userStore.user" class="card p-4">
      <p><strong>ID:</strong> {{ userStore.user.userId }}</p>
      <p><strong>Логин:</strong> {{ userStore.user.userLogin }}</p>
      <p><strong>Имя:</strong> {{ userStore.user.userName || 'Не указано' }}</p>
    </div>
    <p v-else class="text-muted">Загрузка...</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const reason = computed(() => String(route.query.reason || '').trim().toLowerCase())

const title = computed(() => {
  if (reason.value === 'login-ban') return 'Аккаунт заблокирован'
  if (reason.value === 'post-ban') return 'Доступ к публикациям ограничен'
  if (reason.value === 'chat-ban') return 'Отправка сообщений ограничена'
  return 'Доступ ограничен'
})

const description = computed(() => {
  if (reason.value === 'login-ban') {
    return 'Ваш вход временно ограничен. Обратитесь в поддержку для уточнения причин блокировки.'
  }

  if (reason.value === 'post-ban') {
    return 'Для вашего аккаунта действует ограничение PostBan. Создание и редактирование объявлений недоступно.'
  }

  if (reason.value === 'chat-ban') {
    return 'Для вашего аккаунта действует ограничение ChatBan. Отправка сообщений недоступна.'
  }

  return 'Для вашего аккаунта действует ограничение. Обратитесь в поддержку для уточнения деталей.'
})

function goToLogin() {
  userStore.clearAuth()
  router.push('/login')
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 920px; min-height: calc(100vh - 90px);">
      <div class="d-flex align-items-center justify-content-center h-100 p-4 p-lg-5">
        <div class="card border-0 shadow-sm rounded-4 w-100" style="max-width: 620px;">
          <div class="card-body p-4 p-lg-5 text-center">
            <div class="small text-uppercase text-danger fw-semibold mb-2">Access</div>
            <h1 class="h3 fw-semibold mb-3">{{ title }}</h1>
            <p class="text-secondary mb-4">{{ description }}</p>

            <div class="d-flex flex-column flex-sm-row justify-content-center gap-2">
              <button type="button" class="btn btn-primary rounded-pill px-4" @click="goToLogin">Войти другим аккаунтом</button>
              <button type="button" class="btn btn-outline-secondary rounded-pill px-4" @click="goHome">На главную</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

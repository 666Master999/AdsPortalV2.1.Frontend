<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import Navbar from './components/Navbar.vue'
import { useChatStore } from './stores/chatStore'
import { useNotificationsStore } from './stores/notificationsStore'
import { usePresenceStore } from './stores/presenceStore'
import { useUserStore } from './stores/userStore'
import { subscribeNotifications } from './services/notificationService'
import { useAccessService } from './services/accessService'

const chatStore = useChatStore()
const notificationsStore = useNotificationsStore()
const presenceStore = usePresenceStore()
const userStore = useUserStore()
const access = useAccessService()
const router = useRouter()
const uiNotifications = ref([])
const nowTickMs = ref(Date.now())
let unsubscribeUiNotifications = null
let rateLimitTimer = null

const rateLimitNotice = computed(() => userStore.rateLimitState)
const rateLimitRemainingSeconds = computed(() => {
  const retryAfter = Number(rateLimitNotice.value?.retryAfterSeconds)
  const startedAt = Date.parse(String(rateLimitNotice.value?.at || ''))

  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return 0
  if (Number.isNaN(startedAt)) return Math.ceil(retryAfter)

  const elapsedSeconds = (nowTickMs.value - startedAt) / 1000
  const remaining = Math.ceil(retryAfter - elapsedSeconds)
  return remaining > 0 ? remaining : 0
})

const rateLimitText = computed(() => {
  const message = String(rateLimitNotice.value?.message || 'Слишком много запросов. Повторите позже.').trim()
  const retryAfter = Number(rateLimitRemainingSeconds.value)

  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return `${message} Повторите через ${retryAfter} сек.`
  }

  return message
})

function dismissRateLimitNotice() {
  userStore.clearRateLimitState()
}

function dismissUiNotification(id) {
  uiNotifications.value = uiNotifications.value.filter(item => item.id !== id)
}

function pushUiNotification(toast) {
  if (!toast?.id) return

  uiNotifications.value = [toast, ...uiNotifications.value].slice(0, 4)
  if (toast.durationMs && toast.durationMs > 0) {
    setTimeout(() => dismissUiNotification(toast.id), toast.durationMs)
  }
}

onMounted(() => {
  unsubscribeUiNotifications = subscribeNotifications(pushUiNotification)

  rateLimitTimer = setInterval(() => {
    nowTickMs.value = Date.now()
  }, 1000)
})

watch(
  () => userStore.token,
  async (token) => {
    if (token) {
      try {
        await userStore.hydrateAccessContext()
      } catch {
        // Hydration is best-effort for shell init.
      }

      if (access.isAccountBlocked()) {
        userStore.clearAuth()
        router.push('/blocked?reason=login-ban')
        return
      }

      presenceStore.connect().catch(() => {})
      notificationsStore.connect().catch(() => {})
      chatStore.getConversations().catch(() => {})
      return
    }

    notificationsStore.disconnect()
    presenceStore.disconnect()
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  unsubscribeUiNotifications?.()
  if (rateLimitTimer) {
    clearInterval(rateLimitTimer)
    rateLimitTimer = null
  }
  notificationsStore.disconnect()
  presenceStore.disconnect()
})
</script>

<template>
  <div class="d-flex flex-column" style="height: 100dvh;">
    <Navbar class="flex-shrink-0" />
    <div v-if="uiNotifications.length" class="px-3 px-lg-4 pt-3">
      <div class="d-grid gap-2">
        <div
          v-for="item in uiNotifications"
          :key="item.id"
          class="alert mb-0 d-flex align-items-start justify-content-between gap-3"
          :class="item.type === 'warning' ? 'alert-warning' : (item.type === 'success' ? 'alert-success' : (item.type === 'info' ? 'alert-info' : 'alert-danger'))"
        >
          <span>{{ item.message }}</span>
          <button type="button" class="btn-close" aria-label="Закрыть" @click="dismissUiNotification(item.id)"></button>
        </div>
      </div>
    </div>
    <div v-if="rateLimitNotice" class="px-3 px-lg-4 pt-3">
      <div class="alert alert-warning d-flex align-items-center justify-content-between gap-3 mb-0">
        <span>{{ rateLimitText }}</span>
        <button type="button" class="btn-close" aria-label="Закрыть" @click="dismissRateLimitNotice"></button>
      </div>
    </div>
    <div class="flex-grow-1" style="min-height: 0;">
      <router-view />
    </div>
  </div>
</template>

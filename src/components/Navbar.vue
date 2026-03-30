<script setup>
import { computed, onMounted, onUnmounted, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { useChatStore } from '../stores/chatStore'
import { useNotificationsStore } from '../stores/notificationsStore'

const userStore = useUserStore()
const chatStore = useChatStore()
const notificationsStore = useNotificationsStore()
const router = useRouter()

const openGroup = ref(null)
const notificationsToggle = ref(null)
const unreadMessagesCount = computed(() => chatStore.conversations.reduce((sum, conv) => sum + (Number(conv.unreadCount) || 0), 0))

function toggleGroup(adId) {
  const key = String(adId ?? 'other')
  openGroup.value = openGroup.value === key ? null : key
}

function resetOpenGroup() {
  openGroup.value = null
}

function closeDropdown() {
  const toggleEl = notificationsToggle.value
  const dropdownApi = window.bootstrap?.Dropdown?.getOrCreateInstance?.(toggleEl)
  dropdownApi?.hide()
}

function markNotificationAsRead(id) {
  notificationsStore.markRead([id])
}

function openNotification(notification) {
  notificationsStore.markRead([notification.id])
  closeDropdown()

  if (notification.adId) {
    router.push(`/ads/${notification.adId}`)
  }
}

function groupKey(adId) {
  return String(adId ?? 'other')
}

function getNotificationLabel(notification) {
  if (notification.type === 'newMessage') return 'Новое сообщение'
  return `Объявление #${notification.adId}`
}

function handleLogout() {
  userStore.logout()
  router.push('/login')
}

async function syncChatConversations() {
  if (!userStore.token) return
  await chatStore.getConversations().catch(() => {})
}

watch(
  () => userStore.token,
  (token) => {
    if (token) notificationsStore.connect()
    else notificationsStore.disconnect()
    if (token) syncChatConversations()
  }
)

onMounted(() => {
  if (userStore.token) notificationsStore.connect()
  syncChatConversations()
})

onUnmounted(() => {
  notificationsStore.disconnect()
})

const typeLabels = {
  0: 'Одобрено',
  1: 'Отклонено',
  AdApproved: 'Одобрено',
  AdRejected: 'Отклонено',
}
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom shadow-sm sticky-top py-3">
    <div class="container">
      <router-link class="navbar-brand d-flex align-items-center gap-2 fw-semibold" to="/">
        <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold shadow-sm" style="width:2.5rem;height:2.5rem;">A</span>
        <span>
          <span class="d-block lh-1">AdsPortal V2</span>
          <small class="text-secondary fw-normal">Clean realtime marketplace</small>
        </span>
      </router-link>

      <button
        class="navbar-toggler border-0 shadow-none"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarNav"
        aria-controls="navbarNav"
        aria-expanded="false"
        aria-label="Переключить навигацию"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbarNav">
        <ul class="navbar-nav mx-lg-auto gap-lg-2 align-items-lg-center">
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link px-3 rounded-pill" to="/ads/create">Создать</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link px-3 rounded-pill" to="/favorites">Избранное</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link px-3 rounded-pill position-relative d-inline-flex align-items-center" to="/chat">
              <span>Чаты</span>
              <span
                v-if="unreadMessagesCount"
                class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                style="font-size:0.65rem;min-width:1.2rem;padding:0.22rem 0.35rem;"
              >
                {{ unreadMessagesCount > 99 ? '99+' : unreadMessagesCount }}
              </span>
            </router-link>
          </li>
          <li class="nav-item dropdown" v-if="userStore.isAdmin">
            <a class="nav-link px-3 rounded-pill dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Админ
            </a>
            <ul class="dropdown-menu border-0 shadow rounded-4 p-2 mt-2">
              <li><router-link class="dropdown-item rounded-3 py-2" to="/admin?tab=ads">Объявления</router-link></li>
              <li><router-link class="dropdown-item rounded-3 py-2" to="/admin?tab=users">Пользователи</router-link></li>
              <li><router-link class="dropdown-item rounded-3 py-2" to="/admin?tab=complaints">Жалобы</router-link></li>
            </ul>
          </li>
        </ul>

        <div class="d-flex align-items-center gap-2 ms-lg-auto mt-3 mt-lg-0">
          <template v-if="userStore.token">
            <div class="dropdown" data-bs-auto-close="outside" @hidden.bs.dropdown="resetOpenGroup">
              <button
                ref="notificationsToggle"
                class="btn btn-light rounded-circle shadow-sm position-relative d-inline-flex align-items-center justify-content-center"
                style="width:2.75rem;height:2.75rem;"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                title="Уведомления"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7a5.002 5.002 0 0 0-4.005-4.901z"/>
                </svg>
                <span
                  v-if="notificationsStore.unreadCount"
                  class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                  style="font-size:0.65rem;min-width:1.2rem;padding:0.22rem 0.35rem;"
                >
                  {{ notificationsStore.unreadCount > 99 ? '99+' : notificationsStore.unreadCount }}
                </span>
              </button>

              <div class="dropdown-menu dropdown-menu-end border-0 shadow-lg rounded-4 p-0 overflow-hidden bg-body" style="width:min(28rem, calc(100vw - 2rem)); max-height:32rem;">
                <div class="bg-body-tertiary border-bottom px-3 py-3 d-flex align-items-center justify-content-between">
                  <div>
                    <div class="fw-semibold text-dark">Уведомления</div>
                  </div>
                  <button
                    v-if="notificationsStore.unreadCount"
                    class="btn btn-sm btn-outline-primary rounded-pill px-3"
                    @click.stop="notificationsStore.markRead([])"
                  >
                    Прочитать все
                  </button>
                </div>

                <div v-if="!notificationsStore.notifications.length" class="text-secondary small text-center py-4 px-3">
                  Нет уведомлений
                </div>

                <div v-else class="accordion accordion-flush" style="max-height:26rem; overflow-y:auto;">
                  <div
                    v-for="group in notificationsStore.groupedNotifications"
                    :key="groupKey(group.adId)"
                    class="accordion-item border-0 border-bottom"
                  >
                    <h2 class="accordion-header">
                      <button
                        class="accordion-button px-3 py-3 d-flex align-items-center justify-content-between shadow-none bg-transparent"
                        :class="openGroup === groupKey(group.adId) ? '' : 'collapsed bg-transparent'"
                        type="button"
                        @click.stop="toggleGroup(group.adId)"
                      >
                        <span class="me-3 text-start">
                          <span class="d-block fw-semibold text-body">Объявление #{{ group.adId ?? '—' }}</span>
                        </span>
                        <span class="d-flex align-items-center gap-2">
                          <span v-if="group.unreadCount" class="badge rounded-pill bg-danger">{{ group.unreadCount }}</span>
                        </span>
                      </button>
                    </h2>

                    <div v-show="openGroup === groupKey(group.adId)" class="accordion-collapse">
                      <div class="accordion-body p-2 bg-transparent">
                        <div class="list-group list-group-flush">
                          <div
                            v-for="n in group.items"
                            :key="n.id"
                            class="list-group-item border rounded-4 mb-2 px-3 py-3 d-flex align-items-start justify-content-between gap-3"
                            :class="n.isRead ? 'bg-white border-secondary-subtle' : 'bg-primary-subtle border-primary-subtle fw-semibold'"
                            role="button"
                            @click="openNotification(n)"
                          >
                            <div class="min-w-0 text-start flex-grow-1">
                              <div class="d-flex align-items-center gap-2 flex-wrap">
                                <span class="badge" :class="(n.type === 0 || n.type === 'AdApproved') ? 'bg-success' : 'bg-danger'">
                                  {{ typeLabels[n.type] || n.type }}
                                </span>
                                <span class="text-body small text-truncate">{{ getNotificationLabel(n) }}</span>
                              </div>
                            </div>

                            <div class="d-flex align-items-center gap-2" @click.stop>
                              <button class="btn btn-sm btn-outline-secondary rounded-pill" @click="markNotificationAsRead(n.id)">Прочитано</button>
                              <span
                                class="rounded-circle flex-shrink-0 mt-1"
                                style="width:0.55rem;height:0.55rem;"
                                :class="n.isRead ? 'bg-secondary-subtle' : 'bg-primary shadow-sm'"
                              ></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <router-link class="nav-link px-3 rounded-pill" :to="`/profile/${userStore.user.userId}`">
              {{ userStore.user.userName || userStore.user.userLogin }}
            </router-link>

            <button class="btn btn-danger rounded-pill px-3" @click="handleLogout">Выйти</button>
          </template>

          <template v-else>
            <router-link class="btn btn-outline-primary rounded-pill px-3" to="/login">Войти</router-link>
            <router-link class="btn btn-primary rounded-pill px-3" to="/register">Регистрация</router-link>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

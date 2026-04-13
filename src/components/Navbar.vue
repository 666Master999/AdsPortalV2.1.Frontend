<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { useChatStore } from '../stores/chatStore'
import { useNotificationsStore } from '../stores/notificationsStore'
import { useAccessService } from '../services/accessService'
import NotificationItem from './notifications/NotificationItem.vue'
import { useGroupedNotifications } from '../composables/useGroupedNotifications'

const userStore = useUserStore()
const chatStore = useChatStore()
const notificationsStore = useNotificationsStore()
const router = useRouter()
const access = useAccessService()

const notificationsToggle = ref(null)
const chatUnreadCount = computed(() => chatStore.unreadCount)
const notificationsCount = computed(() => notificationsStore.unreadCount)
const canCreateAd = computed(() => access.canCreateAd())
const canAccessAdmin = computed(() => access.canAccessAdmin())
const canOpenDashboard = computed(() => access.canAccessAdmin() || access.canModerate())

const uiStyles = {
  brandMark: { width: '2.5rem', height: '2.5rem' },
  notificationToggle: { width: '2.75rem', height: '2.75rem' },
  dropdownMenu: { width: 'min(28rem, calc(100vw - 2rem))', maxHeight: '32rem' },
  notificationsList: { maxHeight: '26rem' },
}

const groupedEntries = useGroupedNotifications(() => notificationsStore.notifications)
const openedGroup = ref(null)

function toggleGroup(id) {
  openedGroup.value = openedGroup.value === id ? null : id
}

function closeDropdown() {
  const toggleEl = notificationsToggle.value
  const dropdownApi = window.bootstrap?.Dropdown?.getOrCreateInstance?.(toggleEl)
  dropdownApi?.hide()
}

function openNotification(entry) {
  const ids = Array.isArray(entry?.notificationIds)
    ? entry.notificationIds
    : (Number.isFinite(Number(entry?.id)) ? [Number(entry.id)] : [])
  notificationsStore.markRead(ids)
  closeDropdown()

  const adId = entry?.adId ?? null
  if (adId == null) return

  router.push(`/ads/${adId}`)
}

function editNotification(entry) {
  const ids = Array.isArray(entry?.notificationIds)
    ? entry.notificationIds
    : (Number.isFinite(Number(entry?.id)) ? [Number(entry.id)] : [])
  notificationsStore.markRead(ids)
  closeDropdown()

  const adId = entry?.adId ?? null
  if (adId == null) return

  router.push(`/ads/${adId}/edit`)
}

async function handleLogout() {
  try {
    await userStore.logout()
  } catch {
    // logout still clears auth locally in store
  }
  router.push('/login')
}

</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-light bg-white border-bottom shadow-sm sticky-top py-3">
    <div class="container">
      <router-link class="navbar-brand d-flex align-items-center gap-2 fw-semibold" to="/">
        <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold shadow-sm" :style="uiStyles.brandMark">A</span>
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
          <li class="nav-item" v-if="userStore.token && canCreateAd">
            <router-link class="nav-link px-3 rounded-pill" to="/ads/create">Создать</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link px-3 rounded-pill" to="/favorites">Избранное</router-link>
          </li>
          <li class="nav-item" v-if="userStore.token">
            <router-link class="nav-link px-3 rounded-pill position-relative d-inline-flex align-items-center" to="/chat">
              <span>Чаты</span>
              <span
                v-if="chatUnreadCount"
                class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                style="font-size:0.65rem;min-width:1.2rem;padding:0.22rem 0.35rem;"
              >
                {{ chatUnreadCount > 99 ? '99+' : chatUnreadCount }}
              </span>
            </router-link>
          </li>
          <li class="nav-item dropdown" v-if="canOpenDashboard">
            <a class="nav-link px-3 rounded-pill dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Панель
            </a>
            <ul class="dropdown-menu border-0 shadow rounded-4 p-2 mt-2">
              <li><router-link class="dropdown-item rounded-3 py-2" to="/admin?tab=ads">Объявления</router-link></li>
              <li v-if="canAccessAdmin"><router-link class="dropdown-item rounded-3 py-2" to="/admin?tab=users">Пользователи</router-link></li>
              <li v-if="canAccessAdmin"><router-link class="dropdown-item rounded-3 py-2" to="/admin?tab=logs">Логи</router-link></li>
            </ul>
          </li>
        </ul>

        <div class="d-flex align-items-center gap-2 ms-lg-auto mt-3 mt-lg-0">
          <template v-if="userStore.token">
            <div class="dropdown" data-bs-auto-close="outside">
              <button
                ref="notificationsToggle"
                class="btn btn-light rounded-circle shadow-sm position-relative d-inline-flex align-items-center justify-content-center"
                :style="uiStyles.notificationToggle"
                type="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
                title="Уведомления"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7a5.002 5.002 0 0 0-4.005-4.901z"/>
                </svg>
                <span
                  v-if="notificationsCount"
                  class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                  style="font-size:0.65rem;min-width:1.2rem;padding:0.22rem 0.35rem;"
                >
                  {{ notificationsCount > 99 ? '99+' : notificationsCount }}
                </span>
              </button>

              <div class="dropdown-menu dropdown-menu-end border-0 shadow-lg rounded-4 p-0 overflow-hidden bg-body" :style="uiStyles.dropdownMenu">
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

                <div v-if="!(notificationsStore.notifications?.length)" class="text-secondary small text-center py-4 px-3">
                  Нет уведомлений
                </div>

                <div v-else class="overflow-y-auto p-2 d-grid gap-2" :style="uiStyles.notificationsList">
                  <div v-for="entry in groupedEntries" :key="entry.key">
                    <div v-if="entry.type === 'group'" class="accordion accordion-flush mb-2">
                      <div class="accordion-item border-0">
                        <h2 class="accordion-header">
                          <button
                            class="accordion-button p-0 bg-transparent shadow-none d-flex align-items-center gap-2 w-100"
                            :class="openedGroup === entry.key ? '' : 'collapsed'"
                            type="button"
                            @click.stop="toggleGroup(entry.key)"
                            :aria-expanded="openedGroup === entry.key"
                          >
                            <NotificationItem class="flex-grow-1" :entry="entry.items[0]" :compact="true" />
                            <span class="badge bg-secondary ms-2">{{ entry.items.length }}</span>
                          </button>
                        </h2>

                        <div v-show="openedGroup === entry.key" class="p-2 ps-2 position-relative overflow-hidden" style="min-height:0;">
                          <div class="d-grid gap-2">
                            <NotificationItem
                              v-for="item in entry.items"
                              :key="item.id"
                              :entry="item"
                              @open="() => openNotification(item)"
                              @edit="() => editNotification(item)"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div v-else>
                      <NotificationItem
                        :entry="entry.item"
                        @open="() => openNotification(entry.item)"
                        @edit="() => editNotification(entry.item)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <router-link class="nav-link px-3 rounded-pill" :to="`/users/${userStore.user.userId}`">
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

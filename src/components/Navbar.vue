<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { useChatStore } from '../stores/chatStore'
import { useNotificationsStore } from '../stores/notificationsStore'
import { useAccessService } from '../services/accessService'
import NotificationItem from './notifications/NotificationItem.vue'
import { notificationRenderers } from '../services/notificationRenderers'
import { useGroupedNotifications } from '../composables/useGroupedNotifications'

const userStore = useUserStore()
const chatStore = useChatStore()
const notificationsStore = useNotificationsStore()
const router = useRouter()
const route = useRoute()
const access = useAccessService()

const isNavExpanded = ref(false)
const openMenu = ref(null)
const chatUnreadCount = computed(() => chatStore.unreadCount)
const notificationsCount = computed(() => notificationsStore.unreadCount)
const canCreateAd = computed(() => access.canCreateAd())
const canAccessAdmin = computed(() => access.canAccessAdmin())
const canOpenDashboard = computed(() => access.canAccessAdmin() || access.canModerate())
const currentUserId = computed(() => userStore.tokenUserId ?? userStore.user?.id ?? userStore.user?.userId ?? null)
const hasOpenSurface = computed(() => isNavExpanded.value || openMenu.value !== null)

const uiStyles = {
  brandMark: { width: '2.5rem', height: '2.5rem' },
  notificationToggle: { width: '3rem', height: '3rem' },
  desktopDropdown: { width: 'min(18rem, calc(100vw - 2rem))' },
  notificationsDropdown: { width: 'min(28rem, calc(100vw - 2rem))', maxHeight: '32rem' },
  notificationsList: { maxHeight: '26rem' },
  mobileMenu: { maxHeight: 'calc(100vh - 8rem)' },
}

const groupedEntries = useGroupedNotifications(() => notificationsStore.notifications)
const openedGroup = ref(null)

function toggleGroup(id) {
  openedGroup.value = openedGroup.value === id ? null : id
}

function groupBubbleClass(entry) {
  const first = Array.isArray(entry?.items) && entry.items.length ? entry.items[0] : null
  const renderer = notificationRenderers[first?.type] || notificationRenderers.__default
  const base = renderer(first || {})
  const variant = base.variant || 'default'
  const hasUnread = Array.isArray(entry?.items) ? entry.items.some(i => !i.isRead) : false

  const background = hasUnread
    ? variant === 'success' ? 'bg-success-subtle' : variant === 'danger' ? 'bg-danger-subtle' : 'bg-primary-subtle'
    : 'bg-body'

  const border = variant === 'success' ? 'border-success-subtle' : variant === 'danger' ? 'border-danger-subtle' : 'border-primary-subtle'

  return `${background} ${border}`
}

function closeShell() {
  openMenu.value = null
  isNavExpanded.value = false
  openedGroup.value = null
}

function toggleMenu(name) {
  if (openMenu.value === name) {
    openMenu.value = null
    openedGroup.value = null
    return
  }

  openMenu.value = name
  openedGroup.value = null
  isNavExpanded.value = false
}

function toggleMobileMenu() {
  if (isNavExpanded.value) {
    isNavExpanded.value = false
    return
  }

  openMenu.value = null
  openedGroup.value = null
  isNavExpanded.value = true
}

watch(() => route.fullPath, () => {
  closeShell()
})

watch(() => userStore.token, token => {
  if (!token) closeShell()
})

function openNotification(entry) {
  const ids = Array.isArray(entry?.notificationIds)
    ? entry.notificationIds
    : (Number.isFinite(Number(entry?.id)) ? [Number(entry.id)] : [])
  notificationsStore.markRead(ids)
  closeShell()

  const adId = entry?.adId ?? null
  if (adId == null) return

  router.push(`/ads/${adId}`)
}

function editNotification(entry) {
  const ids = Array.isArray(entry?.notificationIds)
    ? entry.notificationIds
    : (Number.isFinite(Number(entry?.id)) ? [Number(entry.id)] : [])
  notificationsStore.markRead(ids)
  closeShell()

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
  <nav class="navbar navbar-light bg-white border-bottom shadow-sm sticky-top py-3">
    <div class="container position-relative d-flex align-items-center gap-3 flex-wrap">
      <router-link class="navbar-brand d-flex align-items-center gap-2 fw-semibold text-decoration-none" to="/" @click="closeShell">
        <span class="d-inline-flex align-items-center justify-content-center rounded-circle bg-primary text-white fw-bold shadow-sm" :style="uiStyles.brandMark">A</span>
        <span>
          <span class="d-block lh-1">AdsPortal V2</span>
          <small class="text-secondary fw-normal">Clean realtime marketplace</small>
        </span>
      </router-link>

      <div v-if="userStore.token" class="d-none d-lg-flex flex-grow-1 align-items-center gap-2" style="min-width: 0;">
        <ul class="navbar-nav flex-row align-items-center gap-2 mx-auto mb-0">
          <li class="nav-item" v-if="canCreateAd">
            <router-link class="nav-link px-3 rounded-pill" to="/ads/create" @click="closeShell">Создать</router-link>
          </li>
          <li class="nav-item">
            <router-link class="nav-link px-3 rounded-pill" to="/favorites" @click="closeShell">Избранное</router-link>
          </li>
          <li class="nav-item">
            <router-link class="nav-link px-3 rounded-pill position-relative d-inline-flex align-items-center" to="/chat" @click="closeShell">
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
          <li class="nav-item position-relative" v-if="canOpenDashboard">
            <button
              class="btn btn-light border rounded-pill px-3 d-inline-flex align-items-center gap-2"
              type="button"
              :aria-expanded="openMenu === 'panel'"
              aria-haspopup="menu"
              @click="toggleMenu('panel')"
            >
              <span>Панель</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>

            <div v-if="openMenu === 'panel'" class="position-absolute end-0 top-100 mt-2 rounded-4 border shadow-lg bg-body p-2" :style="uiStyles.desktopDropdown" role="menu">
              <div class="small text-uppercase text-secondary fw-semibold px-2 pb-2">Панель</div>
              <div class="d-grid gap-1">
                <router-link class="btn btn-light text-start rounded-3 px-3 py-2" to="/admin?tab=ads" @click="closeShell">Объявления</router-link>
                <router-link v-if="canAccessAdmin" class="btn btn-light text-start rounded-3 px-3 py-2" to="/admin?tab=users" @click="closeShell">Пользователи</router-link>
                <router-link v-if="canAccessAdmin" class="btn btn-light text-start rounded-3 px-3 py-2" to="/admin?tab=logs" @click="closeShell">Логи</router-link>
                <router-link v-if="canAccessAdmin" class="btn btn-light text-start rounded-3 px-3 py-2" to="/admin/categories" @click="closeShell">Категории</router-link>
              </div>
            </div>
          </li>
        </ul>
      </div>

      <div v-if="userStore.token" class="d-flex align-items-center gap-2 ms-auto">
        <div class="position-relative">
          <button
            class="btn btn-light rounded-circle shadow-sm position-relative d-inline-flex align-items-center justify-content-center"
            :style="uiStyles.notificationToggle"
            type="button"
            :aria-expanded="openMenu === 'notifications'"
            aria-haspopup="menu"
            title="Уведомления"
            @click="toggleMenu('notifications')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 16a2 2 0 0 0 2-2H6a2 2 0 0 0 2 2zm.995-14.901a1 1 0 1 0-1.99 0A5.002 5.002 0 0 0 3 6c0 1.098-.5 6-2 7h14c-1.5-1-2-5.902-2-7a5.002 5.002 0 0 0-4.005-4.901z"/>
            </svg>
            <span
              v-if="notificationsCount"
              class="position-absolute rounded-circle d-flex align-items-center justify-content-center"
              :style="{
                width: '22px',
                height: '22px',
                fontSize: '11px',
                fontWeight: '700',
                color: '#020e1f',
                background: 'rgb(255, 185, 185)',
                transform: 'translate(93%, -93%)',
                boxShadow: '0 4px 16px rgba(120, 0, 0, 0.45)',
                textShadow: '0 0 8px rgba(160, 0, 0, 0.9)'
              }"
            >
              {{ notificationsCount > 99 ? '99+' : notificationsCount }}
            </span>

          </button>

          <div v-if="openMenu === 'notifications'" class="position-absolute end-0 top-100 mt-2 rounded-4 border shadow-lg bg-body p-0" :style="uiStyles.notificationsDropdown" role="menu">
            <div class="bg-body-tertiary border-bottom px-3 py-3 d-flex align-items-center justify-content-between rounded-top-4">
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

            <div v-else class="overflow-auto p-2 d-grid gap-2" :style="uiStyles.notificationsList">
              <div v-for="entry in groupedEntries" :key="entry.key">
                <div v-if="entry.type === 'group'" class="mb-2">
                  <div
                    class="rounded-4 border"
                    :class="groupBubbleClass(entry)"
                  >
                    <div
                      class="d-flex align-items-center gap-2 p-2 w-100 user-select-none"
                      role="button"
                      tabindex="0"
                      @click.stop="toggleGroup(entry.key)"
                      @keydown.enter.stop.prevent="toggleGroup(entry.key)"
                      :aria-expanded="openedGroup === entry.key"
                    >
                      <div class="flex-grow-1" style="min-width: 0;">
                        <NotificationItem
                          class="w-100"
                          :entry="entry.items[0]"
                          :compact="true"
                          :group-count="entry.items.length"
                          :group-has-unread="entry.items.some(i => !i.isRead)"
                          :inside-group="true"
                        />
                      </div>
                      <div class="flex-shrink-0 ms-2 d-flex align-items-center">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="18"
                          height="18"
                          fill="currentColor"
                          viewBox="0 0 16 16"
                          :style="{ transform: openedGroup === entry.key ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .18s ease', transformOrigin: 'center' }"
                        >
                          <path fill-rule="evenodd" d="M1.646 4.146a.5.5 0 0 1 .708 0L8 9.793l5.646-5.647a.5.5 0 0 1 .708.708L8 10.207 2.354 4.854a.5.5 0 0 1-.708-.708z"/>
                        </svg>
                      </div>
                    </div>

                    <transition
                      enter-active-class="fade"
                      enter-from-class=""
                      enter-to-class="show"
                      leave-active-class="fade"
                      leave-from-class="show"
                      leave-to-class=""
                    >
                      <div v-show="openedGroup === entry.key" class="p-2 ps-2 position-relative" style="min-height:0;">
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
                    </transition>
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

        <div class="d-none d-lg-flex align-items-center gap-2">
          <router-link v-if="userStore.user?.userId" class="nav-link px-3 rounded-pill" :to="`/users/${currentUserId}`" @click="closeShell">
            {{ userStore.user.userName || userStore.user.userLogin }}
          </router-link>

          <button class="btn btn-danger rounded-pill px-3" @click="handleLogout">Выйти</button>
        </div>

        <button
          class="navbar-toggler border-0 shadow-none d-lg-none position-relative"
          type="button"
          aria-controls="navbarMobileMenu"
          :aria-expanded="isNavExpanded"
          aria-label="Переключить навигацию"
          @click="toggleMobileMenu"
        >
          <span
            v-if="chatUnreadCount"
            class="position-absolute badge rounded-pill bg-danger d-inline-flex align-items-center justify-content-center"
            :style="{
              top: '0.15rem',
              right: '-0.15rem',
              minWidth: '1.2rem',
              height: '1.2rem',
              fontSize: '0.65rem',
              lineHeight: '1',
              padding: '0 0.32rem'
            }"
          >
            {{ chatUnreadCount > 99 ? '99+' : chatUnreadCount }}
          </span>
          <span class="navbar-toggler-icon"></span>
        </button>
      </div>

      <template v-else>
        <div class="d-flex align-items-center gap-2 ms-auto flex-wrap justify-content-end">
          <router-link class="btn btn-outline-primary rounded-pill px-3" to="/login">Войти</router-link>
          <router-link class="btn btn-primary rounded-pill px-3" to="/register">Регистрация</router-link>
        </div>
      </template>

      <div v-if="isNavExpanded" id="navbarMobileMenu" class="position-absolute top-100 start-0 w-100 d-lg-none mt-3 px-2">
        <div class="rounded-4 border shadow-lg bg-body">
          <div class="px-3 py-3 border-bottom d-flex align-items-center justify-content-between">
            <div>
              <div class="fw-semibold text-dark">Меню</div>
              <div class="small text-secondary">AdsPortal V2</div>
            </div>
            <button type="button" class="btn-close" aria-label="Закрыть" @click="closeShell"></button>
          </div>

          <div class="p-3 overflow-auto" :style="uiStyles.mobileMenu">
            <div class="d-grid gap-2">
              <router-link v-if="canCreateAd" class="btn btn-light border rounded-3 text-start" to="/ads/create" @click="closeShell">Создать</router-link>
              <router-link class="btn btn-light border rounded-3 text-start" to="/favorites" @click="closeShell">Избранное</router-link>
              <router-link class="btn btn-light border rounded-3 d-flex align-items-center justify-content-between gap-2" to="/chat" @click="closeShell">
                <span>Чаты</span>
                <span v-if="chatUnreadCount" class="badge rounded-pill bg-danger">
                  {{ chatUnreadCount > 99 ? '99+' : chatUnreadCount }}
                </span>
              </router-link>
            </div>

            <div v-if="canOpenDashboard" class="mt-3 pt-3 border-top">
              <div class="small text-uppercase text-secondary fw-semibold mb-2">Панель</div>
              <div class="d-grid gap-2">
                <router-link class="btn btn-light border rounded-3 text-start" to="/admin?tab=ads" @click="closeShell">Объявления</router-link>
                <router-link v-if="canAccessAdmin" class="btn btn-light border rounded-3 text-start" to="/admin?tab=users" @click="closeShell">Пользователи</router-link>
                <router-link v-if="canAccessAdmin" class="btn btn-light border rounded-3 text-start" to="/admin?tab=logs" @click="closeShell">Логи</router-link>
                <router-link v-if="canAccessAdmin" class="btn btn-light border rounded-3 text-start" to="/admin/categories" @click="closeShell">Категории</router-link>
              </div>
            </div>

            <div class="mt-3 pt-3 border-top">
              <router-link v-if="userStore.user?.userId" class="btn btn-outline-primary rounded-3 w-100 text-start" :to="`/users/${currentUserId}`" @click="closeShell">
                {{ userStore.user.userName || userStore.user.userLogin }}
              </router-link>
              <button class="btn btn-danger rounded-3 w-100 mt-2" @click="handleLogout">Выйти</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </nav>

  <div
    v-if="hasOpenSurface"
    class="position-fixed top-0 start-0 w-100 h-100 bg-transparent"
    style="z-index: 1010;"
    aria-hidden="true"
    @click="closeShell"
  ></div>
</template>

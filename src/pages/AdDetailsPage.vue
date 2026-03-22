<script setup>
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdsStore } from '../stores/adsStore'
import { useUserStore } from '../stores/userStore'

const route = useRoute()
const router = useRouter()
const adsStore = useAdsStore()
const userStore = useUserStore()

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122'
const currentImage = ref(null)
const avatarError = ref(false)

// Local placeholder avoids external network dependency (e.g. via.placeholder.com)
const defaultPlaceholder =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%22800%22%20height%3D%22450%22%3E%3Crect%20width%3D%22800%22%20height%3D%22450%22%20fill%3D%22%23f8f9fa%22/%3E%3Ctext%20x%3D%22400%22%20y%3D%22225%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2230%22%20fill%3D%22%23777%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%3E%D0%9D%D0%B5%D1%82%20%D0%B8%D0%B7%D0%BE%D0%B1%D1%80%D0%B0%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F%3C/text%3E%3C/svg%3E'

// server response info (displayed after redirects from edit page)
const serverInfo = ref(null)

// loading / error for fetching ad
const isLoading = ref(true)
const loadError = ref(null)

const ad = computed(() => adsStore.selectedAd)

function resolveModerationStatus(raw) {
  if (raw === undefined || raw === null || raw === '') return ''
  const normalized = String(raw).trim()
  if (!normalized) return ''

  switch (normalized.toLowerCase()) {
    case '0':
    case 'pending':
      return 'Pending'
    case '1':
    case 'approved':
      return 'Approved'
    case '2':
    case 'rejected':
      return 'Rejected'
    case '3':
    case 'hidden':
      return 'Hidden'
    default:
      return normalized
  }
}

const moderationStatus = computed(() => {
  return resolveModerationStatus(ad.value?.moderationStatus ?? ad.value?.status)
})

const moderationStatusLabel = computed(() => {
  switch (moderationStatus.value) {
    case 'Pending':
      return 'На модерации'
    case 'Approved':
      return 'Одобрено'
    case 'Rejected':
      return 'Отклонено'
    case 'Hidden':
      return 'Скрыто'
    default:
      return moderationStatus.value
  }
})

const moderationStatusClass = computed(() => {
  switch (moderationStatus.value) {
    case 'Pending':
      return 'bg-warning text-dark'
    case 'Approved':
      return 'bg-success'
    case 'Rejected':
      return 'bg-danger'
    case 'Hidden':
      return 'bg-secondary'
    default:
      return 'bg-secondary'
  }
})

// show server response (e.g. after editing an ad)
watchEffect(() => {
  const { message, updated, skipped } = route.query
  if (message || updated || skipped) {
    serverInfo.value = {
      message: message ? String(message) : null,
      updated: updated ? String(updated).split(',').filter(Boolean) : [],
      skipped: skipped ? String(skipped).split(',').filter(Boolean) : [],
    }

    // remove query so alerts don't reappear on page reload
    router.replace({ path: `/ads/${route.params.id}` })
  }
})

const sellerInitial = computed(() => {
  const login = ad.value?.user?.userLogin || ''
  return login ? login.charAt(0).toUpperCase() : ''
})

const displayImage = computed(() => {
  if (!currentImage.value && ad.value?.images?.length) {
    const main = ad.value.images.find(img => img.isMain) || ad.value.images[0]
    return `${apiBase}/${main.filePath}`
  }
  return currentImage.value ? `${apiBase}/${currentImage.value}` : defaultPlaceholder
})

const isAdmin = computed(() => Boolean(userStore.isAdmin))

const canEdit = computed(() => {
  if (!ad.value) return false
  const currentUserId = userStore.user?.userId || userStore.tokenUserId
  const isOwner = currentUserId && ad.value?.user?.id && String(currentUserId) === String(ad.value.user.id)
  return isOwner || isAdmin.value
})

async function setModerationStatus(newStatus) {
  if (!ad.value?.id) return

  const confirmMsg = `Установить статус "${newStatus}" для объявления "${ad.value.title}"?`
  if (!confirm(confirmMsg)) return

  try {
    await adsStore.patchModerationStatus(ad.value.id, newStatus)
    alert(`Статус объявления обновлён: ${newStatus}`)
  } catch (err) {
    alert(err?.message || 'Не удалось обновить статус объявления')
  }
}

function getImageUrl(path) {
  return `${apiBase}/${path}`
}

onMounted(async () => {
  isLoading.value = true
  loadError.value = null

  try {
    await adsStore.loadAd(route.params.id)
  } catch (e) {
    // Если объявление недоступно (удалено/нет доступа/не найдено) — показываем сообщение.
    let serverMsg = ''

    if (e?.message) {
      serverMsg = String(e.message).trim()
    } else if (typeof e === 'string') {
      serverMsg = e.trim()
    } else {
      serverMsg = String(e ?? '').trim()
    }

    if (serverMsg.startsWith('{')) {
      try {
        const parsed = JSON.parse(serverMsg)
        serverMsg = (parsed?.message || parsed?.error || '').toString().trim()
      } catch {
        // оставим как есть
      }
    }

    loadError.value = serverMsg
      ? `Объявление недоступно: ${serverMsg}`
      : 'Объявление недоступно или не существует.'
    return
  } finally {
    isLoading.value = false
  }

  if (ad.value?.images?.length) {
    const main = ad.value.images.find(img => img.isMain) || ad.value.images[0]
    currentImage.value = main.filePath
  }
})

watch(
  () => ad.value?.images,
  images => {
    if (!currentImage.value && images?.length) {
      currentImage.value = images.find(img => img.isMain)?.filePath || images[0].filePath
    }
  },
  { immediate: true }
)

async function addToFavorites() {
  const token = localStorage.getItem('token')
  await fetch(`/api/favorites/${route.params.id}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  alert('Добавлено в избранное')
}

function formatDate(str) {
  if (!str) return ''
  return new Date(str).toLocaleString()
}

function writeToSeller() {
  router.push(`/chat/${route.params.id}`)
}

async function deleteAd() {
  const shouldDelete = confirm('Вы действительно хотите удалить это объявление? Это действие необратимо.')
  if (!shouldDelete) return

  try {
    await adsStore.deleteAd(route.params.id)
    alert('Объявление удалено')
    router.push('/')
  } catch (err) {
    // На фронте не дублируем логику прав доступа — сервер возвращает статус и сообщение.
    alert(err?.message || 'Ошибка при удалении объявления')

    // В случае 404 можем вернуться на главную, если объявления больше нет.
    if (err?.status === 404) {
      router.push('/')
    }
  }
}

function goToEdit() {
  router.push(`/ads/${route.params.id}/edit`)
}

function setCurrentImage(filePath) {
  currentImage.value = filePath
}
</script>

<template>
  <div class="container py-4">
    <div v-if="isLoading" class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Загрузка...</span>
      </div>
      <p class="mt-3 text-muted">Загрузка объявления...</p>
    </div>

    <div v-else-if="loadError" class="text-center py-5">
      <div class="alert alert-danger">{{ loadError }}</div>
      <router-link to="/" class="btn btn-primary">Вернуться на главную</router-link>
    </div>

    <div v-else-if="ad">
      <h1 class="mb-4">
        {{ ad.title }}
        <span v-if="moderationStatus" class="badge ms-3" :class="moderationStatusClass">{{ moderationStatusLabel }}</span>
      </h1>

      <div v-if="serverInfo?.message" class="alert alert-success mb-3">
        {{ serverInfo.message }}
      </div>

      <div v-if="serverInfo?.updated?.length" class="alert alert-success mb-3">
        <strong>Обновлено:</strong>
        <div class="mt-2">
          <span
            v-for="field in serverInfo.updated"
            :key="field"
            class="badge bg-secondary me-1 mb-1"
          >
            {{ field }}
          </span>
        </div>
      </div>

      <div v-if="serverInfo?.skipped?.length" class="alert alert-warning mb-3">
        <strong>Пропущено:</strong>
        <div class="mt-2">
          <span
            v-for="field in serverInfo.skipped"
            :key="field"
            class="badge bg-secondary me-1 mb-1"
          >
            {{ field }}
          </span>
        </div>
      </div>

      <nav aria-label="breadcrumb" class="mb-3">
        <ol class="breadcrumb mb-0">
          <li class="breadcrumb-item">
            <router-link to="/">Главная</router-link>
          </li>
          <li class="breadcrumb-item" v-if="ad.category">
            <router-link :to="`/category/${ad.categoryId}`">{{ ad.category.name }}</router-link>
          </li>
          <li class="breadcrumb-item active" aria-current="page">{{ ad.title }}</li>
        </ol>
      </nav>

      <div class="row gx-4 gy-4">
        <div class="col-lg-7">
          <div class="card shadow-sm">
            <div class="ratio ratio-16x9 bg-light overflow-hidden">
              <img
                :src="displayImage"
                class="w-100 h-100 object-fit-cover"
                :alt="ad.title"
              />
            </div>
            <div class="card-body py-3">
              <div v-if="ad.images?.length" class="d-flex flex-wrap gap-2">
                <button
                  v-for="img in ad.images"
                  :key="img.id"
                  type="button"
                  class="p-0 border-0 rounded"
                  :class="{ 'border border-primary': currentImage === img.filePath }"
                  style="cursor: pointer;"
                  @click="setCurrentImage(img.filePath)"
                >
                  <img
                    :src="getImageUrl(img.filePath)"
                    class="img-thumbnail"
                    style="width: 80px; height: 80px; object-fit: cover;"
                    :alt="`Изображение ${img.id}`"
                  />
                </button>
              </div>
            </div>
          </div>

          <div class="card shadow-sm mt-4">
            <div class="card-body">
              <h2 class="h5 mb-3">Описание</h2>
              <p v-if="ad.description" v-html="ad.description"></p>
              <p v-else class="text-muted mb-0">Описание отсутствует.</p>
            </div>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card shadow-sm">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <h1 class="h4 mb-1">{{ ad.title }}</h1>
                  <p class="text-muted mb-1">
                    <span class="badge bg-secondary me-1">{{ ad.type }}</span>
                    <span>{{ ad.city }}</span>
                  </p>
                </div>
                <div class="text-end">
                  <p class="h3 text-primary mb-1">{{ ad.price }} ₽</p>
                  <p class="text-muted small mb-0">{{ formatDate(ad.createdAt) }}</p>
                </div>
              </div>
              <hr />
              <div class="d-grid gap-2">
                <button v-if="canEdit" class="btn btn-warning" @click="goToEdit">
                  Редактировать
                </button>
                <button v-if="canEdit" class="btn btn-danger" @click="deleteAd">
                  Удалить
                </button>
                <button class="btn btn-primary" @click="writeToSeller">Написать продавцу</button>
                <button class="btn btn-outline-secondary" @click="addToFavorites">Добавить в избранное</button>
              </div>
            </div>
          </div>

          <div class="card shadow-sm mt-4">
            <div class="card-body">
              <h2 class="h6 mb-3">Продавец</h2>
              <router-link
                :to="`/profile/${ad.user?.id}`"
                class="d-flex align-items-center text-decoration-none text-body"
              >
                <div class="me-3">
                  <img
                    v-if="ad.user?.avatarPath && !avatarError"
                    :src="getImageUrl(ad.user.avatarPath)"
                    class="rounded-circle"
                    style="width:50px;height:50px;object-fit:cover;"
                    alt="Аватар продавца"
                    @error="avatarError = true"
                  />
                  <div
                    v-else
                    class="bg-secondary text-white d-flex align-items-center justify-content-center"
                    style="width:50px;height:50px;border-radius:50%;font-weight:bold;"
                  >
                    {{ sellerInitial }}
                  </div>
                </div>
                <div>
                  <div class="fw-semibold">{{ ad.user?.userLogin }}</div>
                  <div class="text-muted small">{{ ad.user?.userEmail }}</div>
                  <div class="text-muted small">{{ ad.user?.userPhoneNumber }}</div>
                </div>
              </router-link>
            </div>
          </div>

          <div v-if="isAdmin" class="card shadow-sm mt-4">
            <div class="card-body">
              <h2 class="h6 mb-3">Блок модерации (админ)</h2>
              <div class="d-grid gap-2">
                <button class="btn btn-outline-success" @click="setModerationStatus('Approved')">Одобрить</button>
                <button class="btn btn-outline-danger" @click="setModerationStatus('Rejected')">Отклонить</button>
                <button class="btn btn-outline-secondary" @click="setModerationStatus('Hidden')">Скрыть</button>
                <button class="btn btn-outline-warning" @click="setModerationStatus('Pending')">Отправить на модерацию</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-center py-5">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Загрузка...</span>
      </div>
      <p class="mt-3 text-muted">Загрузка объявления...</p>
    </div>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, watch, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdsStore } from '../stores/adsStore'
import { useUserStore } from '../stores/userStore'
import { useChatStore } from '../stores/chatStore'
import { usePresenceStore } from '../stores/presenceStore'
import { usePresenceAuto } from '../composables/usePresenceAuto'
import { useLocations } from '../composables/useLocations'
import { timeAgo } from '../utils/formatDate'
import { useProgressiveTimeAgo } from '@/composables/useProgressiveTimeAgo'
import { getModerationStatusClass, getModerationStatusLabel, normalizeModerationStatus } from '@/utils/moderationStatus'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { parsePatchIssues } from '../utils/patchResult'
import { ContractError, mapContractErrorToUi } from '../utils/apiContract'

const route = useRoute()
const router = useRouter()
const adsStore = useAdsStore()
const userStore = useUserStore()
const chatStore = useChatStore()
const presenceStore = usePresenceStore()

const currentImage = ref(null)
const avatarError = ref(false)
const { loadTree, getLocationPathLabel } = useLocations()

const serverInfo = ref(null)

// loading / error for fetching ad
const isLoading = ref(true)
const loadError = ref(null)

const ad = computed(() => adsStore.selectedAd)

const moderationStatus = computed(() => {
  return normalizeModerationStatus(ad.value?.moderationStatus ?? ad.value?.status)
})

const moderationStatusLabel = computed(() => {
  return getModerationStatusLabel(moderationStatus.value)
})

const moderationStatusClass = computed(() => {
  return getModerationStatusClass(moderationStatus.value)
})

// show server response (e.g. after editing an ad)
watchEffect(() => {
  const { message, updated, skipped, errors } = route.query
  if (message || updated || skipped || errors) {
    serverInfo.value = {
      message: message ? String(message) : null,
      updated: updated ? String(updated).split(',').filter(Boolean) : [],
      skipped: parsePatchIssues(skipped),
      errors: parsePatchIssues(errors, 'validation_error'),
    }

    // remove query so alerts don't reappear on page reload
    router.replace({ path: `/ads/${route.params.id}` })
  }
})

const sellerInitial = computed(() => {
  const login = ad.value?.user?.userLogin || ''
  return login ? login.charAt(0).toUpperCase() : ''
})

const sellerId = computed(() => (ad.value?.user?.id != null ? String(ad.value.user.id) : ''))

usePresenceAuto(sellerId)

const sellerIsOnline = computed(() => presenceStore.isOnline(sellerId.value))

const sellerLast = computed(() => presenceStore.getLastActivity(sellerId.value) ?? ad.value?.user?.lastActivityAt)
const sellerLastLabel = useProgressiveTimeAgo(sellerLast, {
  prefix: 'Был(а) в сети ',
  strategy: 'messenger',
  online: sellerIsOnline,
  localLastSeen: computed(() => (sellerIsOnline.value ? null : presenceStore.getLastActivity(sellerId.value))),
})
const sellerLastSeenText = computed(() => {
  if (!presenceStore.isPresenceReady) return '...'
  if (sellerIsOnline.value) return 'в сети'
  const last = sellerLast.value
  if (!last) return 'был(а) давно'
  return sellerLastLabel.value
})

const sellerLastSeenClass = computed(() => {
  if (!presenceStore.isPresenceReady) return 'text-secondary'
  if (sellerIsOnline.value) return 'text-success'
  return 'text-secondary'
})

const displayImage = computed(() => {
  return resolveMediaUrl(currentImage.value)
})

const isFavorite = ref(false)

watch(
  () => ad.value?.isFavorite,
  value => {
    if (value !== undefined && value !== null) {
      isFavorite.value = Boolean(value)
    }
  },
  { immediate: true }
)

const canModerate = computed(() => Boolean(userStore.canModerateAds))

const priceText = computed(() => {
  if (!ad.value) return ''
  if (ad.value.isNegotiable) return 'Договорная'
  const p = ad.value.price
  if (p === undefined || p === null || p === '') return 'Бесплатно'
  return `${p} Br`
})

const locationText = computed(() => {
  if (!ad.value) return ''
  return getLocationPathLabel(ad.value.locationId) || 'Локация не указана'
})

const canEdit = computed(() => {
  if (!ad.value) return false
  const currentUserId = userStore.user?.userId || userStore.tokenUserId
  const isOwner = currentUserId && ad.value?.user?.id && String(currentUserId) === String(ad.value.user.id)
  return isOwner || canModerate.value
})

async function setModerationStatus(newStatus) {
  if (!ad.value?.id) return

  // open app-styled confirmation modal instead of browser confirm()
  confirmTitle.value = 'Подтвердить действие'
  confirmMessage.value = `Установить статус "${newStatus}" для объявления "${ad.value.title}"?`
  confirmPrimaryLabel.value = 'Да'
  // pick primary button style based on status
  confirmPrimaryClass.value = newStatus === 'active' ? 'btn-success' : newStatus === 'deleted' ? 'btn-secondary' : newStatus === 'pendingModeration' ? 'btn-warning' : 'btn-primary'
  confirmHandler = async () => {
    confirmSending.value = true
    try {
      await adsStore.patchModerationStatus(ad.value.id, newStatus)
      showConfirmModal.value = false
      alert(`Статус объявления обновлён: ${newStatus}`)
    } catch (err) {
      alert(err?.message || 'Не удалось обновить статус объявления')
    } finally {
      confirmSending.value = false
    }
  }
  showConfirmModal.value = true
}

function getImageUrl(path) {
  return resolveMediaUrl(path)
}

function handleImageError(imagePath) {
  console.error('[AdDetailsPage] Failed to load image', imagePath)

  if (currentImage.value === imagePath) {
    currentImage.value = null
  }
}

async function refreshFavoriteState(adId) {
  const serverFavorite = ad.value?.isFavorite
  if (serverFavorite !== undefined && serverFavorite !== null) {
    isFavorite.value = Boolean(serverFavorite)
    return
  }

  isFavorite.value = Boolean(ad.value?.isFavorite)
}

onMounted(async () => {
  void loadTree()
  isLoading.value = true
  loadError.value = null

  try {
    await adsStore.loadAd(route.params.id)
    if (ad.value?.images?.length) {
      const mainImage = ad.value.images.find(image => image.id === ad.value.mainImageId)
      currentImage.value = mainImage.filePath
    } else {
      currentImage.value = ''
    }
    await refreshFavoriteState(route.params.id)
  } catch (e) {
    if (e instanceof ContractError) {
      loadError.value = mapContractErrorToUi(e)
      return
    }

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
        serverMsg = String(parsed?.message || parsed?.error || '').trim()
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
})

async function toggleFavorite() {
  const userId = userStore.user?.userId || userStore.tokenUserId
  if (!userId) {
    alert('Нужно войти в систему, чтобы использовать избранное')
    return
  }

  try {
    if (isFavorite.value) {
      await userStore.removeFavorite(userId, ad.value.id)
      isFavorite.value = false
      if (ad.value) adsStore.selectedAd = { ...ad.value, isFavorite: false }
    } else {
      await userStore.addFavorite(userId, ad.value.id)
      isFavorite.value = true
      if (ad.value) adsStore.selectedAd = { ...ad.value, isFavorite: true }
    }
  } catch (err) {
    console.error(err)
    alert(err?.message || 'Не удалось обновить избранное')
  }
}

const showMessageModal = ref(false)
const initialMessage = ref('')
const modalSending = ref(false)
const modalError = ref(null)
const showRejectModal = ref(false)
const rejectReason = ref('')
const rejectSending = ref(false)
const showConfirmModal = ref(false)
const confirmTitle = ref('')
const confirmMessage = ref('')
const confirmSending = ref(false)
const confirmPrimaryLabel = ref('Подтвердить')
const confirmPrimaryClass = ref('btn-primary')
let confirmHandler = null

async function writeToSeller() {
  try {
    const conversation = await chatStore.findConversationByAdId(route.params.id)
    if (conversation?.id) {
      router.push(`/chat/${conversation.id}`)
      return
    }
    initialMessage.value = ''
    modalError.value = null
    showMessageModal.value = true
  } catch (err) {
    console.error(err)
    alert('Не удалось открыть чат: ' + (err?.message || 'ошибка'))
  }
}

async function submitInitialMessage() {
  modalSending.value = true
  modalError.value = null
  try {
    const { conversationId } = await chatStore.sendMessageByAdId(route.params.id, initialMessage.value.trim())
    showMessageModal.value = false
    router.push(`/chat/${conversationId}`)
  } catch (err) {
    modalError.value = err?.message || 'Ошибка отправки'
  } finally {
    modalSending.value = false
  }
}

function openRejectModal() {
  rejectReason.value = ''
  showRejectModal.value = true
}

async function confirmReject() {
  if (!ad.value?.id) return
  rejectSending.value = true
  try {
    await adsStore.patchModerationStatus(ad.value.id, 'rejected', rejectReason.value)
    showRejectModal.value = false
    rejectReason.value = ''
    alert('Статус объявления обновлён: rejected')
  } catch (err) {
    alert(err?.message || 'Не удалось обновить статус объявления')
  } finally {
    rejectSending.value = false
  }
}

async function deleteAd() {
  // open app-styled confirmation modal for delete
  confirmTitle.value = 'Удалить объявление'
  confirmMessage.value = 'Вы действительно хотите удалить это объявление? Это действие необратимо.'
  confirmPrimaryLabel.value = 'Удалить'
  confirmPrimaryClass.value = 'btn-danger'
  confirmHandler = async () => {
    confirmSending.value = true
    try {
      await adsStore.deleteAd(route.params.id)
      showConfirmModal.value = false
      alert('Объявление удалено')
      router.push('/')
    } catch (err) {
      alert(err?.message)
      if (err?.status === 404) {
        router.push('/')
      }
    } finally {
      confirmSending.value = false
    }
  }
  showConfirmModal.value = true
}

async function confirmExecute() {
  if (typeof confirmHandler === 'function') {
    await confirmHandler()
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
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div v-if="isLoading" class="h-100 d-flex align-items-center justify-content-center py-5">
        <div class="text-center">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Загрузка...</span>
          </div>
          <p class="mt-3 text-muted mb-0">Загрузка объявления...</p>
        </div>
      </div>

      <div v-else-if="loadError" class="h-100 d-flex align-items-center justify-content-center py-5 px-3">
        <div class="text-center">
          <div class="alert alert-danger mb-3">{{ loadError }}</div>
          <router-link to="/" class="btn btn-primary">Вернуться на главную</router-link>
        </div>
      </div>

      <div v-else-if="ad" class="d-flex flex-column h-100">
        <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex flex-column flex-lg-row align-items-lg-end justify-content-between gap-3">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold mb-1">Marketplace</div>
            <h1 class="h3 mb-0 fw-semibold">{{ ad.title }}</h1>
          </div>
          <span v-if="moderationStatus" class="badge rounded-pill align-self-start align-self-lg-center" :class="moderationStatusClass">{{ moderationStatusLabel }}</span>
        </div>

        <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
          <div v-if="serverInfo?.message" class="alert alert-success mb-3">{{ serverInfo.message }}</div>

          <div v-if="serverInfo?.updated?.length" class="alert alert-success mb-3">
            <strong>Обновлено:</strong>
            <div class="mt-2">
              <span v-for="field in serverInfo.updated" :key="field" class="badge bg-secondary me-1 mb-1">{{ field }}</span>
            </div>
          </div>

          <div v-if="serverInfo?.skipped?.length" class="alert alert-warning mb-3">
            <strong>Пропущено:</strong>
            <div class="mt-2 d-grid gap-1">
              <div v-for="issue in serverInfo.skipped" :key="`${issue.code ?? 'skipped'}-${issue.field ?? ''}-${issue.message ?? ''}`" class="small">
                <span class="badge bg-secondary me-2">{{ issue.field || issue.code || 'skipped' }}</span>
                <span>{{ issue.field && issue.message ? `${issue.field}: ${issue.message}` : (issue.message || issue.field || issue.code) }}</span>
              </div>
            </div>
          </div>

          <div v-if="serverInfo?.errors?.length" class="alert alert-danger mb-3">
            <strong>Ошибки:</strong>
            <div class="mt-2 d-grid gap-1">
              <div v-for="issue in serverInfo.errors" :key="`${issue.code ?? 'error'}-${issue.field ?? ''}-${issue.message ?? ''}`" class="small">
                <span class="badge bg-danger me-2">{{ issue.field || issue.code || 'error' }}</span>
                <span>{{ issue.field && issue.message ? `${issue.field}: ${issue.message}` : (issue.message || issue.field || issue.code) }}</span>
              </div>
            </div>
          </div>

          <nav aria-label="breadcrumb" class="mb-3">
            <ol class="breadcrumb mb-0">
              <li class="breadcrumb-item"><router-link to="/">Главная</router-link></li>
              <li class="breadcrumb-item" v-if="ad.category"><router-link :to="`/category/${ad.categoryId}`">{{ ad.category.name }}</router-link></li>
              <li class="breadcrumb-item active" aria-current="page">{{ ad.title }}</li>
            </ol>
          </nav>

          <div class="row g-4 align-items-start">
            <div class="col-12 col-xl-7">
              <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
                <div class="ratio ratio-16x9 bg-light overflow-hidden">
                  <template v-if="displayImage">
                    <img :src="displayImage" class="w-100 h-100 object-fit-cover" :alt="ad.title" @error="handleImageError(currentImage)" />
                  </template>
                  <div v-else class="w-100 h-100 d-flex flex-column align-items-center justify-content-center text-secondary">
                    <span style="font-size: 2.2rem;">📷</span>
                    <span class="small mt-1">Без фото</span>
                  </div>
                </div>
                <div class="card-body py-3">
                  <div v-if="ad.images.length" class="d-flex flex-wrap gap-2">
                    <button
                      v-for="img in ad.images"
                      :key="img.id"
                      type="button"
                      class="p-0 border-0 rounded overflow-hidden position-relative"
                      :class="{ 'border border-primary': currentImage === img.filePath }"
                      style="cursor: pointer;"
                      @click="setCurrentImage(img.filePath)"
                    >
                      <span v-if="img.isMain" class="badge bg-primary position-absolute top-0 start-0 m-1 pe-none">Главное</span>
                      <img :src="getImageUrl(img.filePath)" class="img-thumbnail border-0" style="width: 80px; height: 80px; object-fit: cover;" :alt="`Изображение ${img.id}`" @error="handleImageError(img.filePath)" />
                    </button>
                  </div>
                </div>
              </div>

              <div class="card border-0 shadow-sm rounded-4 mb-4">
                <div class="card-body">
                  <h2 class="h5 mb-3 fw-semibold">Описание</h2>
                  <p v-if="ad.description" v-html="ad.description"></p>
                  <p v-else class="text-muted mb-0">Описание отсутствует.</p>
                </div>
              </div>
            </div>

            <div class="col-12 col-xl-5">
              <div class="d-flex flex-column gap-3">
                <div class="card border-0 shadow-sm rounded-4">
                  <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                      <div>
                        <h2 class="h4 mb-1 fw-semibold">{{ ad.title }}</h2>
                        <p class="text-muted mb-1">
                          <span class="badge bg-secondary me-1">{{ ad.listingType }}</span>
                          <span>{{ locationText }}</span>
                        </p>
                      </div>
                      <div class="text-end">
                        <p class="h3 text-primary mb-1">{{ priceText }}</p>
                        <p class="text-muted small mb-0">
                          <span v-if="ad.updatedAt">Добавлено: {{ timeAgo(ad.updatedAt) }}</span>
                          <span v-else-if="ad.createdAt">Добавлено: {{ timeAgo(ad.createdAt) }}</span>
                        </p>
                      </div>
                    </div>
                    <hr class="my-3" />
                    <div class="d-grid gap-2">
                      <button v-if="canEdit" class="btn btn-warning" @click="goToEdit">Редактировать</button>
                      <button v-if="canEdit" class="btn btn-danger" @click="deleteAd">Удалить</button>
                      <div class="d-flex justify-content-between align-items-center gap-3">
                        <button class="btn btn-primary" @click="writeToSeller">Написать продавцу</button>
                        <button class="btn btn-sm p-0 border-0 bg-transparent" style="font-size: 1.7rem; line-height: 1" @click="toggleFavorite" :aria-pressed="Boolean(isFavorite)">
                          <span :style="{ color: Boolean(isFavorite) ? '#dc3545' : '#adb5bd' }">&#9829;</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="card border-0 shadow-sm rounded-4">
                  <div class="card-body">
                    <h2 class="h6 mb-3 fw-semibold">Продавец</h2>
                    <router-link :to="`/users/${ad.user?.id}`" class="d-flex align-items-center text-decoration-none text-body">
                      <div class="me-3" style="position:relative;">
                        <div style="width:50px;height:50px;position:relative;">
                          <img v-if="ad.user?.avatarPath && !avatarError" :src="getImageUrl(ad.user.avatarPath)" class="rounded-circle" style="width:50px;height:50px;object-fit:cover;" alt="Аватар продавца" @error="avatarError = true" />
                          <div v-else class="bg-secondary text-white d-flex align-items-center justify-content-center" style="width:50px;height:50px;border-radius:50%;font-weight:bold;">{{ sellerInitial }}</div>
                          <span v-if="sellerIsOnline" class="d-inline-block" style="position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%; background: #198754; border: 2px solid #fff;"></span>
                        </div>
                      </div>
                      <div>
                        <div class="fw-semibold">{{ ad.user?.userLogin }}</div>
                        <div class="text-muted small">{{ ad.user?.userEmail }}</div>
                        <div class="text-muted small">{{ ad.user?.userPhoneNumber }}</div>
                        <div :class="['small', sellerLastSeenClass]">{{ sellerLastSeenText }}</div>
                      </div>
                    </router-link>
                  </div>
                </div>

                <div v-if="canModerate" class="card border-0 shadow-sm rounded-4">
                  <div class="card-body">
                    <h2 class="h6 mb-3 fw-semibold">Блок модерации</h2>
                    <div class="d-grid gap-2">
                      <button class="btn btn-outline-success" @click="setModerationStatus('active')">Одобрить</button>
                      <button class="btn btn-outline-danger" @click="openRejectModal">Отклонить</button>
                      <button class="btn btn-outline-secondary" @click="setModerationStatus('deleted')">Скрыть</button>
                      <button class="btn btn-outline-warning" @click="setModerationStatus('pendingModeration')">Отправить на модерацию</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="h-100 d-flex align-items-center justify-content-center py-5">
        <div class="text-center">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Загрузка...</span>
          </div>
          <p class="mt-3 text-muted mb-0">Загрузка объявления...</p>
        </div>
      </div>
    </div>
  </div>

  <teleport to="body">
    <div v-if="showMessageModal" class="modal d-block" tabindex="-1" style="background:rgba(0,0,0,.45);" @click.self="showMessageModal = false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Написать продавцу</h5>
            <button type="button" class="btn-close" @click="showMessageModal = false"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-2">Объявление: <strong>{{ ad?.title }}</strong></p>
            <div v-if="modalError" class="alert alert-danger py-2 mb-2">{{ modalError }}</div>
            <textarea
              v-model="initialMessage"
              class="form-control"
              rows="4"
              placeholder="Введите сообщение..."
              :disabled="modalSending"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showMessageModal = false" :disabled="modalSending">Отмена</button>
            <button type="button" class="btn btn-primary" @click="submitInitialMessage" :disabled="modalSending || !initialMessage.trim()">
              <span v-if="modalSending" class="spinner-border spinner-border-sm me-1" role="status"></span>
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>

  <teleport to="body">
    <div v-if="showRejectModal" class="modal d-block" tabindex="-1" style="background:rgba(0,0,0,.45);" @click.self="showRejectModal = false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Причина отказа</h5>
            <button type="button" class="btn-close" @click="showRejectModal = false"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-2">Объявление: <strong>{{ ad?.title }}</strong></p>
            <textarea v-model="rejectReason" class="form-control" rows="3" placeholder="Укажите причину отказа"></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showRejectModal = false" :disabled="rejectSending">Отмена</button>
            <button type="button" class="btn btn-danger" @click="confirmReject" :disabled="rejectSending">
              <span v-if="rejectSending" class="spinner-border spinner-border-sm me-1" role="status"></span>
              Отклонить
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
  <teleport to="body">
    <div v-if="showConfirmModal" class="modal d-block" tabindex="-1" style="background:rgba(0,0,0,.45);" @click.self="showConfirmModal = false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ confirmTitle }}</h5>
            <button type="button" class="btn-close" @click="showConfirmModal = false"></button>
          </div>
          <div class="modal-body">
            <p class="text-muted small mb-2">{{ confirmMessage }}</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" @click="showConfirmModal = false" :disabled="confirmSending">Отмена</button>
            <button type="button" :class="['btn', confirmPrimaryClass]" @click="confirmExecute" :disabled="confirmSending">
              <span v-if="confirmSending" class="spinner-border spinner-border-sm me-1" role="status"></span>
              {{ confirmPrimaryLabel }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>
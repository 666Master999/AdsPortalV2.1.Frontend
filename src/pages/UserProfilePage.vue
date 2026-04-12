<script setup>
import { ref, computed, watchEffect } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useRoute, useRouter } from 'vue-router'
import { timeAgo } from '../utils/formatDate'
import AdCard from '../components/AdCard.vue'
import { handleApiError, toPublicErrorMessage } from '../services/errorService'
import { getModerationStatusLabel, normalizeModerationStatus } from '@/utils/moderationStatus'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import { parsePatchIssues } from '../utils/patchResult'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()

function formatModerationStatus(status) {
  return getModerationStatusLabel(normalizeModerationStatus(status))
}

const error = ref('')
const profile = ref(null)
const currentUserFavorites = ref([])
const patchInfo = ref(null)
const avatarError = ref(false)
const sessions = ref([])
const sessionsLoading = ref(false)
const sessionsError = ref('')
const sessionActionId = ref('')
const logoutAllPending = ref(false)
const logoutCurrentPending = ref(false)

const profileId = computed(() => parseInt(route.params.id) || userStore.user?.userId)

const sellerInitial = computed(() => {
  const login = profile.value?.userLogin || ''
  return login ? login.charAt(0).toUpperCase() : ''
})
const isOwnProfile = computed(() => profileId.value === userStore.user?.userId)

// redirect bare /profile to include id
watchEffect(() => {
  if (!route.params.id && profileId.value) {
    router.replace(`/users/${profileId.value}`)
  }
})

watchEffect(() => {
  const { updated, skipped, errors } = route.query
  if (updated || skipped || errors) {
    patchInfo.value = {
      updated: updated ? String(updated).split(',').filter(Boolean) : [],
      skipped: parsePatchIssues(skipped),
      errors: parsePatchIssues(errors, 'validation_error'),
    }
    router.replace({ path: `/users/${profileId.value}` })
  }
})

watchEffect(async () => {
  if (!profileId.value) return

  error.value = ''
  try {
    const data = await userStore.fetchPublicProfile(profileId.value)
    profile.value = data.userProfile ?? data
    currentUserFavorites.value = data.currentUserFavorites ?? []
  } catch (errorValue) {
    profile.value = null
    currentUserFavorites.value = []
    const apiError = await handleApiError(errorValue, { notify: false })
    error.value = toPublicErrorMessage(apiError, 'Пользователь недоступен.')
  }
})

watchEffect(async () => {
  if (!isOwnProfile.value) {
    sessions.value = []
    sessionsError.value = ''
    return
  }

  sessionsLoading.value = true
  sessionsError.value = ''

  try {
    await getSessions()
  } catch (errorValue) {
    sessions.value = []
    const apiError = await handleApiError(errorValue, { notify: false })
    sessionsError.value = toPublicErrorMessage(apiError, 'Ошибка при загрузке устройств')
  } finally {
    sessionsLoading.value = false
  }
})

async function getSessions() {
  const list = await userStore.getSessions()
  sessions.value = list
  return list
}

async function revokeSession(id, isCurrent = false) {
  if (!id || sessionActionId.value) return

  sessionActionId.value = id
  sessionsError.value = ''

  try {
    await userStore.revokeSession(id)
    sessions.value = sessions.value.filter(session => session.id !== id)

    if (isCurrent) {
      userStore.clearAuth()
      await router.push('/login')
    }
  } catch (errorValue) {
    const apiError = await handleApiError(errorValue, { notify: false })
    sessionsError.value = toPublicErrorMessage(apiError, 'Ошибка при отзыве сессии')
  } finally {
    sessionActionId.value = ''
  }
}

async function logoutAll() {
  if (logoutAllPending.value) return

  logoutAllPending.value = true
  sessionsError.value = ''

  try {
    await userStore.logoutAll()
  } catch (errorValue) {
    const apiError = await handleApiError(errorValue, { notify: false })
    sessionsError.value = toPublicErrorMessage(apiError, 'Ошибка при выходе со всех устройств')
  } finally {
    userStore.clearAuth()
    await router.push('/login')
    logoutAllPending.value = false
  }
}

async function logoutCurrent() {
  if (logoutCurrentPending.value) return

  logoutCurrentPending.value = true
  sessionsError.value = ''

  try {
    await userStore.logout()
  } catch (errorValue) {
    const apiError = await handleApiError(errorValue, { notify: false })
    sessionsError.value = toPublicErrorMessage(apiError, 'Ошибка при выходе')
  } finally {
    userStore.clearAuth()
    await router.push('/login')
    logoutCurrentPending.value = false
  }
}

function goToEdit() {
  router.push(`/users/${profileId.value}/edit`)
}

function resolveUrl(path) {
  return resolveMediaUrl(path)
}
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div class="d-flex flex-column h-100">
        <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-center justify-content-between gap-3">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold mb-1">Profile</div>
            <h1 class="h3 mb-0 fw-semibold">Профиль</h1>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button v-if="isOwnProfile" class="btn btn-primary rounded-pill" @click="goToEdit">Редактировать</button>
          </div>
        </div>

        <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
          <p v-if="error" class="alert alert-danger">{{ error }}</p>

          <p v-if="patchInfo?.updated?.length" class="alert alert-success">
            <strong>Обновлено:</strong> {{ patchInfo.updated.join(', ') }}
          </p>

          <p v-if="patchInfo?.skipped?.length" class="alert alert-warning">
            <strong>Пропущено:</strong>
            <span v-for="issue in patchInfo.skipped" :key="`${issue.code ?? 'skipped'}-${issue.field ?? ''}-${issue.message ?? ''}`" class="d-block mt-1">
              <span class="badge bg-secondary me-2">{{ issue.field || issue.code || 'skipped' }}</span>
              <span>{{ issue.field && issue.message ? `${issue.field}: ${issue.message}` : (issue.message || issue.field || issue.code) }}</span>
            </span>
          </p>

          <p v-if="patchInfo?.errors?.length" class="alert alert-danger">
            <strong>Ошибки:</strong>
            <span v-for="issue in patchInfo.errors" :key="`${issue.code ?? 'error'}-${issue.field ?? ''}-${issue.message ?? ''}`" class="d-block mt-1">
              <span class="badge bg-danger me-2">{{ issue.field || issue.code || 'error' }}</span>
              <span>{{ issue.field && issue.message ? `${issue.field}: ${issue.message}` : (issue.message || issue.field || issue.code) }}</span>
            </span>
          </p>

          <div v-if="profile" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body p-4">
              <div class="d-flex flex-column flex-lg-row gap-4 align-items-start">
                <div>
                  <img
                    v-if="profile.avatarPath && !avatarError"
                    :src="resolveUrl(profile.avatarPath)"
                    class="img-thumbnail"
                    style="width: 150px; height: 150px; object-fit: cover;"
                    alt="avatar"
                    @error="avatarError = true"
                  />
                  <div v-else class="bg-secondary text-white d-flex align-items-center justify-content-center img-thumbnail" style="width: 150px; height: 150px;">
                    <span style="font-size: 2rem; font-weight: bold;">{{ sellerInitial }}</span>
                  </div>
                </div>

                <div class="flex-grow-1">
                  <div class="row g-3">
                    <div class="col-md-6">
                      <div class="text-secondary small text-uppercase fw-semibold mb-1">Имя</div>
                      <div class="fw-semibold">{{ profile.userName || 'Не указано' }}</div>
                    </div>
                    <div class="col-md-6">
                      <div class="text-secondary small text-uppercase fw-semibold mb-1">Логин</div>
                      <div class="fw-semibold">{{ profile.userLogin || '—' }}</div>
                    </div>
                    <div class="col-md-6">
                      <div class="text-secondary small text-uppercase fw-semibold mb-1">Email</div>
                      <div class="fw-semibold">{{ profile.userEmail || '—' }}</div>
                    </div>
                    <div class="col-md-6">
                      <div class="text-secondary small text-uppercase fw-semibold mb-1">Телефон</div>
                      <div class="fw-semibold">{{ profile.userPhoneNumber || '—' }}</div>
                    </div>
                    <div class="col-12">
                      <div class="text-secondary small text-uppercase fw-semibold mb-1">Создан</div>
                      <div>{{ profile.createdAt ? timeAgo(profile.createdAt) : '—' }}</div>
                    </div>
                    <div class="col-12">
                      <div class="text-secondary small text-uppercase fw-semibold mb-1">Последняя активность</div>
                      <div>{{ timeAgo(profile.lastActivityAt, { prefix: 'Был(а) в сети ' }) }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center text-secondary py-5">Загрузка...</div>

          <div v-if="isOwnProfile" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3 mb-3">
                <h3 class="h5 fw-semibold mb-0">Мои устройства</h3>
                <button
                  class="btn btn-outline-danger rounded-pill"
                  :disabled="logoutAllPending || logoutCurrentPending || sessionsLoading || Boolean(sessionActionId)"
                  @click="logoutAll"
                >
                  {{ logoutAllPending ? 'Выход...' : 'Выйти везде' }}
                </button>
              </div>

              <p v-if="sessionsError" class="alert alert-danger mb-3">{{ sessionsError }}</p>

              <div v-if="sessionsLoading" class="text-secondary">Загрузка устройств...</div>

              <ul v-else-if="sessions.length" class="list-group list-group-flush">
                <li v-for="session in sessions" :key="session.id" class="list-group-item px-0 py-3">
                  <div class="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
                    <div>
                      <div class="fw-semibold">{{ session.deviceName || 'Неизвестное устройство' }}</div>
                      <div class="small text-secondary">IP: {{ session.ipAddress || '—' }}</div>
                      <div class="small text-secondary">Последняя активность: {{ session.lastActivityAt ? timeAgo(session.lastActivityAt) : '—' }}</div>
                    </div>

                    <div class="d-flex align-items-center gap-2">
                      <span v-if="session.isCurrent" class="badge text-bg-primary">Это устройство</span>
                      <button
                        class="btn btn-sm btn-outline-danger rounded-pill"
                        :disabled="logoutAllPending || logoutCurrentPending || Boolean(sessionActionId)"
                        @click="session.isCurrent ? logoutCurrent() : revokeSession(session.id)"
                      >
                        {{ session.isCurrent ? (logoutCurrentPending ? 'Выход...' : 'Выйти') : (sessionActionId === session.id ? 'Выход...' : 'Выйти') }}
                      </button>
                    </div>
                  </div>
                </li>
              </ul>

              <div v-else-if="!sessionsError" class="text-secondary">Список устройств пуст.</div>
            </div>
          </div>

          <div v-if="profile?.ads?.length" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <div class="d-flex align-items-end justify-content-between gap-3 mb-3">
                <h3 class="h4 mb-0 fw-semibold">Объявления ({{ profile.ads.length }})</h3>
              </div>
              <div class="row g-4">
                <div v-for="ad in profile.ads" :key="ad.id" class="col-12 col-sm-6 col-lg-4 col-xxl-3">
                  <AdCard :ad="{ ...ad, isFavorite: currentUserFavorites.includes(ad.id) }" />
                </div>
              </div>
            </div>
          </div>

          <div v-if="profile?.favorites?.length" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <h3 class="h4 fw-semibold mb-3">Избранное ({{ profile.favorites.length }})</h3>
              <ul class="list-group">
                <li v-for="fav in profile.favorites" :key="fav.id" class="list-group-item">
                  {{ fav.ad?.title || '—' }}
                </li>
              </ul>
            </div>
          </div>

          <div v-if="profile" class="card border-0 shadow-sm rounded-4">
            <div class="card-body">
              <h3 class="h5 fw-semibold mb-3">DEBUG: raw profile</h3>
              <pre class="mb-0">{{ JSON.stringify(profile, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

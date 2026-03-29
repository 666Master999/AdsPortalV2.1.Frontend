<script setup>
import { ref, computed, watchEffect } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useRoute, useRouter } from 'vue-router'
import { timeAgo } from '../utils/formatDate'
import AdCard from '../components/AdCard.vue'
import { getApiBaseUrl } from '../config/apiBase'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()

function formatModerationStatus(status) {
  switch (status) {
    case 'Pending':
      return 'На модерации'
    case 'Approved':
      return 'Одобрено'
    case 'Rejected':
      return 'Отклонено'
    case 'Hidden':
      return 'Скрыто'
    default:
      return status || ''
  }
}

const error = ref('')
const profile = ref(null)
const currentUserFavorites = ref([])
const patchInfo = ref(null)
const avatarError = ref(false)

const profileId = computed(() => parseInt(route.params.id) || userStore.user?.userId)

const sellerInitial = computed(() => {
  const login = profile.value?.userLogin || ''
  return login ? login.charAt(0).toUpperCase() : ''
})
const isOwnProfile = computed(() => profileId.value === userStore.user?.userId)

// redirect bare /profile to include id
watchEffect(() => {
  if (!route.params.id && profileId.value) {
    router.replace(`/profile/${profileId.value}`)
  }
})

watchEffect(() => {
  const { updated, skipped } = route.query
  if (updated || skipped) {
    patchInfo.value = {
      updated: updated ? String(updated).split(',').filter(Boolean) : [],
      skipped: skipped ? String(skipped).split(',').filter(Boolean) : []
    }
    router.replace({ path: `/profile/${profileId.value}` })
  }
})

watchEffect(async () => {
  if (!profileId.value) return

  error.value = ''
  try {
    const data = await userStore.fetchProfile(profileId.value)
    profile.value = data.userProfile ?? data
    currentUserFavorites.value = data.currentUserFavorites ?? []
  } catch (e) {
    profile.value = null
    currentUserFavorites.value = []
    error.value = e?.message || 'Ошибка при загрузке профиля'
  }
})

function goToEdit() {
  router.push(`/profile/${profileId.value}/edit`)
}

function resolveUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  const apiBase = getApiBaseUrl()
  return apiBase + (path.startsWith('/') ? path : '/' + path)
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
          <button v-if="isOwnProfile" class="btn btn-primary rounded-pill" @click="goToEdit">Редактировать</button>
        </div>

        <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
          <p v-if="error" class="alert alert-danger">{{ error }}</p>

          <p v-if="patchInfo?.updated?.length" class="alert alert-success">
            <strong>Обновлено:</strong> {{ patchInfo.updated.join(', ') }}
          </p>

          <p v-if="patchInfo?.skipped?.length" class="alert alert-warning">
            <strong>Пропущено:</strong> {{ patchInfo.skipped.join(', ') }}
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

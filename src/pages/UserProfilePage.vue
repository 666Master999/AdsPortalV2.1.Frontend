<script setup>
import { ref, computed, watchEffect } from 'vue'
import { useUserStore } from '../stores/userStore'
import { useRoute, useRouter } from 'vue-router'

const userStore = useUserStore()
const route = useRoute()
const router = useRouter()

const error = ref('')
const profile = ref(null)
const patchInfo = ref(null)

const profileId = computed(() => parseInt(route.params.id) || userStore.user?.userId)
const isOwnProfile = computed(() => profileId.value === userStore.user?.userId)

// redirect bare /profile to include id
watchEffect(() => {
  if (!route.params.id && profileId.value) {
    router.replace(`/profile/${profileId.value}`)
  }
})

// read updated/skipped from query once and remove query afterwards
watchEffect(() => {
  const { updated, skipped } = route.query
  if (updated || skipped) {
    patchInfo.value = {
      updated: updated ? String(updated).split(',').filter(Boolean) : [],
      skipped: skipped ? String(skipped).split(',').filter(Boolean) : []
    }

    // remove query so alerts don't reappear on refresh
    router.replace({ path: `/profile/${profileId.value}` })
    // НЕ ставим setTimeout — алерт останется до ручного закрытия
  }
})

// fetch profile when id changes
watchEffect(async () => {
  if (!profileId.value) return

  error.value = ''
  try {
    profile.value = await userStore.fetchProfile(profileId.value)
  } catch (e) {
    profile.value = null
    error.value = e?.message || 'Ошибка при загрузке профиля'
  }
})

function goToEdit() {
  router.push(`/profile/${profileId.value}/edit`)
}

// simple local helper so page can resolve any relative URL without touching the store
function resolveUrl(path) {
  if (!path) return ''
  if (/^https?:\/\//.test(path)) return path
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')
  return apiBase + (path.startsWith('/') ? path : '/' + path)
}
</script>

<template>
  <div class="container">
    <h1 class="mb-4">Профиль</h1>

    <!-- error -->
    <p v-if="error" class="alert alert-danger">{{ error }}</p>

    <!-- success: updated fields -->
    <p v-if="patchInfo?.updated?.length" class="alert alert-success">
      <strong>Обновлено:</strong> {{ patchInfo.updated.join(', ') }}
    </p>

    <!-- warning: skipped fields -->
    <p v-if="patchInfo?.skipped?.length" class="alert alert-warning">
      <strong>Пропущено:</strong> {{ patchInfo.skipped.join(', ') }}
    </p>

        <div v-if="profile" class="card p-4 mb-4">
      <div class="row">
        <div class="col-md-8">
          <img
            v-if="profile.avatarPath"
            :src="resolveUrl(profile.avatarPath)"
            class="img-thumbnail mb-3"
            style="max-width: 150px"
            alt="avatar"
          >
          <p><strong>Имя:</strong> {{ profile.userName || 'Не указано' }}</p>
          <p><strong>Логин:</strong> {{ profile.userLogin || '—' }}</p>
          <p><strong>Email:</strong> {{ profile.userEmail || '—' }}</p>
          <p><strong>Телефон:</strong> {{ profile.userPhoneNumber || '—' }}</p>
          <p class="text-muted">Создан: {{ new Date(profile.createdAt).toLocaleDateString('ru-RU') }}</p>
          <button v-if="isOwnProfile" class="btn btn-primary" @click="goToEdit">Редактировать</button>
        </div>
      </div>
    </div>

    <div v-else class="text-muted">Загрузка...</div>

    <div v-if="profile?.ads?.length" class="mb-4">
      <h3>Объявления ({{ profile.ads.length }})</h3>
      <div class="row">
        <div v-for="ad in profile.ads" :key="ad.id" class="col-md-4 mb-3">
          <div class="card">
            <div class="card-body">
              <h5 class="card-title">{{ ad.title }}</h5>
              <p class="card-text">
                {{ ad.description ? (ad.description.length > 100 ? ad.description.substring(0, 100) + '...' : ad.description) : '' }}
              </p>
              <p class="text-muted">{{ ad.price }}₽</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="profile?.favorites?.length" class="mb-4">
      <h3>Избранное ({{ profile.favorites.length }})</h3>
      <ul class="list-group">
        <li v-for="fav in profile.favorites" :key="fav.id" class="list-group-item">
          {{ fav.ad?.title || '—' }}
        </li>
      </ul>
    </div>

    <!-- debug output: dump entire profile object -->
    <div v-if="profile" class="mt-5">
      <h3>DEBUG: raw profile</h3>
      <pre>{{ JSON.stringify(profile, null, 2) }}</pre>
    </div>
  </div>
</template>

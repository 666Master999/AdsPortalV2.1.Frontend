<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/userStore'
import { getApiBaseUrl } from '../config/apiBase'
import { timeAgo } from '../utils/formatDate'

const apiBase = getApiBaseUrl()

const props = defineProps({
  ad: Object,
  allowEdit: {
    type: Boolean,
    default: true,
  },
})

const router = useRouter()
const userStore = useUserStore()

function goToAd() {
  if (props.ad?.id) router.push(`/ads/${props.ad.id}`)
}

const priceText = computed(() => {
  const a = props.ad
  if (!a) return ''
  if (a.isNegotiable) return 'Договорная'
  const p = a.price
  if (p === undefined || p === null || p === '') return 'Бесплатно'
  return `${p} Br`
})

const cityText = computed(() => {
  const a = props.ad
  if (!a) return ''
  const district = a.district || a.District
  const city = a.city || a.City
  if (district?.name) return district.name
  if (city?.name) return city.name
  return ''
})

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
  return resolveModerationStatus(props.ad?.moderationStatus ?? props.ad?.status)
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

const isFavorite = ref(Boolean(props.ad?.isFavorite))

const canEdit = computed(() => {
  if (!props.allowEdit) return false
  const currentUserId = userStore.user?.userId || userStore.tokenUserId
  const adOwnerId = props.ad?.user?.id || props.ad?.userId
  const isOwner = currentUserId && adOwnerId && String(currentUserId) === String(adOwnerId)
  return isOwner || userStore.isAdmin
})

watch(
  () => props.ad?.isFavorite,
  value => {
    if (typeof value === 'boolean') {
      isFavorite.value = value
    }
  }
)

async function toggleFavorite() {
  const userId = userStore.user?.userId || userStore.tokenUserId
  if (!userId) return

  if (isFavorite.value) {
    await userStore.removeFavorite(userId, props.ad.id)
    isFavorite.value = false
  } else {
    await userStore.addFavorite(userId, props.ad.id)
    isFavorite.value = true
  }

  if (props.ad) {
    props.ad.isFavorite = isFavorite.value
  }
}
</script>

<template>
  <div v-if="ad" class="ad-card card h-100 border-0 rounded-4 shadow-sm overflow-hidden bg-white" @click="goToAd">
    <div class="ad-card-media position-relative bg-body-tertiary">
      <img
        v-if="ad.mainImageUrl || ad.mainImage"
        :src="apiBase + '/' + (ad.mainImageUrl || ad.mainImage)"
        class="ad-card-media-image w-100 h-100"
        :alt="ad.title ?? ''"
        @error="e => e.target.style.display = 'none'"
      />
      <div
        v-else
        class="ad-card-media-empty w-100 h-100 d-flex flex-column align-items-center justify-content-center text-secondary"
      >
        <span class="ad-card-empty-icon">📷</span>
        <span class="small mt-2">Без фото</span>
      </div>

      <div v-if="moderationStatus" class="position-absolute top-0 start-0 m-3">
        <span :class="['badge rounded-pill px-2 py-1 shadow-sm ad-card-badge', moderationStatusClass]">
          {{ moderationStatusLabel }}
        </span>
      </div>

      <button
        class="ad-card-fav position-absolute top-0 end-0 m-3 btn btn-light btn-sm rounded-circle border-0 shadow-sm d-flex align-items-center justify-content-center p-0"
        @click.stop="toggleFavorite"
      >
        <span :class="isFavorite ? 'text-danger' : 'text-secondary'" class="ad-card-fav-icon">♥</span>
      </button>
    </div>

    <div class="ad-card-body card-body d-flex flex-column px-3 px-lg-4 py-3">

      <div class="ad-card-price fw-semibold fs-4 text-primary mb-1 lh-1">{{ priceText }}</div>

      <h6 class="card-title mb-2 lh-sm fw-semibold text-truncate" :title="ad.title ?? ''">{{ ad.title }}</h6>

      <div class="ad-card-meta d-flex align-items-center gap-2 text-muted small mb-3 flex-wrap">
        <span v-if="cityText" class="d-inline-flex align-items-center gap-1">
          <span>📍</span>
          <span class="text-truncate">{{ cityText }}</span>
        </span>
        <span v-if="ad.updatedAt || ad.createdAt" class="text-secondary">·</span>
        <span>{{ ad.updatedAt ? timeAgo(ad.updatedAt) : (ad.createdAt ? timeAgo(ad.createdAt) : '') }}</span>
      </div>

      <div v-if="ad.viewsCount != null || ad.favoritesCount != null" class="d-flex gap-2 text-muted small mb-3 flex-wrap">
        <span v-if="ad.viewsCount != null" class="ad-card-stat d-inline-flex align-items-center gap-1 rounded-pill bg-body-tertiary px-2 py-1">
          <span>👁</span>
          <span>{{ ad.viewsCount }}</span>
        </span>
        <span v-if="ad.favoritesCount != null" class="ad-card-stat d-inline-flex align-items-center gap-1 rounded-pill bg-body-tertiary px-2 py-1">
          <span>♥</span>
          <span>{{ ad.favoritesCount }}</span>
        </span>
      </div>

      <div v-if="canEdit" class="mt-auto d-flex gap-2">
        <router-link
          :to="`/ads/${ad.id}/edit`"
          class="ad-card-edit btn btn-outline-secondary btn-sm rounded-pill px-3"
          @click.stop
        >
          ✏️ Редактировать
        </router-link>
      </div>

    </div>
  </div>
  <div v-else></div>
</template>

<style scoped>
.ad-card {
  cursor: pointer;
  transition: box-shadow 0.18s ease, border-color 0.18s ease, transform 0.18s ease;
}

.ad-card:hover {
  box-shadow: 0 1rem 2rem rgba(15, 23, 42, 0.10) !important;
}

.ad-card-media {
  height: 220px;
}

.ad-card-media-image {
  object-fit: cover;
}

.ad-card-media-empty {
  background: linear-gradient(180deg, rgba(248, 249, 250, 1) 0%, rgba(233, 236, 239, 1) 100%);
}

.ad-card-empty-icon {
  font-size: 2.2rem;
  line-height: 1;
}

.ad-card-badge {
  font-size: 0.7rem;
  opacity: 0.95;
}

.ad-card-fav {
  width: 36px;
  height: 36px;
  backdrop-filter: blur(10px);
}

.ad-card-fav-icon {
  font-size: 1.1rem;
  line-height: 1;
}

.ad-card-price {
  letter-spacing: -0.02em;
}

.ad-card-meta {
  min-height: 1.5rem;
}

.ad-card-stat {
  line-height: 1.1;
}

.ad-card-edit {
  letter-spacing: -0.01em;
}
</style>
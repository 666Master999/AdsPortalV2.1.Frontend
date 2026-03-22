<script setup>
import { computed } from 'vue'
import { useUserStore } from '../stores/userStore'

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122'

const props = defineProps({
  ad: Object,
})

const userStore = useUserStore()

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

const canEdit = computed(() => {
  const currentUserId = userStore.user?.userId || userStore.tokenUserId
  const adOwnerId = props.ad?.user?.id || props.ad?.userId
  const isOwner = currentUserId && adOwnerId && String(currentUserId) === String(adOwnerId)
  return isOwner || userStore.isAdmin
})
</script>

<template>
  <div class="card h-100">
    <img
      :src="ad.mainImageUrl ? apiBase + '/' + ad.mainImageUrl : 'https://via.placeholder.com/300x200'"
      class="card-img-top"
      :alt="ad.title"
      style="height: 200px; object-fit: cover"
    />
    <div class="card-body">
      <h5 class="card-title">{{ ad.title }}</h5>
      <p v-if="moderationStatus" class="mb-1">
        <span class="badge" :class="moderationStatusClass">{{ moderationStatusLabel }}</span>
      </p>
      <p class="card-text fw-bold text-primary">{{ ad.price }} ₽</p>
      <p class="card-text text-muted">{{ ad.city }}</p>
      <div class="d-flex gap-2">
        <router-link :to="`/ads/${ad.id}`" class="btn btn-outline-primary btn-sm">Подробнее</router-link>
        <router-link
          v-if="canEdit"
          :to="`/ads/${ad.id}/edit`"
          class="btn btn-sm btn-warning"
        >
          Редактировать
        </router-link>
      </div>
    </div>
  </div>
</template>
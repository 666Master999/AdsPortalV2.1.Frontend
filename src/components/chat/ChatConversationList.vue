<script setup>
const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select'])

function selectConversation(id) {
  if (!id) return
  emit('select', id)
}
</script>

<template>
  <div class="h-100 d-flex flex-column">
    <div v-if="error" class="m-3 alert alert-danger mb-0">{{ error }}</div>

    <div v-if="loading && !items.length" class="flex-grow-1 d-flex align-items-center justify-content-center text-center text-secondary py-5">
      <div>
        <div class="spinner-border text-secondary mb-3" role="status"></div>
        <div class="small">Загрузка...</div>
      </div>
    </div>

    <div v-else-if="!items.length" class="flex-grow-1 d-flex align-items-center justify-content-center text-center text-secondary px-4 py-5">
      <div>
        <div class="fw-semibold mb-1">Нет активных чатов</div>
        <div class="small">Здесь появятся разговоры по вашим объявлениям.</div>
      </div>
    </div>

    <div v-else class="flex-grow-1 overflow-auto p-2 p-lg-3" style="min-height: 0;">
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="btn w-100 text-start rounded-4 p-3 mb-2 shadow-sm"
        @click="selectConversation(item.id)"
        :style="{
          border: '1px solid',
          borderColor: item.selected ? 'rgba(13,110,253,0.8)' : 'rgba(255,255,255,1)',
          backgroundColor: item.selected ? 'rgba(13,110,253,0.08)' : 'rgba(255,255,255,1)',
          boxShadow: item.selected ? '0 0 0 3px rgba(13,110,253,0.15)' : '0 0 0 0 rgba(0,0,0,0)',
          transition: 'all 0.85s cubic-bezier(.16, .84, .44, 1)'
        }"
      >
        <div class="d-flex align-items-start gap-3">
          <div class="rounded-circle overflow-hidden flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
            <img
              v-if="item.avatarUrl"
              :src="item.avatarUrl"
              alt="ad"
              class="w-100 h-100"
              style="object-fit: cover;"
            />
            <div
              v-else
              class="w-100 h-100 d-flex align-items-center justify-content-center fw-semibold text-primary"
            >
              {{ item.initial }}
            </div>
          </div>

          <div class="flex-grow-1 min-w-0">
            <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
              <span class="fw-semibold text-truncate">{{ item.title }}</span>
              <small class="text-secondary flex-shrink-0">{{ item.timeLabel }}</small>
            </div>
            <div class="small text-secondary text-truncate">{{ item.subtitle }}</div>
            <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
              <small class="text-secondary text-truncate">{{ item.previewLabel }}</small>
              <span v-if="item.unreadCount" class="badge rounded-pill text-bg-primary flex-shrink-0">{{ item.unreadCount }}</span>
            </div>
            <div v-if="item.previewUrl" class="mt-2 rounded-3 overflow-hidden border bg-body-secondary" style="max-width: 86px; height: 48px;">
              <img :src="item.previewUrl" class="w-100 h-100" style="object-fit: cover;" alt="Preview" />
            </div>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

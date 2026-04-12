<script setup>
import { computed } from 'vue'
import { timeAgo } from '../../utils/formatDate'

const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  image: { type: String, default: '' },
  meta: { type: String, default: '' },
  date: { type: [String, Number], default: null },
  timestamp: { type: [String, Number], default: null },
  variant: { type: String, default: 'default' },
  badgeLabel: { type: String, default: '' },
  isRead: { type: Boolean, default: false },
  interactive: { type: Boolean, default: false },
  hintLabel: { type: String, default: '' },
})

const formattedDate = computed(() => {
  return props.date ? timeAgo(props.date) : ''
})

const fullDateTitle = computed(() => {
  const raw = props.timestamp ?? props.date
  if (!raw) return ''

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString()
})

const titleClass = computed(() => {
  if (props.variant === 'success') return 'text-success'
  if (props.variant === 'danger') return 'text-danger'
  return 'text-body'
})

const badgeClass = computed(() => {
  if (props.variant === 'success') return 'bg-success-subtle text-success-emphasis'
  if (props.variant === 'danger') return 'bg-danger-subtle text-danger-emphasis'
  return 'bg-secondary-subtle text-secondary-emphasis'
})

const imageAlt = computed(() => props.subtitle || props.title || 'Изображение')
</script>

<template>
  <article class="d-flex gap-3 align-items-start w-100 min-w-0">
    <img
      v-if="image"
      :src="image"
      :alt="imageAlt"
      loading="lazy"
      decoding="async"
      @error="event => { event.target.style.display = 'none' }"
      class="rounded-4 flex-shrink-0 object-fit-cover bg-body-secondary"
      style="width:4.5rem;height:4.5rem;"
    />

    <div class="flex-grow-1 min-w-0">
      <div class="d-flex align-items-start justify-content-between gap-3">
        <div class="min-w-0 flex-grow-1">
          <div class="d-flex align-items-center gap-2 flex-wrap">
            <div class="fw-semibold text-break" :class="titleClass">{{ title }}</div>
            <span v-if="badgeLabel" class="badge rounded-pill" :class="badgeClass">{{ badgeLabel }}</span>
          </div>
          <div v-if="subtitle" class="small text-body-secondary text-break mt-1">{{ subtitle }}</div>
          <div v-if="meta" class="small text-secondary text-break mt-1">{{ meta }}</div>
        </div>

        <div class="d-flex flex-column align-items-end gap-1 flex-shrink-0">
          <span v-if="!isRead" class="badge rounded-pill bg-primary-subtle text-primary-emphasis">Новое</span>
          <div class="small text-secondary text-nowrap" :title="fullDateTitle || undefined">{{ formattedDate }}</div>
        </div>
      </div>

      <div v-if="interactive" class="mt-2 d-flex align-items-center justify-content-between gap-3 small text-secondary">
        <span>{{ hintLabel || 'Нажмите, чтобы открыть' }}</span>
        <span class="text-primary fw-semibold">↗</span>
      </div>
    </div>
  </article>
</template>
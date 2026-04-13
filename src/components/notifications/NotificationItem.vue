<script setup>
import { computed, ref } from 'vue'
import { useNotificationConfig } from '../../composables/useNotificationConfig'

const props = defineProps({
  entry: { type: Object, required: true },
  compact: { type: Boolean, default: false },
  hintLabel: { type: String, default: '' },
})

const emit = defineEmits(['open', 'edit'])

const config = useNotificationConfig(() => props.entry, () => props.compact)
const isHovered = ref(false)
const isFocused = ref(false)

const uiStyles = {
  image: { width: '4.5rem', height: '4.5rem' },
  interactiveRoot: { cursor: 'pointer', transition: 'box-shadow .15s ease, background-color .15s ease' },
}

const cardClass = computed(() => {
  const isRead = Boolean(config.value.isRead)
  const variant = config.value.variant || 'default'

  const background = isRead
    ? 'bg-body'
    : variant === 'success'
      ? 'bg-success-subtle'
      : variant === 'danger'
        ? 'bg-danger-subtle'
        : 'bg-primary-subtle'

  const border = variant === 'success'
    ? 'border-success-subtle'
    : variant === 'danger'
      ? 'border-danger-subtle'
      : 'border-primary-subtle'

  return [
    'rounded-4 border shadow-sm',
    props.compact ? 'p-2' : 'p-3',
    background,
    border,
    config.value.interactive ? 'user-select-none' : '',
  ].filter(Boolean).join(' ')
})

const isRaised = computed(() => !props.compact && (isHovered.value || isFocused.value))
const notificationAriaLabel = computed(() => {
  if (!config.value.title) return 'Уведомление'
  if (config.value.action?.type === 'edit') return `Исправить объявление: ${config.value.title}`
  return `Открыть уведомление: ${config.value.title}`
})

function openNotification() {
  if (!config.value.interactive) return
  emit('open')
}

function triggerAction() {
  if (config.value.action?.type === 'edit') {
    emit('edit')
    return
  }

  emit('open')
}

function onKeydown(event) {
  if (!config.value.interactive) return
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openNotification()
}
</script>

<script>
export default { name: 'NotificationItem' }
</script>

<template>
  <div
    :class="[cardClass, isRaised ? 'shadow-lg' : '']"
    :role="config.interactive ? 'button' : undefined"
    :tabindex="config.interactive ? 0 : undefined"
    :style="config.interactive ? uiStyles.interactiveRoot : null"
    :aria-label="notificationAriaLabel"
    :title="notificationAriaLabel"
    @click="openNotification"
    @keydown="onKeydown"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
  >
    <article class="d-flex gap-3 align-items-start w-100 min-w-0">
      <img
        v-if="config.image"
        :src="config.image"
        :alt="config.imageAlt"
        loading="lazy"
        decoding="async"
        @error="event => { event.target.style.display = 'none' }"
        class="rounded-4 flex-shrink-0 object-fit-cover bg-body-secondary"
        :style="uiStyles.image"
      />

      <div class="flex-grow-1 min-w-0">
        <div class="d-flex align-items-start justify-content-between gap-3">
          <div class="min-w-0 flex-grow-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <div class="fw-semibold text-break" :class="config.titleClass">{{ config.title }}</div>
              <span v-if="config.badgeLabel" class="badge rounded-pill" :class="config.badgeClass">{{ config.badgeLabel }}</span>
            </div>
            <div v-if="config.subtitle" class="small text-body-secondary text-break mt-1">{{ config.subtitle }}</div>
            <div v-if="config.meta" class="small text-secondary text-break mt-1">{{ config.meta }}</div>
          </div>

          <div class="d-flex flex-column align-items-end gap-1 flex-shrink-0">
            <span v-if="!config.isRead" class="badge rounded-pill bg-primary-subtle text-primary-emphasis">Новое</span>
            <div class="small text-secondary text-nowrap" :title="config.fullDateTitle || undefined">{{ config.formattedDate }}</div>
          </div>
        </div>

        <div v-if="!compact && config.interactive" class="mt-2 d-flex align-items-center justify-content-between gap-3 small text-secondary">
          <span>{{ hintLabel || 'Нажмите, чтобы открыть' }}</span>
          <span class="text-primary fw-semibold">↗</span>
        </div>
      </div>
    </article>

    <div v-if="!compact && config.details.length" class="mt-3 pt-3 border-top d-grid gap-1 small text-danger">
      <div class="rounded-4 border border-danger-subtle bg-danger-subtle p-3 text-danger-emphasis">
        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
          <div class="small fw-semibold text-uppercase">Нужно исправить</div>
          <div class="small text-danger fw-semibold">Проверка полей</div>
        </div>
        <div class="d-grid gap-1">
          <div v-for="(error, index) in config.details" :key="`${error.field || 'field'}-${error.message || 'message'}-${index}`">
            <span v-if="error.field" class="fw-semibold">{{ error.field }}:</span>
            <span>{{ error.message }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-if="!compact && config.actionLabel" class="mt-3 d-flex justify-content-end">
      <button type="button" :class="config.actionButtonClass" @click.stop="triggerAction">
        {{ config.actionLabel }}
      </button>
    </div>
  </div>
</template>

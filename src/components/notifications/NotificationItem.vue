<script setup>
import { computed, ref } from 'vue'
import { resolveMediaUrl } from '../../utils/resolveMediaUrl'
import NotificationCard from './NotificationCard.vue'

const props = defineProps({
  entry: { type: Object, required: true },
})

const emit = defineEmits(['open', 'edit'])

const isHovered = ref(false)
const isFocused = ref(false)

function toText(value) {
  return String(value || '').trim()
}

function getEntryAdId(entry) {
  const value = Number(entry?.adId ?? entry?.data?.adId)
  return Number.isFinite(value) && value > 0 ? value : null
}

function getFieldErrors(value) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null

      const field = toText(item.field)
      const message = toText(item.message)
      if (!field && !message) return null

      return { field, message }
    })
    .filter(Boolean)
}

const renderers = {
  NotificationGroup(entry) {
    const count = Number(entry?.data?.count) || 0

    return {
      title: count > 1 ? `${count} уведомлений` : 'Уведомление',
      subtitle: toText(entry?.preview?.title),
      image: resolveMediaUrl(entry?.preview?.mainImagePath),
      meta: count > 1 ? `${count} уведомлений по объявлению` : '',
      details: [],
      actionLabel: '',
      action: '',
      badgeLabel: count > 1 ? 'Группа' : 'Уведомление',
      variant: 'default',
    }
  },

  AdApproved(entry) {
    const actorName = toText(entry?.data?.actorName)

    return {
      title: 'Объявление одобрено',
      subtitle: toText(entry?.preview?.title),
      image: resolveMediaUrl(entry?.preview?.mainImagePath),
      meta: actorName ? `Модератор: ${actorName}` : '',
      details: [],
      actionLabel: '',
      action: '',
      badgeLabel: 'Одобрено',
      variant: 'success',
    }
  },

  AdRejected(entry) {
    const actorName = toText(entry?.data?.actorName)
    const reason = toText(entry?.data?.reason)
    const meta = [actorName ? `Модератор: ${actorName}` : '', reason ? `Причина: ${reason}` : '']
      .filter(Boolean)
      .join(' · ')

    return {
      title: 'Объявление отклонено',
      subtitle: toText(entry?.preview?.title),
      image: resolveMediaUrl(entry?.preview?.mainImagePath),
      meta,
      details: getFieldErrors(entry?.data?.fieldErrors),
      actionLabel: getEntryAdId(entry) == null ? '' : 'Исправить',
      action: 'edit',
      badgeLabel: 'Отклонено',
      variant: 'danger',
    }
  },

  UserBanned(entry) {
    return {
      title: 'Аккаунт заблокирован',
      subtitle: toText(entry?.data?.reason),
      image: '',
      meta: '',
      details: [],
      actionLabel: '',
      action: '',
      badgeLabel: 'Блокировка',
      variant: 'danger',
    }
  },

  __default(entry) {
    return {
      title: 'Уведомление',
      subtitle: toText(entry?.preview?.title),
      image: resolveMediaUrl(entry?.preview?.mainImagePath),
      meta: entry?.type ? `Тип: ${entry.type}` : '',
      details: [],
      actionLabel: '',
      action: '',
      badgeLabel: 'Уведомление',
      variant: 'default',
    }
  },
}

function buildConfig(entry) {
  const renderer = renderers[entry?.type] || renderers.__default
  const base = renderer(entry || {})
  const timestamp = entry?.createdAt ?? null

  return {
    ...base,
    isRead: Boolean(entry?.isRead),
    date: timestamp,
    timestamp,
    interactive: entryAdId.value != null,
  }
}

const entryAdId = computed(() => getEntryAdId(props.entry))
const config = computed(() => buildConfig(props.entry))
const isInteractive = computed(() => Boolean(config.value.interactive))
const isRaised = computed(() => isHovered.value || isFocused.value)

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
    'rounded-4 border shadow-sm p-3',
    background,
    border,
    isInteractive.value ? 'user-select-none' : '',
  ].filter(Boolean).join(' ')
})

const actionButtonClass = computed(() => {
  if (config.value.action === 'edit') {
    return 'btn btn-sm btn-outline-danger rounded-pill px-3 fw-semibold'
  }

  return 'btn btn-sm btn-outline-primary rounded-pill px-3 fw-semibold'
})

const notificationAriaLabel = computed(() => {
  if (!config.value.title) return 'Уведомление'
  if (config.value.action === 'edit') return `Исправить объявление: ${config.value.title}`
  return `Открыть уведомление: ${config.value.title}`
})

function openNotification() {
  if (!isInteractive.value) return
  emit('open')
}

function triggerAction() {
  if (config.value.action === 'edit') {
    emit('edit')
    return
  }

  emit('open')
}

function onKeydown(event) {
  if (event.target !== event.currentTarget) return
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  openNotification()
}
</script>

<template>
  <div
    :class="[cardClass, isRaised ? 'shadow-lg' : '']"
    :role="isInteractive ? 'button' : undefined"
    :tabindex="isInteractive ? 0 : undefined"
    :style="isInteractive ? { cursor: 'pointer', transition: 'box-shadow .15s ease, background-color .15s ease' } : null"
    :aria-label="notificationAriaLabel"
    :title="notificationAriaLabel"
    @click="openNotification"
    @keydown="onKeydown"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
    @focusin="isFocused = true"
    @focusout="isFocused = false"
  >
    <NotificationCard
      :title="config.title"
      :subtitle="config.subtitle"
      :image="config.image"
      :meta="config.meta"
      :date="config.date"
      :timestamp="config.timestamp"
      :variant="config.variant"
      :badge-label="config.badgeLabel"
      :is-read="config.isRead"
      :interactive="isInteractive"
      hint-label="Нажмите, чтобы открыть"
    />

    <div v-if="config.details.length" class="mt-3 pt-3 border-top d-grid gap-1 small text-danger">
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

    <div v-if="config.actionLabel" class="mt-3 d-flex justify-content-end">
      <button type="button" :class="actionButtonClass" @click.stop="triggerAction">
        {{ config.actionLabel }}
      </button>
    </div>
  </div>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

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
  selectionMode: {
    type: Boolean,
    default: false,
  },
  selectedIds: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['select', 'hold', 'toggle-selection'])

const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const isMobileViewport = computed(() => viewportWidth.value < 992)
const selectedIdSet = computed(() => new Set((props.selectedIds || []).map(id => String(id))))

// resize throttle via rAF
const rafId = ref(null)
function scheduleUpdateViewportWidth() {
  if (typeof window === 'undefined') return
  if (rafId.value) return
  rafId.value = requestAnimationFrame(() => {
    viewportWidth.value = window.innerWidth || 1280
    rafId.value = null
  })
}

function updateViewportWidth() {
  if (typeof window === 'undefined') return
  viewportWidth.value = window.innerWidth || 1280
}

const holdTimerId = ref(null)
const holdPointerId = ref(null)
const holdConversationId = ref('')
const holdStartX = ref(0)
const holdStartY = ref(0)
const suppressedSelectId = ref('')

function clearHoldTimer() {
  if (!holdTimerId.value) return
  clearTimeout(holdTimerId.value)
  holdTimerId.value = null
}

function resetHoldState() {
  clearHoldTimer()
  holdPointerId.value = null
  holdConversationId.value = ''
  holdStartX.value = 0
  holdStartY.value = 0
}

function onConversationPointerDown(item, event) {
  if (!item?.id || event.pointerType === 'mouse' || event.button !== 0) return
  resetHoldState()
  holdPointerId.value = event.pointerId
  holdConversationId.value = String(item.id)
  holdStartX.value = event.clientX
  holdStartY.value = event.clientY
  holdTimerId.value = window.setTimeout(() => {
    suppressedSelectId.value = String(item.id)
    emit('hold', item)
    resetHoldState()
  }, 420)
}

function onConversationPointerMove(event) {
  if (holdPointerId.value !== event.pointerId) return
  const movedX = Math.abs(event.clientX - holdStartX.value)
  const movedY = Math.abs(event.clientY - holdStartY.value)
  if (movedX > 10 || movedY > 10) resetHoldState()
}

function onConversationPointerEnd(event) {
  if (holdPointerId.value !== event.pointerId) return
  resetHoldState()
}

function emitConversationHold(item, event) {
  const id = String(item?.id ?? '')
  if (!id) return
  event?.preventDefault?.()
  suppressedSelectId.value = id
  emit('hold', item)
}

function isConversationMarked(item) {
  const id = String(item?.id ?? '')
  if (!id) return false
  return props.selectionMode
    ? selectedIdSet.value.has(id)
    : Boolean(item?.selected)
}

function selectConversation(item) {
  const conversationId = String(item?.id ?? item ?? '')
  if (!conversationId) return
  if (suppressedSelectId.value === conversationId) {
    suppressedSelectId.value = ''
    return
  }
  if (props.selectionMode) {
    emit('toggle-selection', item)
    return
  }
  emit('select', conversationId)
}

/* lifecycle */
onMounted(() => {
  updateViewportWidth()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', scheduleUpdateViewportWidth, { passive: true })
  }
})

onBeforeUnmount(() => {
  resetHoldState()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', scheduleUpdateViewportWidth)
    if (rafId.value) {
      cancelAnimationFrame(rafId.value)
      rafId.value = null
    }
  }
})
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

    <!-- Список: слушаем touch события на контейнере -->
    <div
      v-else
      class="flex-grow-1 overflow-auto p-2 p-lg-3"
      style="min-height: 0; touch-action: pan-y;"
    >
      <button
        v-for="item in items"
        :key="item.id"
        type="button"
        class="btn w-100 text-start"
        :class="[
          'rounded-4 p-3 mb-2 shadow-sm',
        ]"
        @click="selectConversation(item)"
        @pointerdown="onConversationPointerDown(item, $event)"
        @pointermove="onConversationPointerMove"
        @pointerup="onConversationPointerEnd"
        @pointercancel="onConversationPointerEnd"
        @contextmenu="isMobileViewport ? emitConversationHold(item, $event) : null"
        :aria-current="isConversationMarked(item) ? 'true' : undefined"
        data-no-drawer-gesture="true"
        :style="{
          border: isMobileViewport ? '0' : '1px solid',
          borderBottom: isMobileViewport ? '1px solid rgba(222, 226, 230, 0.9)' : undefined,
          borderColor: isConversationMarked(item) ? 'rgba(13,110,253,0.8)' : (isMobileViewport ? 'rgba(222,226,230,0.9)' : 'rgba(255,255,255,1)'),
          backgroundColor: isConversationMarked(item)
            ? (isMobileViewport ? 'rgba(13,110,253,0.12)' : 'rgba(13,110,253,0.08)')
            : (isMobileViewport ? 'transparent' : 'rgba(255,255,255,1)'),
          boxShadow: isConversationMarked(item)
            ? (isMobileViewport ? '0 8px 20px rgba(13,110,253,0.14)' : '0 0 0 3px rgba(13,110,253,0.15)')
            : '0 0 0 0 rgba(0,0,0,0)',
          transition: 'background-color .18s ease, border-color .18s ease, box-shadow .18s ease',
          touchAction: 'manipulation'
        }"
      >
        <div class="d-flex align-items-start gap-3">
          <div
            class="position-relative rounded-4 overflow-hidden flex-shrink-0 bg-body-secondary border d-flex align-items-center justify-content-center"
            :style="{ width: isMobileViewport ? '54px' : '48px', height: isMobileViewport ? '54px' : '48px' }"
          >
            <img
              v-if="item.avatarUrl"
              :src="item.avatarUrl"
              alt="Объявление"
              class="w-100 h-100"
              style="object-fit: cover; display:block;"
              loading="lazy"
            />
            <div
              v-else
              class="w-100 h-100 d-flex align-items-center justify-content-center fw-semibold text-primary"
            >
              {{ item.initial }}
            </div>
            <div
              v-if="selectionMode"
              class="position-absolute top-0 end-0 translate-middle rounded-circle d-inline-flex align-items-center justify-content-center border border-2 border-white"
              :class="isConversationMarked(item) ? 'bg-primary text-white' : 'bg-white text-secondary'"
              :style="{ width: '22px', height: '22px', fontSize: '0.72rem', fontWeight: '700' }"
            >
              {{ isConversationMarked(item) ? '✓' : '' }}
            </div>
          </div>

          <div class="flex-grow-1" style="min-width: 0;">
            <div class="d-flex align-items-start justify-content-between gap-2 mb-1">
              <span
                class="fw-semibold text-body"
                style="display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;"
              >
                {{ item.title }}
              </span>

              <small
                class="text-secondary flex-shrink-0"
                style="white-space:nowrap; margin-left:8px;"
              >
                {{ item.timeLabel }}
              </small>
            </div>

            <div
              class="small text-body-secondary fw-medium mb-2"
              style="display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;"
            >
              {{ item.subtitle }}
            </div>

            <div class="d-flex align-items-center justify-content-between gap-2 mt-2">
              <small
                class="text-secondary flex-grow-1"
                :style="{
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: '2',
                  overflow: 'hidden',
                  whiteSpace: 'normal',
                  lineHeight: '1.2',
                  maxHeight: '2.4em',
                  fontSize: isMobileViewport ? '0.79rem' : '0.8rem'
                }"
              >
                {{ item.previewLabel }}
              </small>

              <span
                v-if="item.unreadCount"
                class="badge rounded-pill bg-primary text-white d-inline-flex align-items-center justify-content-center flex-shrink-0"
                :style="{
                  minWidth: isMobileViewport ? '28px' : '26px',
                  height: isMobileViewport ? '28px' : '26px',
                  fontSize: isMobileViewport ? '11px' : '12px',
                  padding: '0 0.45rem',
                  lineHeight: '1',
                  fontWeight: '700'
                }"
              >
                {{ item.unreadCount > 99 ? '99+' : item.unreadCount }}
              </span>
            </div>

            <div v-if="item.previewUrl" class="mt-2 rounded-3 overflow-hidden border bg-body-secondary"
                 :style="{ maxWidth: isMobileViewport ? '72px' : '86px', height: isMobileViewport ? '42px' : '48px' }">
              <img :src="item.previewUrl" class="w-100 h-100" style="object-fit: cover;" alt="Preview" loading="lazy" />
            </div>
          </div>
        </div>
      </button>
    </div>
  </div>
</template>

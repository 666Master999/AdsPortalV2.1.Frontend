<script setup>
import { computed, ref, onUnmounted } from 'vue'
import { useLocations } from '../composables/useLocations'

const props = defineProps({
  selected: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Поиск города, области...' },
  disabled: { type: Boolean, default: false },
  debounceMs: { type: Number, default: 600 },
})

const emit = defineEmits(['select'])

const { searchLocations, isLocationSelected } = useLocations()

const query = ref('')
const results = ref([])
const quickSuggestions = ref([])
const isOpen = ref(false)
const loading = ref(false)
const quickLoading = ref(false)
const hasSearched = ref(false)
const isFocused = ref(false)
const quickLoaded = ref(false)

let timer = null
let controller = null
let activeRequestId = 0

const TYPE_ICONS = { region: '🗺️', city: '🏙️', district: '📍', preset: '📍' }
const TYPE_LABELS = { region: 'область', city: 'город', district: 'район' }

const trimmedQuery = computed(() => query.value.trim())
const isQuickMode = computed(() => !trimmedQuery.value)
const visibleItems = computed(() => (isQuickMode.value ? quickSuggestions.value : results.value))

function clearTimer() {
  if (!timer) return
  clearTimeout(timer)
  timer = null
}

function resetSearchState() {
  if (controller) controller.abort()
  activeRequestId += 1
  loading.value = false
  controller = null
  results.value = []
  hasSearched.value = false
}

function formatLabel(item) {
  if (!item) return ''
  if (item.type === 'preset') return item.label || item.name || ''
  return item.label || `${item.name || ''} (${TYPE_LABELS[item.type] || item.type || 'локация'})`
}

function pickExactLocation(items, expectedName) {
  const target = String(expectedName || '').trim().toLowerCase()
  if (!target) return null
  return items.find(item => String(item.name || '').trim().toLowerCase() === target) || items[0] || null
}

async function loadQuickSuggestions() {
  if (quickLoaded.value || quickLoading.value) return

  quickLoading.value = true
  try {
    const [minskResults, minskRegionResults] = await Promise.all([
      searchLocations('Минск'),
      searchLocations('Минская область'),
    ])

    const quick = [{ type: 'preset', id: 'all', name: 'Вся Беларусь', label: 'Вся Беларусь' }]
    const minsk = pickExactLocation(minskResults, 'Минск')
    const minskRegion = pickExactLocation(minskRegionResults, 'Минская область')

    if (minsk) quick.push(minsk)
    if (minskRegion) quick.push(minskRegion)

    quickSuggestions.value = quick
    quickLoaded.value = true
  } catch {
    quickSuggestions.value = [{ type: 'preset', id: 'all', name: 'Вся Беларусь', label: 'Вся Беларусь' }]
    quickLoaded.value = true
  } finally {
    quickLoading.value = false
    if (isFocused.value && !trimmedQuery.value) {
      isOpen.value = true
    }
  }
}

function openQuickSuggestions() {
  if (props.disabled) return
  isOpen.value = true
  void loadQuickSuggestions()
}

function onInput() {
  clearTimer()
  const value = trimmedQuery.value
  if (!value) {
    resetSearchState()
    if (isFocused.value) {
      openQuickSuggestions()
    } else {
      isOpen.value = false
    }
    return
  }

  timer = setTimeout(() => {
    timer = null
    void doSearch(value)
  }, props.debounceMs)
}

async function doSearch(searchValue) {
  if (!searchValue || props.disabled) return

  if (controller) controller.abort()
  controller = new AbortController()

  const requestId = ++activeRequestId
  loading.value = true
  hasSearched.value = true

  try {
    const nextResults = await searchLocations(searchValue, controller.signal)
    if (requestId !== activeRequestId) return
    results.value = Array.isArray(nextResults) ? nextResults : []
    isOpen.value = true
  } catch (error) {
    if (requestId !== activeRequestId || error?.name === 'AbortError') return
    results.value = []
    isOpen.value = true
  } finally {
    if (requestId === activeRequestId) {
      loading.value = false
      controller = null
    }
  }
}

function isAlreadySelected(item) {
  return item?.type === 'preset' ? false : isLocationSelected(props.selected, item)
}

function select(item) {
    if (props.disabled) return

  if (isAlreadySelected(item)) {
    query.value = ''
    resetSearchState()
    return
  }

  emit('select', item)
  query.value = ''
  resetSearchState()
}

function onFocus() {
  isFocused.value = true
  if (!trimmedQuery.value) {
    openQuickSuggestions()
    return
  }
  if (results.value.length || loading.value || hasSearched.value) {
    isOpen.value = true
  }
}

function onBlur() {
  isFocused.value = false
  setTimeout(() => {
    isOpen.value = false
  }, 150)
}

onUnmounted(() => {
  clearTimer()
  resetSearchState()
})
</script>

<template>
  <div class="position-relative">
    <div class="input-group input-group-sm">
      <span class="input-group-text bg-white border-end-0 pe-1">🔍</span>
      <input
        v-model="query"
        type="search"
        class="form-control border-start-0 ps-1"
        :placeholder="placeholder"
        :disabled="props.disabled"
        autocomplete="off"
        @input="onInput"
        @blur="onBlur"
        @focus="onFocus"
      />
      <span v-if="loading || quickLoading" class="input-group-text bg-white">
        <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
      </span>
    </div>

    <ul
      v-if="isOpen"
      class="position-absolute w-100 list-unstyled bg-white border rounded-3 shadow-sm mt-1 mb-0 overflow-auto"
      style="max-height: 220px; z-index: 1050;"
    >
      <li v-if="isQuickMode && quickLoading" class="px-3 py-2 small text-secondary">Загрузка...</li>
      <li v-else-if="!visibleItems.length" class="px-3 py-2 small text-secondary">Ничего не найдено</li>
      <li v-for="item in visibleItems" :key="`${item.type}-${item.id}`">
        <button
          type="button"
          class="d-flex align-items-center w-100 text-start px-3 py-2 border-0 bg-transparent"
          :class="{ 'text-muted': isAlreadySelected(item) }"
          :disabled="props.disabled"
          @mousedown.prevent="select(item)"
        >
          <span class="me-2 lh-1">{{ TYPE_ICONS[item.type] || '📍' }}</span>
          <span class="flex-grow-1 small">{{ formatLabel(item) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
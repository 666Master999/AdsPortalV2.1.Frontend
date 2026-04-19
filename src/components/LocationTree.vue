<script setup>
import { computed, onMounted, ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useLocations, normalizeLocationIdList } from '../composables/useLocations'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const { tree, loadTree, getLocationPath, getLocationPathLabel, getLocationTypeLabel } = useLocations()

const MAX_LOCATIONS = 10
const isLoading = ref(false)
const isOpen = ref(false)
const overlayRef = ref(null)
const locationSearchText = ref('')
const expandedRegionIds = ref([])
const expandedCityIds = ref([])

const selectedIds = computed(() => normalizeLocationIdList(props.modelValue).slice(0, MAX_LOCATIONS))
const selectedIdSet = computed(() => new Set(selectedIds.value))

// Local, pending selection while modal is open. Changes here are not applied
// until user clicks Apply. Initialized when modal opens.
const pendingSelection = ref([])
const pendingSelectionSet = computed(() => new Set(pendingSelection.value))

// Root element ref for the teleported modal wrapper
const modalRoot = ref(null)

function pendingIsSelected(id) {
  return pendingSelectionSet.value.has(id)
}
// saved body styles to restore after modal closes
let _savedBodyOverflow = null
let _savedBodyPaddingRight = null
const regions = computed(() => Array.isArray(tree.value) ? tree.value : [])
const normalizedSearchText = computed(() => String(locationSearchText.value || '').trim().toLowerCase())
const isSearchActive = computed(() => Boolean(normalizedSearchText.value))



const selectedLocations = computed(() => selectedIds.value.map(id => ({
  id,
  label: getLocationPathLabel(id) || `Локация #${id}`,
  path: getLocationPath(id),
})))

// Count of currently pending selections and a localized label
const selectedCount = computed(() => pendingSelection.value.length)
const selectedCountLabel = computed(() => `Выбрано: ${selectedCount.value} ${pluralize(selectedCount.value, 'локация', 'локации', 'локаций')}`)

const locationSummaryLabel = computed(() => {
  if (!selectedIds.value.length) return 'Во всех областях'

  if (selectedIds.value.length === 1) {
    return selectedLocations.value[0]?.label || 'Во всех областях'
  }

  const regionNames = []
  let cityCount = 0
  let districtCount = 0

  for (const item of selectedLocations.value) {
    const regionName = item.path?.[0]?.name || ''
    const level = item.path?.length || 0

    if (regionName && !regionNames.includes(regionName)) {
      regionNames.push(regionName)
    }

    if (level === 2) cityCount += 1
    if (level === 3) districtCount += 1
  }

  if (regionNames.length === 1) {
    const parts = [regionNames[0]]
    if (cityCount) parts.push(`${cityCount} ${pluralize(cityCount, 'город', 'города', 'городов')}`)
    if (districtCount) parts.push(`${districtCount} ${pluralize(districtCount, 'район', 'района', 'районов')}`)
    return parts.join(', ')
  }

  const parts = [`${regionNames.length} ${pluralize(regionNames.length, 'область', 'области', 'областей')}`]
  if (cityCount) parts.push(`${cityCount} ${pluralize(cityCount, 'город', 'города', 'городов')}`)
  if (districtCount) parts.push(`${districtCount} ${pluralize(districtCount, 'район', 'района', 'районов')}`)
  return parts.join(', ')
})

const filteredRegions = computed(() => filterBranchList(regions.value, normalizedSearchText.value))

// Currently active region (null => all regions). Declared here to avoid
function disableBackgroundPointerEvents() {
  if (typeof document === 'undefined' || !document.body) return
  try {
    document.body.classList.add('modal-open')
    const root = modalRoot?.value || null
    const children = Array.from(document.body.children || [])
    children.forEach(el => {
      // keep the modal root interactive
      if (root && el === root) return
      // skip non-interactive tags
      const tag = (el.tagName || '').toUpperCase()
      if (tag === 'SCRIPT' || tag === 'STYLE') return
      el.dataset.prevPointer = el.style.pointerEvents || ''
      el.style.pointerEvents = 'none'
    })
  } catch (e) {
    // ignore
  }
}

function restoreBackgroundPointerEvents() {
  if (typeof document === 'undefined') return
  try {
    document.body.classList.remove('modal-open')
    document.querySelectorAll('[data-prev-pointer]').forEach(el => {
      el.style.pointerEvents = el.dataset.prevPointer || ''
      delete el.dataset.prevPointer
    })
  } catch (e) {
    // ignore
  }
}

// runtime errors when template references `activeRegionId`.
const activeRegionId = ref(null)

// Regions to display in the main tree area. When search is active we use the
// filtered tree; otherwise we show either all regions or only the selected one.
const displayRegions = computed(() => {
  if (isSearchActive.value) {
    return filteredRegions.value.filter(r => (activeRegionId.value == null ? true : r.id === activeRegionId.value))
  }
  return activeRegionId.value == null ? regions.value : regions.value.filter(r => r.id === activeRegionId.value)
})

const searchResults = computed(() => {
  if (!isSearchActive.value) return []
  const q = normalizedSearchText.value
  const out = []

  for (const region of regions.value) {
    for (const city of region.children || []) {
      if (normalizeQuery(city.name).includes(q)) {
        out.push({ id: city.id, name: `${city.name}, ${region.name}`, type: city.type })
      }

      for (const district of city.children || []) {
        if (normalizeQuery(district.name).includes(q)) {
          out.push({ id: district.id, name: `${district.name}, ${city.name}`, type: district.type })
        }
      }
    }
  }

  return out
})

function pluralize(value, singular, few, many) {
  const normalizedValue = Math.abs(Number(value) || 0)
  const mod10 = normalizedValue % 10
  const mod100 = normalizedValue % 100

  if (mod10 === 1 && mod100 !== 11) return singular
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase()
}

function filterBranchList(nodes, query) {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return nodes

  const output = []

  for (const node of Array.isArray(nodes) ? nodes : []) {
    const children = filterBranchList(node.children || [], normalizedQuery)
    const matches = normalizeQuery(node.name).includes(normalizedQuery)
    if (matches) {
      output.push({
        ...node,
        children: node.children || [],
      })
      continue
    }

    if (children.length) {
      output.push({
        ...node,
        children,
      })
    }
  }

  return output
}

function updateSelection(next) {
  emit('update:modelValue', normalizeLocationIdList(next).slice(0, MAX_LOCATIONS))
}

function isSelected(id) {
  return selectedIdSet.value.has(id)
}

function isRegionExpanded(id) {
  return expandedRegionIds.value.includes(id)
}

function isCityExpanded(id) {
  return expandedCityIds.value.includes(id)
}

function toggleExpanded(collectionRef, id) {
  const items = Array.isArray(collectionRef.value) ? collectionRef.value : []
  if (items.includes(id)) {
    // replace array to ensure reactivity
    collectionRef.value = items.filter(x => x !== id)
    return false
  }

  collectionRef.value = [...items, id]
  return true
}

function expandPath(id) {
  const path = getLocationPath(id)
  const regionId = path[0]?.id
  const cityId = path[1]?.id

  if (regionId != null && !expandedRegionIds.value.includes(regionId)) {
    expandedRegionIds.value.push(regionId)
  }

  if (cityId != null && !expandedCityIds.value.includes(cityId)) {
    expandedCityIds.value.push(cityId)
  }
}

function toggleSelection(id) {
  if (props.disabled) return

  const next = new Set(pendingSelection.value)
  if (next.has(id)) {
    next.delete(id)
  } else if (next.size >= MAX_LOCATIONS) {
    return
  } else {
    next.add(id)
    expandPath(id)
  }

  pendingSelection.value = [...next]
}

function selectRegion(id) {
  // Set active region for browsing/searching; do NOT commit selection.
  activeRegionId.value = id
  // ensure the region is expanded for browsing
  if (id != null && !expandedRegionIds.value.includes(id)) {
    expandedRegionIds.value = [...expandedRegionIds.value, id]
  }
}

function isRegionSelected(region) {
  const regionId = region?.id ?? region
  for (const id of pendingSelection.value || []) {
    const path = getLocationPath(id) || []
    if (path[0]?.id === regionId) return true
  }
  return false
}

function clearSelection() {
  if (props.disabled || !pendingSelection.value.length) return
  expandedRegionIds.value = []
  expandedCityIds.value = []
  pendingSelection.value = []
}

function commitSelection() {
  updateSelection(pendingSelection.value)
  isOpen.value = false
}

function cancelSelection() {
  // reset pending and close without emitting
  pendingSelection.value = normalizeLocationIdList(props.modelValue).slice(0, MAX_LOCATIONS)
  isOpen.value = false
}

watch(
  selectedIds,
  (ids) => {
    if (!ids.length) {
      expandedRegionIds.value = []
      expandedCityIds.value = []
      return
    }

    const nextRegionIds = new Set(expandedRegionIds.value)
    const nextCityIds = new Set(expandedCityIds.value)

    for (const id of ids) {
      const path = getLocationPath(id)
      if (path[0]?.id != null) nextRegionIds.add(path[0].id)
      if (path[1]?.id != null) nextCityIds.add(path[1].id)
    }

    expandedRegionIds.value = [...nextRegionIds]
    expandedCityIds.value = [...nextCityIds]
  },
  { immediate: true }
)

onMounted(async () => {
  isLoading.value = true
  try {
    await loadTree()
  } finally {
    isLoading.value = false
  }
})

function onEscape(e) {
  if (e.key === 'Escape') isOpen.value = false
}

watch(isOpen, (val) => {
  if (val) {
    // initialize pending selection from applied modelValue when opening
    pendingSelection.value = normalizeLocationIdList(props.modelValue).slice(0, MAX_LOCATIONS)
    nextTick(() => {
      overlayRef.value?.focus()
      try { disableBackgroundPointerEvents() } catch (e) { /* ignore */ }
    })
    window.addEventListener('keydown', onEscape)
    try {
      // prevent body scroll / layout shift while modal open
      if (typeof document !== 'undefined' && document?.body) {
        // preserve original values to restore later
        _savedBodyOverflow = document.body.style.overflow
        _savedBodyPaddingRight = document.body.style.paddingRight
        // compensate scrollbar width to avoid layout shift
        try {
          const sb = window.innerWidth - document.documentElement.clientWidth
          if (sb > 0) document.body.style.paddingRight = `${sb}px`
        } catch (e) {
          // ignore measurement errors
        }
        document.body.style.overflow = 'hidden'
      }
    } catch (e) {
      // ignore
    }
  } else {
    window.removeEventListener('keydown', onEscape)
    try {
      if (typeof document !== 'undefined' && document?.body) {
        // restore previously saved values (if any)
        document.body.style.overflow = _savedBodyOverflow ?? ''
        document.body.style.paddingRight = _savedBodyPaddingRight ?? ''
        _savedBodyOverflow = null
        _savedBodyPaddingRight = null
        try { restoreBackgroundPointerEvents() } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // ignore
    }
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape)
  try {
    if (typeof document !== 'undefined' && document?.body) {
      document.body.style.overflow = _savedBodyOverflow ?? ''
      document.body.style.paddingRight = _savedBodyPaddingRight ?? ''
      try { restoreBackgroundPointerEvents() } catch (e) { /* ignore */ }
    }
  } catch (e) {
    // ignore
  }
})
</script>

<template>
  <div class="d-grid gap-3">
    <button
      type="button"
      class="btn btn-light border rounded-4 px-3 py-3 d-flex align-items-center justify-content-between gap-3 text-start"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <span class="d-grid gap-1 flex-grow-1">
        <span class="small text-uppercase text-secondary fw-semibold">Локации</span>
        <span class="fw-semibold">{{ locationSummaryLabel }}</span>
        <span class="small text-secondary">Поиск и выбор внутри дерева</span>
      </span>
      <span class="badge rounded-pill text-bg-light border text-secondary flex-shrink-0">{{ selectedIds.length || 'Все' }}</span>
    </button>

    <Teleport to="body">
      <div ref="modalRoot" v-if="isOpen" class="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-start justify-content-center p-3" style="z-index:2000;">
        <div class="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-50" style="z-index:2000;" @click="isOpen = false"></div>

        <div ref="overlayRef" tabindex="-1" class="bg-body rounded-4 border p-3" style="max-width:920px;width:100%;max-height:calc(100vh - 4rem);overflow:auto;z-index:2001;">
        <div class="d-flex align-items-start justify-content-between mb-3">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold">Выбор региона</div>
            <div class="fw-semibold">{{ locationSummaryLabel }}</div>
            <div class="small text-secondary">Поиск и выбор внутри дерева</div>
          </div>
          <button type="button" class="btn btn-close" aria-label="Закрыть" @click="isOpen = false"></button>
        </div>

        <div class="mb-2">
          <div class="d-flex gap-2 flex-wrap overflow-auto pb-2">
            <button
              type="button"
              class="btn btn-sm"
              :class="activeRegionId == null ? 'btn-primary' : 'btn-outline-secondary'"
              :aria-pressed="activeRegionId == null"
              @click="selectRegion(null)"
            >
              Вся Беларусь
            </button>

            <button
              v-for="r in regions"
              :key="r.id"
              type="button"
              class="btn btn-sm"
              :class="(activeRegionId === r.id || isRegionSelected(r)) ? 'btn-primary' : 'btn-outline-secondary'"
              :aria-pressed="(activeRegionId === r.id || isRegionSelected(r))"
              @click="selectRegion(r.id)"
            >
              {{ r.name }}
            </button>
          </div>

          <div class="d-flex flex-column flex-sm-row gap-2 align-items-stretch">
            <div class="input-group">
              <span class="input-group-text bg-white border-end-0"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.521 3C6.36727 3 3 6.36727 3 10.521C3 14.6747 6.36727 18.042 10.521 18.042C12.24 18.042 13.8243 17.4653 15.0909 16.4948L19.5961 21L21 19.5961L16.4949 15.0909C17.4653 13.8243 18.042 12.24 18.042 10.521C18.042 6.36727 14.6747 3 10.521 3ZM5.0056 10.521C5.0056 7.47493 7.47493 5.0056 10.521 5.0056C13.5671 5.0056 16.0364 7.47493 16.0364 10.521C16.0364 13.5671 13.5671 16.0364 10.521 16.0364C7.47493 16.0364 5.0056 13.5671 5.0056 10.521Z" fill="currentColor"></path></svg></span>
              <input
                v-model="locationSearchText"
                type="search"
                class="form-control rounded-pill border-start-0"
                placeholder="Введите город"
              />
            </div>

            <button type="button" class="btn btn-outline-secondary rounded-pill px-3" :disabled="disabled || !pendingSelection.length" @click="clearSelection">
              Очистить
            </button>
          </div>
        </div>

        <div class="small text-secondary mt-2">
          Можно выбрать до {{ MAX_LOCATIONS }} локаций. Дерево раскрывается по веткам, без лишней ширины.
        </div>

        <div v-if="isLoading" class="small text-secondary">Загрузка локаций...</div>

        <div v-else-if="isSearchActive && activeRegionId == null">
          <div v-if="!searchResults.length" class="small text-secondary">Ничего не найдено.</div>

          <div v-else class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-2 mt-2">
            <div class="col" v-for="item in searchResults" :key="item.id">
              <label :for="`loc-${item.id}`" class="rounded-3 bg-white p-2 h-100 d-flex align-items-center justify-content-between gap-2 mb-0">
                <div class="d-flex align-items-center gap-2">
                  <input :id="`loc-${item.id}`" class="form-check-input me-2" type="checkbox" :checked="pendingIsSelected(item.id)" @change="toggleSelection(item.id)" />
                  <div>
                    <div class="fw-semibold">{{ item.name }}</div>
                    <div class="small text-secondary">{{ getLocationTypeLabel(item.type) || '' }}</div>
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div v-else-if="activeRegionId == null" class="small text-secondary mb-2">
          Выберите область сверху или используйте поиск для поиска города/района.
        </div>

          <div v-else class="d-grid gap-2 mt-2">
          <div v-for="region in displayRegions" :key="region.id" class="rounded-4 border bg-white overflow-hidden">
            <div class="d-flex align-items-center gap-2 px-3 py-2">
              <button
                v-if="region.children?.length"
                type="button"
                class="btn btn-sm btn-link p-0 text-secondary text-decoration-none flex-shrink-0"
                @click="toggleExpanded(expandedRegionIds, region.id)"
                :aria-expanded="isRegionExpanded(region.id) || isSearchActive"
                :aria-controls="`region-children-${region.id}`"
                :aria-label="(isRegionExpanded(region.id) || isSearchActive) ? `Свернуть ${region.name}` : `Развернуть ${region.name}`"
              >
                {{ isRegionExpanded(region.id) || isSearchActive ? '▾' : '▸' }}
              </button>

              <label :for="`loc-${region.id}`" class="d-flex align-items-center gap-3 flex-grow-1 mb-0">
                <input
                  :id="`loc-${region.id}`"
                  class="form-check-input me-2"
                  type="checkbox"
                  :checked="pendingIsSelected(region.id)"
                  :disabled="disabled"
                  @change="toggleSelection(region.id)"
                />

                <div class="flex-grow-1">
                  <div class="fw-semibold text-body">{{ region.name }}</div>
                  <div class="small text-secondary">{{ getLocationTypeLabel(region.type) || 'Область' }}</div>
                </div>
              </label>
            </div>

            <div v-show="isRegionExpanded(region.id) || isSearchActive" :id="`region-children-${region.id}`" class="border-top bg-body-tertiary ps-3 pe-3 py-2 ms-3">
              <div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-2">
                <div class="col" v-for="city in region.children || []" :key="city.id">
                  <div class="rounded-3 bg-white p-2 h-100 d-flex flex-column">
                    <div class="d-flex align-items-center gap-2">
                            <button
                              v-if="city.children?.length"
                              type="button"
                              class="btn btn-sm btn-link p-0 text-secondary text-decoration-none flex-shrink-0"
                              @click="toggleExpanded(expandedCityIds, city.id)"
                              :aria-expanded="isCityExpanded(city.id) || isSearchActive"
                              :aria-controls="`city-children-${city.id}`"
                              :aria-label="(isCityExpanded(city.id) || isSearchActive) ? `Свернуть ${city.name}` : `Развернуть ${city.name}`"
                            >
                              {{ isCityExpanded(city.id) || isSearchActive ? '▾' : '▸' }}
                            </button>
                            <label :for="`loc-${city.id}`" class="d-flex align-items-center gap-3 flex-grow-1 mb-0">
                              <input
                                :id="`loc-${city.id}`"
                                class="form-check-input me-2"
                                type="checkbox"
                                :checked="pendingIsSelected(city.id)"
                                :disabled="disabled"
                                @change="toggleSelection(city.id)"
                              />

                              <div class="flex-grow-1">
                                <div class="fw-semibold text-body">{{ city.name }}</div>
                                <div class="small text-secondary">{{ getLocationTypeLabel(city.type) || 'Город' }}</div>
                              </div>
                            </label>
                    </div>

                    <div v-show="isCityExpanded(city.id) || isSearchActive" :id="`city-children-${city.id}`" class="mt-2">
                        <div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-2">
                        <div class="col" v-for="district in city.children || []" :key="district.id">
                          <label :for="`loc-${district.id}`" class="rounded-3 bg-white p-2 h-100 d-flex align-items-center justify-content-between gap-2 mb-0">
                            <div class="d-flex align-items-center gap-2">
                              <input
                                :id="`loc-${district.id}`"
                                class="form-check-input me-2"
                                type="checkbox"
                                :checked="pendingIsSelected(district.id)"
                                :disabled="disabled"
                                @change="toggleSelection(district.id)"
                              />

                              <div>
                                <div class="fw-semibold text-body d-block">{{ district.name }}</div>
                                <div class="small text-secondary">{{ getLocationTypeLabel(district.type) || 'Район' }}</div>
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="!region.children?.length" class="small text-secondary px-1 pb-1">
                У этой области нет городов.
              </div>
            </div>
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center gap-2 mt-3 pt-3 border-top position-sticky bottom-0 bg-white" style="z-index:2002">
          <div class="small text-secondary">{{ selectedCountLabel }}</div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-light border rounded-pill" @click="cancelSelection">Отмена</button>
            <button type="button" class="btn btn-primary rounded-pill" :disabled="selectedCount === 0" @click="commitSelection">Применить</button>
          </div>
        </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAdsList } from '../composables/useAdsList'
import { createGestureManager } from '../composables/useGestureManager'
import AdCard from '../components/AdCard.vue'
import FilterForm from '../components/FilterForm.vue'
import Pagination from '../components/Pagination.vue'

const router = useRouter()
const mobileFiltersGestureManager = createGestureManager()

const HOME_SORT_OPTIONS = [
  { value: '', label: 'По умолчанию' },
  { value: '-relevance', label: 'По релевантности', requiresSearch: true },
  { value: '-createdAt', label: 'Сначала новые' },
  { value: 'createdAt', label: 'Сначала старые' },
  { value: '-price', label: 'Дороже' },
  { value: 'price', label: 'Дешевле' },
  { value: '-views', label: 'Популярные' },
  { value: 'views', label: 'Сначала менее популярные' },
]

const {
  items,
  loading,
  isInitialLoading,
  error,
  page,
  pageSize,
  totalPages,
  totalCount,
  categoryView,
  sortKey,
  searchText,
  selectedLocationIds,
  filterState,
  baseFilterState,
  breadcrumbs,
  categoryTitle,
  filters,
  categoryOptions,
  children,
  hasCategoryView,
  hasCategoryFilters,
  hasMore,
  isCursorMode,
  adsCountLabel,
  isPaginationVisible,
  setPage,
  setPageSize,
  setSort,
  loadNext,
  applyFilters,
  resetFilters,
} = useAdsList()

const isMobileFiltersOpen = ref(false)
const mobileFiltersProgress = ref(0)
const isMobileFiltersGestureActive = ref(false)
const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)
const isMobileViewport = computed(() => viewportWidth.value < 1200)
const mobileFiltersWidth = computed(() => Math.min(Math.round(viewportWidth.value * 0.92), 420))
const currentCategoryId = computed(() => String(categoryView.value?.category?.id ?? ''))
const visibleSortOptions = computed(() => HOME_SORT_OPTIONS.filter(option => !option.requiresSearch || searchText.value))
const quickCategoryLinks = computed(() => {
  const source = children.value.length
    ? children.value.map(child => ({
        id: child.id,
        label: child.name,
        to: `/category/${child.id}`,
      }))
    : categoryOptions.value.map(option => ({
        id: option.id,
        label: option.name,
        to: `/category/${option.id}`,
      }))

  return source.slice(0, 8)
})
const heroTitle = computed(() => hasCategoryView.value ? categoryTitle.value : 'Живая лента объявлений')
const feedTitle = computed(() => hasCategoryView.value ? `Новое в разделе ${categoryTitle.value}` : 'Свежие объявления')
const pageIntroText = computed(() => {
  if (hasCategoryView.value) {
    return hasCategoryFilters.value
      ? 'Смотрите актуальные объявления в выбранном разделе и уточняйте ленту только когда это действительно нужно.'
      : 'Раздел уже открыт. Здесь можно просто листать свежие предложения или мягко сузить выдачу поиском и географией.'
  }

  return 'Открывайте ленту как контентный marketplace: смотрите новые предложения сразу, а поиск и фильтры подключайте по ситуации.'
})
const filtersButtonLabel = computed(() => {
  if (!activeFilterCount.value) return 'Фильтры'
  return `Фильтры · ${activeFilterCount.value}`
})
const visibleCategoryLinks = computed(() => quickCategoryLinks.value.slice(0, 6))

function pluralize(value, singular, few, many) {
  const normalizedValue = Math.abs(Number(value) || 0)
  const mod10 = normalizedValue % 10
  const mod100 = normalizedValue % 100

  if (mod10 === 1 && mod100 !== 11) return singular
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function hasMeaningfulFilterValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return Object.values(value).some(hasMeaningfulFilterValue)
  return value !== null && value !== undefined && String(value).trim() !== ''
}

const activeDynamicFilterCount = computed(() => {
  const values = filterState.value && typeof filterState.value === 'object'
    ? Object.values(filterState.value)
    : []

  return values.reduce((count, value) => count + (hasMeaningfulFilterValue(value) ? 1 : 0), 0)
})

const activeBaseFilterCount = computed(() => {
  const baseFilters = baseFilterState.value && typeof baseFilterState.value === 'object'
    ? baseFilterState.value
    : {}

  let count = 0
  if (baseFilters.includeChildren === true) count += 1
  if (hasMeaningfulFilterValue(baseFilters.priceFrom)) count += 1
  if (hasMeaningfulFilterValue(baseFilters.priceTo)) count += 1
  if (hasMeaningfulFilterValue(baseFilters.dateFrom)) count += 1
  if (hasMeaningfulFilterValue(baseFilters.dateTo)) count += 1
  return count
})

const activeFilterCount = computed(() => (
  activeDynamicFilterCount.value
  + activeBaseFilterCount.value
  + (selectedLocationIds.value.length ? 1 : 0)
))

const activeFilterCountLabel = computed(() => {
  if (!activeFilterCount.value) return 'Без ограничений'
  return `${activeFilterCount.value} ${pluralize(activeFilterCount.value, 'фильтр', 'фильтра', 'фильтров')}`
})

const selectedLocationCountLabel = computed(() => {
  if (!selectedLocationIds.value.length) return 'Все локации'
  return `${selectedLocationIds.value.length} ${pluralize(selectedLocationIds.value.length, 'локация', 'локации', 'локаций')}`
})

const mobileFiltersShellStyle = computed(() => ({
  zIndex: 1050,
  pointerEvents: mobileFiltersProgress.value > 0 || isMobileFiltersGestureActive.value ? 'auto' : 'none',
}))
const mobileFiltersOverlayStyle = computed(() => ({
  opacity: mobileFiltersProgress.value,
  pointerEvents: mobileFiltersProgress.value > 0 ? 'auto' : 'none',
  transition: isMobileFiltersGestureActive.value ? 'none' : 'opacity 220ms ease',
}))
const mobileFiltersPanelStyle = computed(() => ({
  width: `${mobileFiltersWidth.value}px`,
  transform: `translateX(${Math.round((mobileFiltersProgress.value - 1) * mobileFiltersWidth.value)}px)`,
  transition: isMobileFiltersGestureActive.value ? 'none' : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
  pointerEvents: mobileFiltersProgress.value > 0 ? 'auto' : 'none',
  touchAction: 'pan-y',
}))
const loadMoreTrigger = ref(null)

let loadMoreObserver = null

watch(isMobileViewport, (mobile) => {
  if (mobile) return
  closeMobileFilters()
})

function updateViewportWidth() {
  if (typeof window === 'undefined') return
  viewportWidth.value = window.innerWidth || 1280
}

function disconnectLoadMoreObserver() {
  if (loadMoreObserver) {
    loadMoreObserver.disconnect()
    loadMoreObserver = null
  }
}

function syncLoadMoreObserver() {
  disconnectLoadMoreObserver()

  if (!isCursorMode.value || !hasMore.value || loading.value) return
  if (!loadMoreTrigger.value || typeof IntersectionObserver === 'undefined') return

  loadMoreObserver = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) {
      void loadNext()
    }
  }, {
    rootMargin: '300px 0px',
  })

  loadMoreObserver.observe(loadMoreTrigger.value)
}

watch([isCursorMode, hasMore, loading], () => {
  syncLoadMoreObserver()
}, { flush: 'post' })

function openMobileFilters() {
  isMobileFiltersOpen.value = true
  mobileFiltersProgress.value = 1
}

function closeMobileFilters() {
  isMobileFiltersOpen.value = false
  mobileFiltersProgress.value = 0
  isMobileFiltersGestureActive.value = false
}

async function applyMobileFilters() {
  await applyFilters()
  closeMobileFilters()
}

function clearSearchText() {
  if (!searchText.value) return
  searchText.value = ''
}

function handleCategorySelection(categoryId) {
  const nextCategoryId = String(categoryId ?? '').trim()
  const currentCategoryId = String(categoryView.value?.category?.id ?? '')
  if (nextCategoryId === currentCategoryId) return

  void router.push(nextCategoryId ? `/category/${nextCategoryId}` : '/')
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function isFiltersGestureInteractiveTarget(target) {
  return Boolean(target?.closest?.('button, a, input, textarea, label, select, option, [role="button"], [data-no-drawer-gesture]'))
}

function getHomeGestureSurface(target) {
  return String(target?.closest?.('[data-home-gesture-surface]')?.getAttribute('data-home-gesture-surface') || '')
}

function handleHomeGesturePointerDown(event) {
  mobileFiltersGestureManager.onPointerDown(event)
}

function handleHomeGesturePointerMove(event) {
  mobileFiltersGestureManager.onPointerMove(event)
}

function handleHomeGesturePointerUp(event) {
  mobileFiltersGestureManager.onPointerUp(event)
}

function handleHomeGesturePointerCancel(event) {
  mobileFiltersGestureManager.onPointerCancel(event)
}

const unregisterMobileFiltersGesture = mobileFiltersGestureManager.register({
  id: 'home-mobile-filters',
  priority: 20,
  canStart({ session, detail }) {
    if (!isMobileViewport.value) return false

    const surface = getHomeGestureSurface(session.startTarget)
    if (!surface) return false

    if (detail.direction === 'right') {
      return !isMobileFiltersOpen.value
        && surface === 'main'
        && !isFiltersGestureInteractiveTarget(session.startTarget)
        && session.startX <= 40
    }

    if (detail.direction === 'left') {
      if (mobileFiltersProgress.value <= 0) return false
      if (surface !== 'filters-panel' && surface !== 'filters-overlay') return false
      if (surface === 'filters-panel' && isFiltersGestureInteractiveTarget(session.startTarget)) return false
      return true
    }

    return false
  },
  onStart({ session }) {
    session.data.startProgress = mobileFiltersProgress.value
    isMobileFiltersGestureActive.value = true
  },
  onMove({ session, detail }) {
    const width = Math.max(mobileFiltersWidth.value, 1)
    const startProgress = clampNumber(Number(session.data.startProgress ?? mobileFiltersProgress.value), 0, 1)
    mobileFiltersProgress.value = clampNumber(startProgress + detail.dx / width, 0, 1)
  },
  onEnd() {
    isMobileFiltersGestureActive.value = false
    const shouldOpen = mobileFiltersProgress.value >= 0.42
    isMobileFiltersOpen.value = shouldOpen
    mobileFiltersProgress.value = shouldOpen ? 1 : 0
  },
  onCancel({ session }) {
    isMobileFiltersGestureActive.value = false
    const startProgress = clampNumber(Number(session?.data?.startProgress ?? (isMobileFiltersOpen.value ? 1 : 0)), 0, 1)
    const shouldOpen = startProgress >= 0.5
    isMobileFiltersOpen.value = shouldOpen
    mobileFiltersProgress.value = shouldOpen ? 1 : 0
  },
})

onMounted(() => {
  updateViewportWidth()

  syncLoadMoreObserver()

  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateViewportWidth, { passive: true })
    window.addEventListener('pointermove', handleHomeGesturePointerMove)
    window.addEventListener('pointerup', handleHomeGesturePointerUp)
    window.addEventListener('pointercancel', handleHomeGesturePointerCancel)
  }
})

onBeforeUnmount(() => {
  disconnectLoadMoreObserver()
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateViewportWidth)
    window.removeEventListener('pointermove', handleHomeGesturePointerMove)
    window.removeEventListener('pointerup', handleHomeGesturePointerUp)
    window.removeEventListener('pointercancel', handleHomeGesturePointerCancel)
  }
  mobileFiltersGestureManager.cancel()
  unregisterMobileFiltersGesture()
})
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4" @pointerdown.capture="handleHomeGesturePointerDown">
    <div class="mx-auto d-flex flex-column flex-xl-row align-items-start gap-3 gap-xl-4" style="max-width: 1520px;">
      <aside class="d-none d-xl-flex flex-column flex-shrink-0 align-self-start" style="width: 372px; position: sticky; top: 1rem;">
        <div class="rounded-5 border bg-white shadow-sm d-flex flex-column overflow-hidden" style="max-height: calc(100vh - 2rem);">
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="small text-uppercase text-secondary fw-semibold mb-1">Фильтры</div>
              <div class="fw-semibold">Мягкое уточнение ленты</div>
              <div class="small text-secondary">Управление доступно, но не спорит с контентом.</div>
            </div>
            <span class="badge rounded-pill text-bg-light border text-secondary">{{ activeFilterCountLabel }}</span>
          </div>

          <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
            <FilterForm
              v-model:filterState="filterState"
              v-model:baseFilterState="baseFilterState"
              v-model:selectedLocationIds="selectedLocationIds"
              :filters="filters"
              @clear="resetFilters"
            />
          </div>
        </div>
      </aside>

      <div class="d-grid gap-3 gap-lg-4 flex-grow-1" style="min-width: 0;">
        <section class="rounded-5 border bg-white shadow-sm overflow-hidden">
          <div class="px-3 px-lg-4 py-3 py-lg-4 d-grid gap-4">
            <div class="d-flex flex-column flex-xl-row align-items-xl-end justify-content-between gap-3">
              <div class="d-grid gap-2">
                <div class="small text-uppercase text-secondary fw-semibold">Marketplace</div>
                <h1 class="display-6 mb-0 fw-semibold" style="letter-spacing: -0.03em;">{{ heroTitle }}</h1>
                <div class="text-secondary fs-6" style="max-width: 760px;">
                  {{ pageIntroText }}
                </div>

                <nav v-if="breadcrumbs.length" aria-label="breadcrumb">
                  <ol class="breadcrumb mb-0 small">
                    <li
                      v-for="crumb in breadcrumbs"
                      :key="crumb.id"
                      class="breadcrumb-item"
                      :class="{ active: crumb.active }"
                      :aria-current="crumb.active ? 'page' : null"
                    >
                      <router-link v-if="crumb.to" :to="crumb.to">{{ crumb.name }}</router-link>
                      <span v-else>{{ crumb.name }}</span>
                    </li>
                  </ol>
                </nav>
              </div>

              <div class="d-flex flex-wrap justify-content-start justify-content-xl-end gap-2">
                <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">{{ adsCountLabel }}</span>
              </div>
            </div>

            <div class="d-flex flex-column flex-lg-row gap-2 gap-lg-3 align-items-stretch">
              <input
                v-model="searchText"
                type="search"
                class="form-control form-control-lg rounded-pill"
                placeholder="Название, описание, атрибуты..."
                maxlength="100"
                @keydown.enter="applyFilters"
              />
              <div class="d-flex gap-2 flex-wrap flex-shrink-0">
                <button type="button" class="btn btn-dark rounded-pill px-4" @click="applyFilters">Найти</button>
                <button
                  v-if="isMobileViewport"
                  type="button"
                  class="btn btn-light border rounded-pill px-3 d-xl-none"
                  @click="openMobileFilters()"
                >
                  {{ filtersButtonLabel }}
                </button>
                <button v-if="searchText" type="button" class="btn btn-outline-secondary rounded-pill px-3" @click="clearSearchText">
                  Очистить
                </button>
              </div>
            </div>

            <div class="d-flex flex-wrap align-items-center gap-2">
              <router-link
                to="/"
                class="btn btn-sm rounded-pill px-3"
                :class="currentCategoryId ? 'btn-light border' : 'btn-dark'"
              >
                Все категории
              </router-link>
              <router-link
                v-for="link in visibleCategoryLinks"
                :key="link.id"
                :to="link.to"
                class="btn btn-sm rounded-pill px-3"
                :class="String(link.id) === currentCategoryId ? 'btn-dark' : 'btn-light border'"
              >
                {{ link.label }}
              </router-link>
            </div>
          </div>
        </section>

        <section class="rounded-5 border bg-white shadow-sm overflow-hidden" data-home-gesture-surface="main">
          <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-grid gap-3">
            <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
              <div>
                <div class="small text-uppercase text-secondary fw-semibold mb-1">Лента</div>
                <h2 class="h5 mb-0 fw-semibold">{{ feedTitle }}</h2>
              </div>

              <div class="d-flex flex-wrap align-items-center gap-2 gap-lg-3">
                <div class="d-flex align-items-center gap-2">
                  <label class="small text-uppercase text-secondary fw-semibold mb-0">Сортировка</label>
                  <select v-model="sortKey" class="form-select form-select-sm rounded-pill" aria-label="Sort ads" style="min-width: 210px;" @change="setSort(sortKey)">
                    <option v-for="option in visibleSortOptions" :key="option.value || 'default'" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>

                <div class="d-flex align-items-center gap-2">
                  <label class="small text-uppercase text-secondary fw-semibold mb-0">Показывать</label>
                  <select class="form-select form-select-sm rounded-pill" style="min-width: 92px;" :value="pageSize" @change="setPageSize(Number($event.target.value))">
                    <option :value="10">10</option>
                    <option :value="20">20</option>
                    <option :value="50">50</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="p-3 p-lg-4">
            <div v-if="isInitialLoading" class="d-flex justify-content-center py-5">
              <div class="spinner-border text-secondary" role="status">
                <span class="visually-hidden">Загрузка...</span>
              </div>
            </div>

            <div v-else-if="error" class="alert alert-danger mt-3" role="alert">
              {{ error }}
            </div>

            <template v-else>
              <div class="row row-cols-1 row-cols-md-2 row-cols-xl-2 row-cols-xxl-3 g-4">
                <div class="col" v-for="ad in items" :key="ad.id">
                  <AdCard :ad="ad" :allowEdit="false" />
                </div>
              </div>

              <div v-if="isCursorMode && hasMore" ref="loadMoreTrigger" class="py-4 text-center text-secondary">
                <div class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></div>
                <span>Загружаем еще</span>
              </div>

              <div v-if="!items.length" class="rounded-4 border bg-body-tertiary px-4 py-5 text-center mt-4">
                <div class="h5 mb-2 fw-semibold">По этим условиям объявлений нет</div>
                <div class="text-secondary mb-3">Попробуйте очистить ограничения, сменить раздел или вернуться к более широкой ленте.</div>
                <div class="d-flex flex-wrap justify-content-center gap-2">
                  <button type="button" class="btn btn-outline-secondary rounded-pill px-4" @click="resetFilters">Сбросить фильтры</button>
                  <router-link to="/" class="btn btn-light border rounded-pill px-4">Открыть всю ленту</router-link>
                </div>
              </div>

              <div v-if="isPaginationVisible && totalPages && !isCursorMode" class="mt-4">
                <Pagination
                  :currentPage="page"
                  :totalPages="totalPages"
                  :totalCount="totalCount"
                  :pageSize="pageSize"
                  @changePage="setPage"
                  @changePageSize="setPageSize"
                />
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>

    <div v-show="isMobileViewport" class="position-fixed top-0 start-0 w-100 h-100 d-xl-none" :style="mobileFiltersShellStyle">
      <div class="position-absolute top-0 start-0 w-100 h-100 bg-dark bg-opacity-50" :style="mobileFiltersOverlayStyle" data-home-gesture-surface="filters-overlay" @click="closeMobileFilters"></div>
      <div id="mobileFiltersPanel" class="position-relative bg-white shadow-lg h-100 me-auto d-flex flex-column overflow-hidden" :style="mobileFiltersPanelStyle" data-home-gesture-surface="filters-panel">
        <div class="px-3 py-3 border-bottom bg-white d-flex align-items-center justify-content-between">
          <div>
            <h5 class="mb-0">Фильтры</h5>
            <div class="small text-secondary">{{ categoryTitle }}</div>
          </div>
          <button type="button" class="btn-close" aria-label="Close" @click="closeMobileFilters"></button>
        </div>
        <div class="px-3 pt-3 pb-0 d-flex flex-wrap gap-2">
          <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">{{ selectedLocationCountLabel }}</span>
          <span class="badge rounded-pill text-bg-light border text-secondary px-3 py-2">{{ activeFilterCountLabel }}</span>
        </div>
        <div class="flex-grow-1 overflow-auto p-3">
          <FilterForm
            v-model:filterState="filterState"
            v-model:baseFilterState="baseFilterState"
            v-model:selectedLocationIds="selectedLocationIds"
            :filters="filters"
            @clear="resetFilters"
          >
            <template #buttons>
              <button type="button" class="btn btn-outline-secondary rounded-pill flex-grow-1" @click="applyMobileFilters">Применить</button>
              <button type="button" class="btn btn-light border rounded-pill" @click="resetFilters">Сбросить</button>
            </template>
          </FilterForm>
        </div>
      </div>
    </div>
  </div>
</template>

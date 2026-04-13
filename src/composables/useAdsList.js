import { ref, computed, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAdsStore } from '../stores/adsStore'
import { normalizeLocationIdList } from './useLocations'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/pagination'

const DEFAULT_SORT_BY = 'createdAt'
const DEFAULT_SORT_DIR = 'desc'
const QUERY_DEBOUNCE_MS = 600

function splitSortKey(sortKey) {
  const [sortBy, sortDir] = String(sortKey || '').split('-')
  return {
    sortBy: sortBy || DEFAULT_SORT_BY,
    sortDir: sortDir === 'asc' ? 'asc' : DEFAULT_SORT_DIR,
  }
}

function clampPageSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(parsed, MAX_PAGE_SIZE)
}

function toNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getRouteCursorValue(cursor) {
  if (Array.isArray(cursor)) return normalizeText(cursor[0])
  return normalizeText(cursor)
}

function buildSortValue(sortKey) {
  const { sortBy, sortDir } = splitSortKey(sortKey)
  const normalizedSortBy = String(sortBy || DEFAULT_SORT_BY).trim().replace(/^-+/, '') || DEFAULT_SORT_BY
  return sortDir === 'asc' ? normalizedSortBy : `-${normalizedSortBy}`
}

export function useAdsList() {
  const adsStore = useAdsStore()
  const route = useRoute()
  const router = useRouter()

  const { ads: items, isLoading: loading, totalCount, page, pageSize, totalPages } = storeToRefs(adsStore)

  const search = ref('')
  const category = ref('')
  const priceFrom = ref('')
  const priceTo = ref('')
  const status = ref('')
  const dateFrom = ref('')
  const dateTo = ref('')
  const selectedLocationIds = ref([])
  const cursors = ref([null])
  const isUsingCursor = ref(false)

  const sortKey = ref(`${DEFAULT_SORT_BY}-${DEFAULT_SORT_DIR}`)
  const error = ref(null)

  let searchTimer = null

  function clearSearchTimer() {
    if (!searchTimer) return
    clearTimeout(searchTimer)
    searchTimer = null
  }

  function buildQueryParams() {
    const params = {
      page: page.value,
      pageSize: pageSize.value,
      sort: buildSortValue(sortKey.value),
    }

    const searchValue = normalizeText(search.value)
    if (searchValue) params.search = searchValue

    const categoryValue = normalizeText(category.value)
    if (categoryValue) params.category = categoryValue

    const minPrice = toNumberOrNull(priceFrom.value)
    const maxPrice = toNumberOrNull(priceTo.value)
    if (minPrice != null) params.priceFrom = minPrice
    if (maxPrice != null) params.priceTo = maxPrice

    const fromDate = normalizeText(dateFrom.value)
    const toDate = normalizeText(dateTo.value)
    if (fromDate) params.dateFrom = fromDate
    if (toDate) params.dateTo = toDate

    const statusValue = normalizeText(status.value)
    if (statusValue) params.status = statusValue

    const locationIds = normalizeLocationIdList(selectedLocationIds.value).slice(0, 10)
    if (locationIds.length) {
      params.location = locationIds
    }

    return params
  }

  async function replaceCursorQuery(cursorValue) {
    const query = { ...route.query }
    const normalizedCursor = normalizeText(cursorValue)
    if (normalizedCursor) query.cursor = normalizedCursor
    else delete query.cursor

    await router.replace({ query })
  }

  async function loadOffsetPage(pageNumber) {
    error.value = null
    isUsingCursor.value = false
    cursors.value = [null]

    try {
      const data = await adsStore.loadAds({ ...buildQueryParams(), page: pageNumber })
      page.value = pageNumber
      await replaceCursorQuery(null)
      return data
    } catch (e) {
      error.value = e?.message || 'Ошибка загрузки данных'
      return null
    }
  }

  async function refresh() {
    page.value = DEFAULT_PAGE
    await loadOffsetPage(DEFAULT_PAGE)
  }

  function applyFilters() {
    clearSearchTimer()
    page.value = DEFAULT_PAGE
    isUsingCursor.value = false
    cursors.value = [null]
    adsStore.ads.value = []
    void refresh()
  }

  function onSearchInput() {
    clearSearchTimer()
    searchTimer = setTimeout(() => {
      searchTimer = null
      page.value = DEFAULT_PAGE
      void refresh()
    }, QUERY_DEBOUNCE_MS)
  }

  async function setPage(newPage) {
    clearSearchTimer()
    const parsed = Number(newPage)
    const pageNumber = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE

    if (pageNumber === 1) {
      await refresh()
      return
    }

    const step = pageNumber - page.value
    const nextCursor = cursors.value[1]

    if (step === 1 && nextCursor !== undefined && nextCursor !== null) {
      const data = await loadByCursor(nextCursor, pageNumber)
      if (data) await replaceCursorQuery(nextCursor)
      return
    }

    await loadOffsetPage(pageNumber)
  }

  function setPageSize(newSize) {
    clearSearchTimer()
    pageSize.value = clampPageSize(newSize)
    page.value = DEFAULT_PAGE
    isUsingCursor.value = false
    cursors.value = [null]
    void refresh()
  }

  function setSort({ sortBy, sortDir }) {
    clearSearchTimer()
    sortKey.value = `${sortBy || DEFAULT_SORT_BY}-${sortDir === 'asc' ? 'asc' : DEFAULT_SORT_DIR}`
    page.value = DEFAULT_PAGE
    isUsingCursor.value = false
    cursors.value = [null]
    void refresh()
  }

  function resetFilters() {
    clearSearchTimer()
    search.value = ''
    category.value = ''
    priceFrom.value = ''
    priceTo.value = ''
    status.value = ''
    dateFrom.value = ''
    dateTo.value = ''
    selectedLocationIds.value = []
    sortKey.value = `${DEFAULT_SORT_BY}-${DEFAULT_SORT_DIR}`
    page.value = DEFAULT_PAGE
    pageSize.value = DEFAULT_PAGE_SIZE
    isUsingCursor.value = false
    cursors.value = [null]
    adsStore.ads.value = []
    void refresh()
  }

  function initWithCategoryId(routeCategoryId) {
    clearSearchTimer()
    const id = String(routeCategoryId || '').trim()
    category.value = id
    page.value = DEFAULT_PAGE
    isUsingCursor.value = false
    cursors.value = [null]
    void refresh()
  }

  const isPaginationVisible = computed(() => !isUsingCursor.value)

  async function loadByCursor(cursorValue, pageNumber = page.value) {
    error.value = null
    isUsingCursor.value = true
    try {
      const data = await adsStore.loadAds({ ...buildQueryParams(), cursor: cursorValue, append: false })
      page.value = pageNumber
      cursors.value = data && typeof data === 'object' && data.nextCursor
        ? [null, data.nextCursor]
        : [null]
      return data
    } catch (e) {
      error.value = e?.message || 'Ошибка загрузки данных'
      isUsingCursor.value = false
      return null
    }
  }

  async function initFromUrl() {
    category.value = String(route.params.id || '').trim()
    page.value = DEFAULT_PAGE
    isUsingCursor.value = false
    cursors.value = [null]

    const urlCursor = getRouteCursorValue(route.query.cursor)
    if (urlCursor) {
      isUsingCursor.value = true
      page.value = 2
      await loadByCursor(urlCursor, 2)
      return
    }

    await refresh()
  }

  const visiblePages = computed(() => {
    const current = page.value
    const max = totalPages.value ?? current + 2
    const start = Math.max(1, current - 2)
    const end = Math.min(max, start + 9)
    const adjustedStart = Math.max(1, end - 9)
    return Array.from({ length: end - adjustedStart + 1 }, (_, i) => adjustedStart + i)
  })

  onUnmounted(() => {
    clearSearchTimer()
  })

  const adsCountLabel = computed(() => {
    const shown = adsStore.ads.length
    const total = adsStore.totalCount
    if (total > shown) return `${shown} из ${total} объявлений`
    if (shown === 0) return '0 объявлений'
    return `${shown} ${shown === 1 ? 'объявление' : shown < 5 ? 'объявления' : 'объявлений'}`
  })

  return {
    items,
    loading,
    error,
    page,
    pageSize,
    totalPages,
    totalCount,
    adsCountLabel,
    cursors,
    isUsingCursor,
    visiblePages,
    priceFrom,
    priceTo,
    category,
    status,
    dateFrom,
    dateTo,
    selectedLocationIds,
    sortKey,
    search,
    setPage,
    setPageSize,
    setSort,
    resetFilters,
    onSearchInput,
    applyFilters,
    initWithCategoryId,
    loadByCursor,
    initFromUrl,
    isPaginationVisible,
  }
}

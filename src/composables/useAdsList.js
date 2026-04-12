import { ref, computed, onUnmounted } from 'vue'
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

function buildSortValue(sortKey) {
  const { sortBy, sortDir } = splitSortKey(sortKey)
  const normalizedSortBy = String(sortBy || DEFAULT_SORT_BY).trim().replace(/^-+/, '') || DEFAULT_SORT_BY
  return sortDir === 'asc' ? normalizedSortBy : `-${normalizedSortBy}`
}

export function useAdsList() {
  const adsStore = useAdsStore()

  const { ads: items, isLoading: loading, totalCount, page, pageSize, totalPages } = storeToRefs(adsStore)

  const search = ref('')
  const category = ref('')
  const priceFrom = ref('')
  const priceTo = ref('')
  const status = ref('')
  const dateFrom = ref('')
  const dateTo = ref('')
  const selectedLocationIds = ref([])

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

  async function refresh() {
    error.value = null

    try {
      await adsStore.loadAds(buildQueryParams())
    } catch (e) {
      error.value = e?.message || 'Ошибка загрузки данных'
    }
  }

  function applyFilters() {
    clearSearchTimer()
    page.value = DEFAULT_PAGE
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

  function setPage(newPage) {
    clearSearchTimer()
    const parsed = Number(newPage)
    page.value = Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE
    void refresh()
  }

  function setPageSize(newSize) {
    clearSearchTimer()
    pageSize.value = clampPageSize(newSize)
    page.value = DEFAULT_PAGE
    void refresh()
  }

  function setSort({ sortBy, sortDir }) {
    clearSearchTimer()
    sortKey.value = `${sortBy || DEFAULT_SORT_BY}-${sortDir === 'asc' ? 'asc' : DEFAULT_SORT_DIR}`
    page.value = DEFAULT_PAGE
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
    void refresh()
  }

  function initWithCategoryId(routeCategoryId) {
    clearSearchTimer()
    const id = String(routeCategoryId || '').trim()
    category.value = id
    page.value = DEFAULT_PAGE
    void refresh()
  }

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
  }
}

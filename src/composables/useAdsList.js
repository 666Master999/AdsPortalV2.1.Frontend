import { ref, computed, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdsStore } from '../stores/adsStore'
import { useLocationsStore } from '../stores/locationsStore'
import {
  useFilters,
  parseFiltersParam,
  buildFiltersParam,
  normalizeFilters,
} from '../composables/useFilters'
import { mapLocationToFilter } from '../composables/useLocationMapper'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/pagination'

const VALID_SORT_FIELDS = ['createdAt', 'price', 'title', 'views', 'updatedAt']
const DEFAULT_SORT_BY = 'createdAt'
const DEFAULT_SORT_DIR = 'desc'
const QUERY_FETCH_DEBOUNCE_MS = 600

function parsePositiveInt(v) {
  const n = parseInt(v)
  return Number.isFinite(n) && n >= DEFAULT_PAGE ? n : null
}

function normalizePageSize(v) {
  const n = parseInt(v)
  if (!Number.isFinite(n) || n < DEFAULT_PAGE) return DEFAULT_PAGE_SIZE
  return Math.min(n, MAX_PAGE_SIZE)
}

function isSameQuery(a, b) {
  if (!b) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every(k => String(a[k]) === String(b[k]))
}

/**
 * Composable for ads list with URL-as-source-of-truth.
 *
 * Flow: UI → updates URL query → watcher triggers fetch → store updated
 *
 * Filter state is unified in a single FilterRef[] (see useFilters).
 * URL format: ?filters=[{"type":"location","value":"city:1"}]
 *
 * Exposes:
 *   State   — items, loading, error, page, pageSize, totalPages, totalCount,
 *             sortKey, search, adsCountLabel
 *             Derived (read/write) — priceFrom, priceTo, category, status,
 *             dateFrom, dateTo, selectedLocations
 *   Actions — setPage, setPageSize, setSort, resetFilters,
 *             addFilter, removeFilter, onSearchInput, navigateWithParams,
 *             initWithCategoryId
 */
export function useAdsList() {
  const route = useRoute()
  const router = useRouter()
  const adsStore = useAdsStore()
  const locStore = useLocationsStore()

  function getLocationData() {
    return {
      citiesByRegion: locStore.citiesByRegion,
      districtsByCity: locStore.districtsByCity,
    }
  }

  // --- Unified filter state ---
  const {
    filters,
    addFilter: filtersAdd,
    removeFilter: filtersRemove,
    priceFrom: derivedPriceFrom,
    priceTo: derivedPriceTo,
    category: derivedCategory,
    status: derivedStatus,
    dateFrom: derivedDateFrom,
    dateTo: derivedDateTo,
    locations: derivedLocations,
  } = useFilters(getLocationData)

  // --- Pagination / sort / search (remain as separate URL params) ---
  const page = ref(DEFAULT_PAGE)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const sortKey = ref(`${DEFAULT_SORT_BY}-${DEFAULT_SORT_DIR}`)
  const search = ref('')
  const error = ref(null)

  let searchTimer = null
  let fetchTimer = null
  let lastFetchedQuery = null
  let lastFetchedQueryKey = ''
  let activeQueryKey = ''
  let lastRequestedQueryKey = ''
  let fetchSequence = 0

  function cancelSearchTimer() {
    if (!searchTimer) return
    clearTimeout(searchTimer)
    searchTimer = null
  }

  function cancelFetchTimer() {
    if (!fetchTimer) return
    clearTimeout(fetchTimer)
    fetchTimer = null
  }

  // --- Writable computed refs for v-model compat in FilterForm ---

  const priceFrom = computed({
    get: () => derivedPriceFrom.value,
    set: (v) => {
      if (v != null && v !== '') filtersAdd({ type: 'priceFrom', value: String(v) })
      else filtersRemove({ type: 'priceFrom' })
    },
  })

  const priceTo = computed({
    get: () => derivedPriceTo.value,
    set: (v) => {
      if (v != null && v !== '') filtersAdd({ type: 'priceTo', value: String(v) })
      else filtersRemove({ type: 'priceTo' })
    },
  })

  const category = computed({
    get: () => derivedCategory.value,
    set: (v) => {
      if (v != null && v !== '') filtersAdd({ type: 'category', value: String(v) })
      else filtersRemove({ type: 'category' })
    },
  })

  const status = computed({
    get: () => derivedStatus.value,
    set: (v) => {
      if (v) filtersAdd({ type: 'status', value: v })
      else filtersRemove({ type: 'status' })
    },
  })

  const dateFrom = computed({
    get: () => derivedDateFrom.value,
    set: (v) => {
      if (v) filtersAdd({ type: 'dateFrom', value: v })
      else filtersRemove({ type: 'dateFrom' })
    },
  })

  const dateTo = computed({
    get: () => derivedDateTo.value,
    set: (v) => {
      if (v) filtersAdd({ type: 'dateTo', value: v })
      else filtersRemove({ type: 'dateTo' })
    },
  })

  const selectedLocations = computed({
    get: () => derivedLocations.value,
    set: (locs) => {
      const locationFilters = mapLocationToFilter(locs)
      filters.value = normalizeFilters([
        ...filters.value.filter(f => f.type !== 'location'),
        ...locationFilters,
      ], getLocationData())
    },
  })

  // --- Query helpers ---

  function parseQuery(q = route.query) {
    const parsed = parseFiltersParam(typeof q.filters === 'string' ? q.filters : '')
    const normalized = normalizeFilters(parsed, getLocationData())
    return {
      page: parsePositiveInt(q.page) ?? DEFAULT_PAGE,
      pageSize: normalizePageSize(q.pageSize),
      sortBy: VALID_SORT_FIELDS.includes(q.sortBy) ? q.sortBy : DEFAULT_SORT_BY,
      sortDir: q.sortDir === 'asc' ? 'asc' : DEFAULT_SORT_DIR,
      search: typeof q.search === 'string' ? q.search : '',
      filters: normalized,
    }
  }

  function buildQuery(params) {
    const normalized = normalizeFilters(params.filters ?? [], getLocationData())
    const q = {
      page: String(params.page),
      pageSize: String(params.pageSize),
      sortBy: params.sortBy,
      sortDir: params.sortDir,
    }
    if (params.search) q.search = params.search
    const filtersStr = buildFiltersParam(normalized)
    if (filtersStr) q.filters = filtersStr
    return q
  }

  function syncRefs(params) {
    page.value = params.page
    pageSize.value = params.pageSize
    sortKey.value = `${params.sortBy}-${params.sortDir}`
    search.value = params.search
    filters.value = normalizeFilters(params.filters, getLocationData())
  }

  function readLocalParams() {
    const [sb, sd] = sortKey.value.split('-')
    return {
      page: page.value,
      pageSize: pageSize.value,
      sortBy: sb || DEFAULT_SORT_BY,
      sortDir: sd || DEFAULT_SORT_DIR,
      search: search.value.trim(),
      filters: filters.value,
    }
  }

  function buildApiParams(params) {
    const normalized = normalizeFilters(params.filters ?? [], getLocationData())
    const api = {
      page: params.page,
      pageSize: params.pageSize,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
    }
    if (params.search) api.search = params.search
    const filtersStr = buildFiltersParam(normalized)
    if (filtersStr) api.filters = filtersStr
    return api
  }

  function getQueryKey(params) {
    return JSON.stringify(buildQuery(params))
  }

  function getRouteQueryKey(query = route.query) {
    return getQueryKey(parseQuery(query))
  }

  function shouldSkipFetch(query = route.query) {
    const queryKey = getRouteQueryKey(query)
    return queryKey === lastFetchedQueryKey || queryKey === activeQueryKey
  }

  // --- Core fetch ---

  async function fetchFromQuery() {
    cancelFetchTimer()
    const params = parseQuery()
    const requestQueryKey = getQueryKey(params)
    if (requestQueryKey === lastFetchedQueryKey || requestQueryKey === activeQueryKey) {
      syncRefs(params)
      return
    }

    error.value = null
    const currentFetchSequence = ++fetchSequence
    activeQueryKey = requestQueryKey
    syncRefs(params)
    try {
      await adsStore.loadAds(buildApiParams(params))
      if (currentFetchSequence !== fetchSequence) return
      // Correct page if backend clamped it (page > totalPages)
      const finalParams = adsStore.page !== params.page
        ? { ...params, page: adsStore.page }
        : params
      const finalQuery = buildQuery(finalParams)
      const finalQueryKey = getQueryKey(finalParams)
      lastFetchedQuery = finalQuery
      lastFetchedQueryKey = finalQueryKey
      if (!isSameQuery(route.query, finalQuery)) {
        syncRefs(finalParams)
        router.replace({ query: finalQuery })
      }
    } catch (e) {
      if (currentFetchSequence !== fetchSequence) return
      error.value = e?.message || 'Ошибка загрузки данных'
    } finally {
      if (currentFetchSequence === fetchSequence) {
        activeQueryKey = ''
      }
    }
  }

  function scheduleFetchFromQuery() {
    const queryKey = getRouteQueryKey()
    if (queryKey === lastFetchedQueryKey || queryKey === activeQueryKey || queryKey === lastRequestedQueryKey) return
    lastRequestedQueryKey = queryKey
    cancelFetchTimer()
    fetchTimer = setTimeout(() => {
      fetchTimer = null
      void fetchFromQuery()
    }, QUERY_FETCH_DEBOUNCE_MS)
  }

  // --- Navigation helper (URL is source of truth) ---

  function navigateWithParams(overrides = {}) {
    cancelSearchTimer()
    const current = readLocalParams()
    const merged = { ...current, ...overrides }
    const newQuery = buildQuery(merged)
    if (!isSameQuery(route.query, newQuery)) {
      router.replace({ query: newQuery })
    }
  }

  // --- Public filter actions ---

  function addFilter(filter) {
    filtersAdd(filter)
  }

  function removeFilter(filter) {
    filtersRemove(filter)
  }

  // --- Public pagination / sort actions ---

  function setPage(newPage) {
    page.value = parsePositiveInt(newPage) ?? DEFAULT_PAGE
    navigateWithParams({ page: page.value })
  }

  function setPageSize(newSize) {
    pageSize.value = normalizePageSize(newSize)
    page.value = DEFAULT_PAGE
    navigateWithParams({ page: DEFAULT_PAGE })
  }

  /**
   * @param {{ sortBy: string, sortDir: 'asc' | 'desc' }} sort
   */
  function setSort({ sortBy, sortDir }) {
    sortKey.value = `${sortBy}-${sortDir}`
    page.value = DEFAULT_PAGE
    navigateWithParams({ page: DEFAULT_PAGE })
  }

  function resetFilters() {
    filters.value = []
    search.value = ''
    sortKey.value = `${DEFAULT_SORT_BY}-${DEFAULT_SORT_DIR}`
    page.value = DEFAULT_PAGE
    navigateWithParams({ page: DEFAULT_PAGE })
  }

  /** Debounced search — call from @input on the search field */
  function onSearchInput() {
    cancelSearchTimer()
    const term = search.value.trim()
    searchTimer = setTimeout(() => {
      searchTimer = null
      navigateWithParams({ search: term, page: DEFAULT_PAGE })
    }, 600)
  }

  /**
   * Must be called from onMounted in the host component.
   * Handles optional /category/:id route seed.
   *
   * @param {string} [routeCategoryId]
   */
  function initWithCategoryId(routeCategoryId) {
    cancelSearchTimer()
    cancelFetchTimer()
    const params = parseQuery()

    let initialFilters = params.filters

    if (!route.query.filters) {
      const saved = localStorage.getItem('filters')
      if (saved) {
        initialFilters = parseFiltersParam(saved)
      }
    }

    if (routeCategoryId) {
      initialFilters = [
        ...initialFilters.filter(f => f.type !== 'category'),
        { type: 'category', value: String(routeCategoryId) },
      ]
    }

    params.filters = initialFilters

    syncRefs(params)
    const newQuery = buildQuery(params)
    if (!isSameQuery(route.query, newQuery)) {
      router.replace({ query: newQuery })
    } else {
      void fetchFromQuery()
    }
  }

  // --- Watchers ---

  // React to all URL query changes (also browser back/forward)
  watch(
    () => route.query,
    (newQuery) => {
      if (isSameQuery(newQuery, lastFetchedQuery) || shouldSkipFetch(newQuery)) return
      scheduleFetchFromQuery()
    },
    { deep: true }
  )

  onUnmounted(() => {
    cancelSearchTimer()
    cancelFetchTimer()
  })

  watch(
    () => buildFiltersParam(normalizeFilters(filters.value, getLocationData())),
    (serializedFilters) => {
      if (serializedFilters && serializedFilters !== '[]') localStorage.setItem('filters', serializedFilters)
      else localStorage.removeItem('filters')
    },
    { immediate: true }
  )

  // --- Derived ---

  const adsCountLabel = computed(() => {
    const shown = adsStore.ads.length
    const t = adsStore.totalCount
    if (t > shown) return `${shown} из ${t} объявлений`
    if (shown === 0) return '0 объявлений'
    return `${shown} ${shown === 1 ? 'объявление' : shown < 5 ? 'объявления' : 'объявлений'}`
  })

  return {
    // Read-only list state
    items: computed(() => adsStore.ads),
    loading: computed(() => adsStore.isLoading),
    error,
    totalPages: computed(() => adsStore.totalPages),
    totalCount: computed(() => adsStore.totalCount),
    adsCountLabel,

    // Derived writable refs (v-model compatible, backed by filters[])
    priceFrom,
    priceTo,
    category,
    status,
    dateFrom,
    dateTo,
    selectedLocations,

    // Pagination / sort
    page,
    pageSize,
    sortKey,
    search,

    // Actions
    addFilter,
    removeFilter,
    setPage,
    setPageSize,
    setSort,
    resetFilters,
    onSearchInput,
    navigateWithParams,
    initWithCategoryId,
  }
}

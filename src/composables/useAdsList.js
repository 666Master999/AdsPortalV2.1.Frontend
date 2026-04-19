import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/pagination'
import { useAdsStore } from '../stores/adsStore'
import { useCategoryStore } from '../stores/categoryStore'
import { useCategoriesStore } from '../stores/categoriesStore'

const DEFAULT_SORT_KEY = ''
const QUERY_DEBOUNCE_MS = 400

function normalizeText(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function clampPageSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(parsed, MAX_PAGE_SIZE)
}

function normalizePage(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE
}

function normalizeSortKey(value) {
  return normalizeText(value)
}

function compareFilterSlugs(left, right) {
  return normalizeText(left?.slug).localeCompare(normalizeText(right?.slug))
}

function compareCategoryOptions(left, right) {
  return normalizeText(left?.label).localeCompare(normalizeText(right?.label), undefined, { sensitivity: 'base' })
}

function createDefaultFilterState(filters = []) {
  const state = {}

  for (const filter of Array.isArray(filters) ? filters : []) {
    const slug = normalizeText(filter?.slug)
    const type = normalizeText(filter?.type).toLowerCase()
    if (!slug || !type) continue

    if (type === 'enum') {
      state[slug] = []
      continue
    }

    if (type === 'decimal') {
      state[slug] = { min: '', max: '' }
      continue
    }

    if (type === 'bool') {
      state[slug] = null
      continue
    }

    if (type === 'int') {
      state[slug] = ''
    }
  }

  return state
}

function createDefaultBaseFilterState(includeChildren = false) {
  return {
    includeChildren: Boolean(includeChildren),
    priceFrom: '',
    priceTo: '',
    dateFrom: '',
    dateTo: '',
  }
}

function normalizeEnumSelection(value, options = []) {
  const list = Array.isArray(value) ? value : value == null ? [] : [value]
  const lookup = new Map()

  for (const option of Array.isArray(options) ? options : []) {
    const normalizedOption = normalizeText(option)
    if (!normalizedOption) continue
    lookup.set(normalizedOption.toLowerCase(), normalizedOption)
  }

  const result = []
  const seen = new Set()
  for (const item of list) {
    const normalizedItem = normalizeText(item)
    if (!normalizedItem) continue

    const canonical = lookup.get(normalizedItem.toLowerCase())
    if (!canonical) continue

    const dedupeKey = canonical.toLowerCase()
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    result.push(canonical)
  }

  result.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))

  return result
}

function serializeFiltersQuery(filters = [], values = {}) {
  const query = new URLSearchParams()

  for (const filter of Array.isArray(filters) ? filters : []) {
    const slug = normalizeText(filter?.slug)
    const type = normalizeText(filter?.type).toLowerCase()
    if (!slug || !type) continue

    const currentValue = values?.[slug]

    if (type === 'enum') {
      const options = Array.isArray(filter?.options)
        ? filter.options.map(option => normalizeText(option?.value)).filter(Boolean)
        : []
      const selected = normalizeEnumSelection(currentValue, options)
      if (selected.length) {
        query.set(slug, selected.join(','))
      }
      continue
    }

    if (type === 'int') {
      const normalizedValue = normalizeText(currentValue)
      if (normalizedValue) {
        query.set(slug, normalizedValue)
      }
      continue
    }

    if (type === 'bool') {
      if (currentValue === null || currentValue === undefined || currentValue === '') continue

      if (typeof currentValue === 'boolean') {
        query.set(slug, currentValue ? 'true' : 'false')
        continue
      }

      const normalizedBool = normalizeText(currentValue).toLowerCase()
      if (normalizedBool === 'true' || normalizedBool === 'false') {
        query.set(slug, normalizedBool)
      }
      continue
    }

    if (type === 'decimal') {
      const rangeValue = currentValue && typeof currentValue === 'object' ? currentValue : null
      const minValue = normalizeText(rangeValue?.min ?? rangeValue?.from ?? '')
      const maxValue = normalizeText(rangeValue?.max ?? rangeValue?.to ?? '')
      const valuesList = [minValue, maxValue].filter(Boolean)
      if (valuesList.length) {
        query.set(slug, valuesList.join(','))
      }
      continue
    }
  }

  return query.toString()
}

function buildBreadcrumbs(pathIds, categories, currentCategory) {
  const categoriesById = new Map(
    Array.isArray(categories)
      ? categories
          .map(category => {
            const id = Number(category?.id)
            if (!Number.isInteger(id)) return null
            return [String(id), category]
          })
          .filter(Boolean)
      : []
  )

  const normalizedPath = Array.isArray(pathIds) ? pathIds.map(item => Number(item)).filter(Number.isInteger) : []
  return normalizedPath.map((id, index) => {
    const isCurrent = index === normalizedPath.length - 1
    const category = isCurrent ? currentCategory : categoriesById.get(String(id))
    const name = normalizeText(category?.name) || normalizeText(currentCategory?.name) || `#${id}`

    return {
      id,
      name,
      to: isCurrent ? null : `/category/${id}`,
      active: isCurrent,
    }
  })
}

export function useAdsList() {
  const route = useRoute()
  const adsStore = useAdsStore()
  const categoryStore = useCategoryStore()
  const categoriesStore = useCategoriesStore()

  const { ads: items, isLoading: adsLoading, totalCount, page, pageSize, totalPages, cursor, hasMore } = storeToRefs(adsStore)
  const { currentCategoryView, filters: categoryFilters, children, path } = storeToRefs(categoryStore)
  const { categories: categoryList } = storeToRefs(categoriesStore)

  const sortKey = ref(DEFAULT_SORT_KEY)
  const searchText = ref('')
  const selectedLocationIds = ref([])
  const filterState = ref({})
  const baseFilterState = ref(createDefaultBaseFilterState())
  const error = ref(null)
  const categoryLoading = ref(false)
  const isSyncingCategory = ref(false)
  let categorySyncToken = 0

  let filterTimer = null

  const canonicalCategoryFilters = computed(() => {
    const filters = Array.isArray(categoryFilters.value) ? [...categoryFilters.value] : []
    return filters.sort(compareFilterSlugs)
  })

  const categoryOptions = computed(() => {
    const categories = Array.isArray(categoryList.value) ? categoryList.value : []
    return categories
      .map(category => {
        const id = Number(category?.id)
        const name = normalizeText(category?.name)
        if (!Number.isInteger(id) || !name) return null

        return {
          id,
          name,
          label: normalizeText(category?.path) || name,
        }
      })
      .filter(Boolean)
      .sort(compareCategoryOptions)
  })

  function clearFilterTimer() {
    if (!filterTimer) return
    clearTimeout(filterTimer)
    filterTimer = null
  }

  onMounted(() => {
    void categoriesStore.loadCategories().catch(() => null)
  })

  function syncFilterStateFromSchema() {
    filterState.value = { ...createDefaultFilterState(canonicalCategoryFilters.value) }
  }

  function syncBaseFilterStateFromCategory() {
    baseFilterState.value = {
      ...createDefaultBaseFilterState(currentCategoryView.value?.category?.isLeaf === false),
    }
  }

  async function loadPage(pageNumber = DEFAULT_PAGE, cursorValue = null, append = false) {
    error.value = null

    try {
      const currentBaseFilters = baseFilterState.value && typeof baseFilterState.value === 'object'
        ? baseFilterState.value
        : createDefaultBaseFilterState()

      const data = await adsStore.fetchAds({
        categoryIds: currentCategoryView.value?.category?.id ? [currentCategoryView.value.category.id] : [],
        includeChildren: currentBaseFilters.includeChildren,
        search: searchText.value,
        locationIds: selectedLocationIds.value,
        priceFrom: currentBaseFilters.priceFrom,
        priceTo: currentBaseFilters.priceTo,
        dateFrom: currentBaseFilters.dateFrom,
        dateTo: currentBaseFilters.dateTo,
        attributes: serializeFiltersQuery(canonicalCategoryFilters.value, filterState.value),
        cursor: cursorValue,
        page: pageNumber,
        pageSize: pageSize.value,
        sort: sortKey.value,
        append,
      })

      if (data == null) {
        return null
      }

      const nextCursorValue = normalizeText(data?.nextCursor ?? data?.NextCursor)
      hasMore.value = Boolean(data?.hasMore ?? data?.HasMore ?? nextCursorValue)

      return data
    } catch (e) {
      error.value = e?.message || 'Ошибка загрузки данных'
      hasMore.value = false
      return null
    }
  }

  async function syncCategory(categoryId) {
    const normalizedCategoryId = normalizeText(categoryId)
    const syncToken = ++categorySyncToken

    clearFilterTimer()
    error.value = null
    categoryLoading.value = true
    isSyncingCategory.value = true
    page.value = DEFAULT_PAGE
    categoryStore.resetCategoryView()
    filterState.value = {}
    baseFilterState.value = createDefaultBaseFilterState()
    searchText.value = ''
    selectedLocationIds.value = []
    hasMore.value = false
    items.value = []

    try {
      if (normalizedCategoryId) {
        await categoriesStore.loadCategories().catch(() => null)
        if (syncToken !== categorySyncToken) return
        await categoryStore.fetchCategoryView(normalizedCategoryId)
        if (syncToken !== categorySyncToken) return
        syncFilterStateFromSchema()
        syncBaseFilterStateFromCategory()
      }

      if (!normalizedCategoryId) {
        syncFilterStateFromSchema()
        syncBaseFilterStateFromCategory()
      }

      if (syncToken !== categorySyncToken) return
      await loadPage(DEFAULT_PAGE, null)
    } catch (e) {
      if (syncToken !== categorySyncToken) return
      error.value = e?.message || 'Ошибка загрузки данных'
      items.value = []
    } finally {
      if (syncToken !== categorySyncToken) return
      categoryLoading.value = false
      isSyncingCategory.value = false
    }
  }

  function scheduleFilterRefresh() {
    if (isSyncingCategory.value) return

    clearFilterTimer()
    page.value = DEFAULT_PAGE
    hasMore.value = false
    items.value = []

    filterTimer = setTimeout(() => {
      filterTimer = null
      void loadPage(DEFAULT_PAGE, null)
    }, QUERY_DEBOUNCE_MS)
  }

  async function setPage(newPage) {
    if (isCursorMode.value) return

    clearFilterTimer()
    const pageNumber = normalizePage(newPage)

    if (pageNumber === page.value) return

    await loadPage(pageNumber, null)
  }

  function setPageSize(newSize) {
    clearFilterTimer()
    const nextPageSize = clampPageSize(newSize)
    if (nextPageSize === pageSize.value) return

    pageSize.value = nextPageSize
    page.value = DEFAULT_PAGE
    hasMore.value = false
    items.value = []
    void loadPage(DEFAULT_PAGE, null)
  }

  function setSort(nextSortKey) {
    clearFilterTimer()
    const normalizedSortKey = normalizeSortKey(nextSortKey)
    if (normalizedSortKey === sortKey.value) return

    sortKey.value = normalizedSortKey
    page.value = DEFAULT_PAGE
    hasMore.value = false
    items.value = []
    void loadPage(DEFAULT_PAGE, null)
  }

  async function loadNext() {
    if (isSyncingCategory.value || !hasMore.value || loading.value) return null

    if (isCursorMode.value) {
      const nextCursor = normalizeText(cursor.value)
      if (!nextCursor) return null
      return loadPage(page.value, nextCursor, true)
    }

    const nextPage = normalizePage(page.value + 1)
    page.value = nextPage
    return loadPage(nextPage, null)
  }

  function applyFilters() {
    clearFilterTimer()
    if (isSyncingCategory.value) return Promise.resolve(null)

    page.value = DEFAULT_PAGE
    hasMore.value = false
    items.value = []
    return loadPage(DEFAULT_PAGE, null)
  }

  function resetFilters() {
    clearFilterTimer()
    isSyncingCategory.value = true
    filterState.value = { ...createDefaultFilterState(canonicalCategoryFilters.value) }
    searchText.value = ''
    selectedLocationIds.value = []
    baseFilterState.value = {
      ...createDefaultBaseFilterState(currentCategoryView.value?.category?.isLeaf === false),
    }
    sortKey.value = DEFAULT_SORT_KEY
    pageSize.value = DEFAULT_PAGE_SIZE
    page.value = DEFAULT_PAGE
    hasMore.value = false
    items.value = []
    return loadPage(DEFAULT_PAGE, null).finally(() => {
      isSyncingCategory.value = false
    })
  }

  const breadcrumbs = computed(() => buildBreadcrumbs(path.value, categoryList.value, currentCategoryView.value?.category))
  const categoryTitle = computed(() => normalizeText(currentCategoryView.value?.category?.name) || 'Последние объявления')
  const hasCategoryView = computed(() => Boolean(currentCategoryView.value?.category?.id))
  const hasCategoryFilters = computed(() => Array.isArray(categoryFilters.value) && categoryFilters.value.length > 0)
  const loading = computed(() => adsLoading.value || categoryLoading.value)
  const isCursorMode = computed(() => {
    const searchValue = normalizeText(searchText.value)
    const sortValue = normalizeText(sortKey.value)
    return !searchValue && (!sortValue || sortValue === '-createdAt')
  })
  const isInitialLoading = computed(() => loading.value && (!isCursorMode.value || items.value.length === 0))
  const includeChildren = computed(() => Boolean(baseFilterState.value?.includeChildren))
  const filters = computed(() => categoryFilters.value)
  const childrenList = computed(() => children.value)
  const isPaginationVisible = computed(() => !isCursorMode.value && Number(totalPages.value || 0) > 1)
  const adsCountLabel = computed(() => {
    const shown = items.value.length
    const total = totalCount.value
    if (total > shown) return `${shown} из ${total} объявлений`
    if (total < 0) return shown === 0 ? '0 объявлений' : `${shown} объявлений`
    if (shown === 0) return '0 объявлений'
    return `${shown} ${shown === 1 ? 'объявление' : shown < 5 ? 'объявления' : 'объявлений'}`
  })

  watch(
    () => route.params.id,
    categoryId => {
      void syncCategory(categoryId)
    },
    { immediate: true }
  )

  watch(searchText, value => {
    if (!normalizeText(value) && sortKey.value === '-relevance') {
      sortKey.value = ''
    }
    scheduleFilterRefresh()
  })

  watch(selectedLocationIds, () => {
    scheduleFilterRefresh()
  })

  watch(filterState, () => {
    scheduleFilterRefresh()
  })

  watch(baseFilterState, () => {
    scheduleFilterRefresh()
  })

  onUnmounted(() => {
    clearFilterTimer()
  })

  return {
    items,
    loading,
    error,
    page,
    pageSize,
    totalPages,
    totalCount,
    hasMore,
    sortKey,
    searchText,
    selectedLocationIds,
    filterState,
    baseFilterState,
    breadcrumbs,
    categoryTitle,
    categoryView: currentCategoryView,
    filters,
    categoryOptions,
    children: childrenList,
    hasCategoryView,
    hasCategoryFilters,
    isInitialLoading,
    includeChildren,
    adsCountLabel,
    isPaginationVisible,
    isCursorMode,
    setPage,
    setPageSize,
    setSort,
    loadNext,
    applyFilters,
    resetFilters,
  }
}

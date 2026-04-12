import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/pagination'
import { fetchDeduped } from '../utils/fetchDeduped'
import { mapAdDtoToViewModel, mapAdListDtoToViewModel } from '../features/ads/model/adMapper'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'
import { validateAdDetailsDto } from '../utils/apiContract'
import { normalizeModerationStatus } from '@/utils/moderationStatus'

const ALLOWED_SORT_FIELDS = new Set(['title', 'price', 'createdAt', 'updatedAt', 'views', 'favorites'])
const ALLOWED_STATUS_FILTERS = new Set(['active', 'pendingModeration', 'rejected', 'deleted'])

function clampPageSize(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_PAGE_SIZE
  return Math.min(parsed, MAX_PAGE_SIZE)
}

function normalizePage(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_PAGE
}

function normalizeText(value) {
  if (value === undefined || value === null) return ''
  return String(value).trim()
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function normalizeSortValue(params = {}) {
  const explicitSort = normalizeText(params.sort)
  if (explicitSort) {
    const desc = explicitSort.startsWith('-')
    const field = explicitSort.replace(/^-+/, '')
    if (ALLOWED_SORT_FIELDS.has(field)) {
      return desc ? `-${field}` : field
    }
    return '-createdAt'
  }

  const sortBy = normalizeText(params.sortBy).replace(/^-+/, '') || 'createdAt'
  const sortDir = normalizeText(params.sortDir).toLowerCase()
  if (!ALLOWED_SORT_FIELDS.has(sortBy)) return '-createdAt'
  return sortDir === 'asc' ? sortBy : `-${sortBy}`
}

function normalizeStatusFilterValue(value) {
  const normalized = normalizeText(value)
  if (!normalized) return ''

  const compact = normalized.toLowerCase().replace(/[^a-z0-9а-яё]/g, '')
  if (compact === 'active') return 'active'
  if (compact === 'pendingmoderation') return 'pendingModeration'
  if (compact === 'rejected') return 'rejected'
  if (compact === 'deleted') return 'deleted'

  return ALLOWED_STATUS_FILTERS.has(normalized) ? normalized : ''
}

function appendQueryValue(query, key, value) {
  const normalized = normalizeText(value)
  if (!normalized) return
  query.append(key, normalized)
}

function appendQueryValues(query, key, values) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values]
  const normalized = list.map(v => normalizeText(v)).filter(Boolean)
  if (!normalized.length) return
  // API contract: arrays are CSV e.g. location=1,2,3
  const capped = key === 'location' ? normalized.slice(0, 10) : normalized
  query.set(key, capped.join(','))
}

function hasPatchResultShape(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    (
      'success' in data ||
      Array.isArray(data.updated) ||
      Array.isArray(data.skipped) ||
      Array.isArray(data.errors)
    )
  )
}

function buildAdsQueryString(params = {}) {
  const query = new URLSearchParams()
  query.set('page', String(normalizePage(params.page)))
  query.set('pageSize', String(clampPageSize(params.pageSize)))

  const sortValue = normalizeSortValue(params)
  if (sortValue) query.set('sort', sortValue)

  appendQueryValue(query, 'search', params.search)
  appendQueryValue(query, 'category', params.category)
  appendQueryValue(query, 'priceFrom', params.priceFrom)
  appendQueryValue(query, 'priceTo', params.priceTo)
  appendQueryValue(query, 'dateFrom', params.dateFrom)
  appendQueryValue(query, 'dateTo', params.dateTo)
  appendQueryValue(query, 'userId', params.userId)
  appendQueryValue(query, 'status', normalizeStatusFilterValue(params.status))
  appendQueryValue(query, 'type', params.type)
  appendQueryValues(query, 'location', params.location)

  return query.toString()
}

function extractList(data) {
  if (Array.isArray(data)) return { items: data, total: data.length }
  if (Array.isArray(data?.items)) return { items: data.items, total: data.totalCount ?? data.total ?? data.items.length }
  if (Array.isArray(data?.data)) return { items: data.data, total: data.totalCount ?? data.total ?? data.data.length }
  return { items: [], total: 0 }
}

function normalizeTotalCount(value, fallback = 0) {
  const total = Number(value)
  return Number.isFinite(total) && total >= 0 ? total : fallback
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toOptionalBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return Boolean(value)
}

function normalizeCreateAdPayload(adData = {}) {
  const files = Array.isArray(adData.files)
    ? adData.files
    : Array.isArray(adData.Files)
      ? adData.Files
      : []

  return {
    Title: adData.Title ?? adData.title ?? '',
    Description: adData.Description ?? adData.description ?? '',
    Price: toOptionalNumber(adData.Price ?? adData.price),
    IsNegotiable: toOptionalBoolean(adData.IsNegotiable ?? adData.isNegotiable),
    CategoryId: toOptionalNumber(adData.CategoryId ?? adData.categoryId),
    ListingType: adData.ListingType ?? adData.listingType ?? '',
    LocationId: toOptionalNumber(adData.LocationId ?? adData.locationId),
    files: files.filter(Boolean),
    mainImageIndex: toOptionalNumber(adData.mainImageIndex ?? adData.MainImageIndex),
  }
}

function appendFormDataValue(formData, key, value) {
  if (value === undefined || value === null) return

  if (value instanceof Blob) {
    formData.append(key, value)
    return
  }

  formData.append(key, String(value))
}

function buildCreateAdFormData(adData = {}) {
  if (adData instanceof FormData) return adData

  const payload = normalizeCreateAdPayload(adData)
  validateApiRequestBody('post', '/ads', payload)

  const formData = new FormData()
  appendFormDataValue(formData, 'Title', payload.Title)
  appendFormDataValue(formData, 'Description', payload.Description)
  appendFormDataValue(formData, 'Price', payload.Price)
  appendFormDataValue(formData, 'IsNegotiable', payload.IsNegotiable)
  appendFormDataValue(formData, 'CategoryId', payload.CategoryId)
  appendFormDataValue(formData, 'ListingType', payload.ListingType)
  appendFormDataValue(formData, 'LocationId', payload.LocationId)
  appendFormDataValue(formData, 'mainImageIndex', payload.mainImageIndex)

  payload.files.forEach(file => formData.append('files', file))

  return formData
}

export const useAdsStore = defineStore('ads', () => {
  const ads = ref([])
  const selectedAd = ref(null)
  const totalCount = ref(0)
  const page = ref(DEFAULT_PAGE)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  const totalPages = ref(0)
  const isLoading = ref(false)

  let _currentRequestId = 0
  let _currentListController = null
  let _currentListPromise = null
  let _currentListKey = ''

  async function loadAds(params = {}) {
    const pageValue = normalizePage(params.page)
    const pageSizeValue = clampPageSize(params.pageSize)
    const queryString = buildAdsQueryString({ ...params, page: pageValue, pageSize: pageSizeValue })
    const requestKey = queryString

    if (_currentListPromise && requestKey === _currentListKey) {
      return _currentListPromise
    }

    if (_currentListController) {
      _currentListController.abort()
    }

    const controller = new AbortController()
    const requestId = ++_currentRequestId

    _currentListController = controller
    _currentListKey = requestKey
    isLoading.value = true

    _currentListPromise = (async () => {
      try {
        const data = await apiClient.get(`/ads?${queryString}`, {
          errorHandlerOptions: { notify: false },
          signal: controller.signal,
        })

        if (requestId !== _currentRequestId) return

        const { items, total } = extractList(data)
        const mappedItems = mapAdListDtoToViewModel(items)
        ads.value = mappedItems
        totalCount.value = normalizeTotalCount(data.totalCount ?? data.total ?? total, total)
        page.value = normalizePage(data.page ?? data.Page ?? pageValue)
        pageSize.value = clampPageSize(data.pageSize ?? data.PageSize ?? pageSizeValue)
        totalPages.value = normalizeNonNegativeInteger(
          data.totalPages ?? data.TotalPages,
          pageSize.value > 0 ? Math.ceil(totalCount.value / pageSize.value) : 0
        )
      } catch (error) {
        if (requestId !== _currentRequestId || error?.name === 'AbortError') return
        ads.value = []
        totalCount.value = 0
        page.value = pageValue
        pageSize.value = pageSizeValue
        totalPages.value = 0
        throw error
      } finally {
        if (_currentListController === controller) {
          _currentListController = null
          _currentListPromise = null
          _currentListKey = ''
        }
        if (requestId === _currentRequestId) isLoading.value = false
      }
    })()

    return _currentListPromise
  }

  async function loadAd(id) {
    return fetchDeduped(`ad:${id}`, async () => {
      try {
        const data = await apiClient.get(`/ads/${id}`, {
          errorHandlerOptions: { notify: false },
        })

        const validatedData = validateAdDetailsDto(data, { strict: true })

        selectedAd.value = validatedData && typeof validatedData === 'object' && !Array.isArray(validatedData)
          ? mapAdDtoToViewModel(validatedData)
          : null
        return selectedAd.value
      } catch (error) {
        selectedAd.value = null
        throw error
      }
    })
  }

  async function createAd(adData) {
    return createAdWithImages(buildCreateAdFormData(adData))
  }

  async function createAdWithImages(formData) {
    if (!(formData instanceof FormData)) {
      throw new Error('createAdWithImages expects a FormData instance')
    }

    const data = await apiClient.post('/ads', formData, {
      errorHandlerOptions: { notify: false },
    })

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      if (Object.prototype.hasOwnProperty.call(data, 'adId') || Object.prototype.hasOwnProperty.call(data, 'message')) {
        return data
      }

      return mapAdDtoToViewModel(data)
    }

    return data
  }

  function normalizeUploadFilesPayload(value) {
    if (value instanceof FormData) {
      return Array.from(value.getAll('files')).filter(Boolean)
    }

    if (Array.isArray(value)) {
      return value.filter(Boolean)
    }

    return []
  }

  async function uploadAdImages(adId, filesOrFormData) {
    const files = normalizeUploadFilesPayload(filesOrFormData)
    validateApiRequestBody('post', `/ads/${adId}/upload`, { files })

    const formData = new FormData()
    files.forEach(file => formData.append('files', file))

    const data = await apiClient.post(`/ads/${adId}/upload`, formData, {
      errorHandlerOptions: { notify: false },
    })

    return data
  }

  async function updateAd(adId, adData) {
    const data = await apiClient.patch(`/ads/${adId}`, adData, {
      errorHandlerOptions: { notify: false },
    })

    if (!hasPatchResultShape(data) && data && typeof data === 'object' && !Array.isArray(data)) {
      const mapped = mapAdDtoToViewModel(data)
      if (mapped && typeof mapped === 'object' && !Array.isArray(mapped)) {
        selectedAd.value = mapped
      }
      return mapped
    }

    return data
  }

  async function patchModerationStatus(adId, moderationStatus) {
    const payload = {status: normalizeModerationStatus(moderationStatus)}
    validateApiRequestBody('patch', `/ads/${adId}/moderation`, payload)

    const data = await apiClient.patch(`/ads/${adId}/moderation`, payload, {
      errorHandlerOptions: { notify: false },
    })

    const mapped = data && typeof data === 'object' && !Array.isArray(data)
      ? mapAdDtoToViewModel(data)
      : null

    const responseStatus = mapped?.moderationStatus ??
      (data && typeof data === 'object' && !Array.isArray(data)
        ? (data.moderationStatus ?? data.ModerationStatus)
        : undefined) ??
      payload.status

    const normalizedStatus = normalizeModerationStatus(responseStatus)

    const index = ads.value.findIndex(item => String(item.id) === String(adId))
    if (index !== -1) {
      if (mapped && mapped.id != null && String(mapped.id) === String(adId)) {
        ads.value[index] = { ...ads.value[index], ...mapped }
      } else {
        ads.value[index] = {
          ...ads.value[index],
          moderationStatus: normalizedStatus,
          status: normalizedStatus,
        }
      }
    }

    if (selectedAd.value?.id && String(selectedAd.value.id) === String(adId)) {
      if (mapped && mapped.id != null && String(mapped.id) === String(adId)) {
        selectedAd.value = { ...selectedAd.value, ...mapped }
      } else {
        selectedAd.value = {
          ...selectedAd.value,
          moderationStatus: normalizedStatus,
          status: normalizedStatus,
        }
      }
    }

    return mapped ?? data
  }

  async function deleteAd(adId) {
    await apiClient.delete(`/ads/${adId}`, {
      parseAs: 'raw',
      okStatuses: [200, 204],
      errorHandlerOptions: { notify: false },
    })

    selectedAd.value = null
    ads.value = ads.value.filter(item => String(item.id) !== String(adId))
  }

  return {
    ads,
    selectedAd,
    totalCount,
    page,
    pageSize,
    totalPages,
    isLoading,
    loadAds,
    loadAd,
    createAd,
    createAdWithImages,
    uploadAdImages,
    updateAd,
    patchModerationStatus,
    deleteAd,
  }
})

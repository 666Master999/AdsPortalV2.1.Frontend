import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/constants/pagination'
import { fetchDeduped } from '../utils/fetchDeduped'
import { mapAdDtoToViewModel, mapAdListDtoToViewModel } from '../features/ads/model/adMapper'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'
import { validateAdDetailsDto } from '../utils/apiContract'
import { normalizeModerationStatus } from '@/utils/moderationStatus'
import { normalizeLocationIdList } from '../composables/useLocations'

const RESERVED_QUERY_KEYS = new Set([
  'search',
  'location',
  'category',
  'includechildren',
  'pricefrom',
  'priceto',
  'datefrom',
  'dateto',
  'page',
  'pagesize',
  'sort',
  'cursor',
])

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

function normalizeFiniteNumber(value) {
  const normalized = normalizeText(value)
  if (!normalized) return undefined

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeIntegerValue(value) {
  const parsed = normalizeFiniteNumber(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

function normalizeCategoryIdList(value) {
  if (value === undefined || value === null || value === '') return []

  const source = Array.isArray(value)
    ? value
    : String(value)
        .split(',')

  const normalizedIds = []
  const seen = new Set()

  for (const item of source) {
    const parsed = normalizeIntegerValue(item)
    if (parsed === undefined) continue

    const key = String(parsed)
    if (seen.has(key)) continue

    seen.add(key)
    normalizedIds.push(parsed)
  }

  normalizedIds.sort((left, right) => left - right)

  return normalizedIds
}

function hashString(value) {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(36)
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function appendQueryValue(query, key, value) {
  const normalized = normalizeText(value)
  if (!normalized) return
  query.set(key, normalized)
}

function appendNumberValue(query, key, value) {
  const normalized = normalizeFiniteNumber(value)
  if (normalized === undefined) return
  query.set(key, String(normalized))
}

function appendIntegerValue(query, key, value) {
  const normalized = normalizeIntegerValue(value)
  if (normalized === undefined) return
  query.set(key, String(normalized))
}

function appendLocationValues(query, value) {
  const normalizedIds = normalizeLocationIdList(value).slice(0, 10).sort((left, right) => left - right)
  if (!normalizedIds.length) return
  query.set('location', normalizedIds.join(','))
}

function appendCategoryValues(query, value) {
  const normalizedIds = normalizeCategoryIdList(value)
  if (!normalizedIds.length) return
  query.set('category', normalizedIds.join(','))
}

function toBooleanValue(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return null
}

function appendSerializedFilters(query, filters) {
  const serialized = normalizeText(filters)
  if (!serialized) return

  const filterParams = new URLSearchParams(serialized)
  for (const [key, value] of filterParams.entries()) {
    const normalizedKey = normalizeText(key)
    const normalizedValue = normalizeText(value)
    if (!normalizedKey || !normalizedValue) continue
    if (RESERVED_QUERY_KEYS.has(normalizedKey.toLowerCase())) continue
    query.set(normalizedKey, normalizedValue)
  }
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
  const hasCursor = params && params.cursor != null && String(params.cursor).trim() !== ''
  if (!hasCursor) query.set('page', String(normalizePage(params.page)))
  query.set('pageSize', String(clampPageSize(params.pageSize)))

  appendQueryValue(query, 'search', params.search)
  appendLocationValues(query, params.locationIds ?? params.location)
  appendCategoryValues(query, params.categoryIds ?? params.category)

  const includeChildren = toBooleanValue(params.includeChildren)
  if (includeChildren === true) {
    query.set('includeChildren', 'true')
  }

  appendNumberValue(query, 'priceFrom', params.priceFrom)
  appendNumberValue(query, 'priceTo', params.priceTo)
  appendQueryValue(query, 'dateFrom', params.dateFrom)
  appendQueryValue(query, 'dateTo', params.dateTo)

  appendQueryValue(query, 'sort', params.sort)

  appendSerializedFilters(query, params.attributes ?? params.filters)

  if (hasCursor) {
    query.set('cursor', String(params.cursor).trim())
  }

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
  if (!Number.isFinite(total)) return fallback
  if (total === -1) return -1
  return total >= 0 ? total : fallback
}

function toOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const parsed = toBooleanValue(value)
    return parsed === null ? undefined : parsed
  }

  return undefined
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
  const totalPages = ref(null)
  const cursor = ref('')
  const hasMore = ref(false)
  const isLoading = ref(false)

  let _currentRequestId = 0
  let _currentListController = null
  let _currentListPromise = null
  let _currentListKey = ''

  async function fetchAds(params = {}) {
    const pageValue = normalizePage(params.page)
    const pageSizeValue = clampPageSize(params.pageSize)
    const cursorValue = normalizeText(params.cursor)
    const queryString = buildAdsQueryString({
      ...params,
      page: pageValue,
      pageSize: pageSizeValue,
      filters: params.filters,
      cursor: cursorValue,
    })
    const requestKey = `${queryString.length}:${hashString(queryString)}`

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

        const shouldAppend = Boolean(params && params.append)

        if (shouldAppend) {
          ads.value = [...ads.value, ...mappedItems]
        } else {
          ads.value = mappedItems
        }

        totalCount.value = normalizeTotalCount(data.totalCount ?? data.total ?? total, total)
        page.value = normalizePage(data.page ?? data.Page ?? pageValue)
        pageSize.value = clampPageSize(data.pageSize ?? data.PageSize ?? pageSizeValue)
        totalPages.value = normalizeNonNegativeInteger(data.totalPages ?? data.TotalPages)
        cursor.value = normalizeText(data.nextCursor ?? data.NextCursor) || ''
        hasMore.value = Boolean(data.hasMore ?? data.HasMore ?? cursor.value)

        return data
      } catch (error) {
        if (requestId !== _currentRequestId || error?.name === 'AbortError') return
        ads.value = []
        totalCount.value = 0
        page.value = pageValue
        pageSize.value = pageSizeValue
        totalPages.value = 0
        cursor.value = ''
        hasMore.value = false
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

  async function patchModerationStatus(adId, moderationStatus, reason) {
    const payload = {
      status: normalizeModerationStatus(moderationStatus),
      reason: reason == null ? undefined : String(reason).trim(),
    }
    console.debug('[adsStore] patchModerationStatus payload:', payload)
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
        // Merge mapped fields but preserve existing owner/user when server returned a thin DTO
        ads.value[index] = {
          ...ads.value[index],
          ...mapped,
          owner: mapped.owner ?? ads.value[index].owner,
          user: mapped.user ?? ads.value[index].user,
        }
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
        // Merge mapped fields but keep existing owner/user if missing in mapped
        selectedAd.value = {
          ...selectedAd.value,
          ...mapped,
          owner: mapped.owner ?? selectedAd.value.owner,
          user: mapped.user ?? selectedAd.value.user,
        }
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
    cursor,
    hasMore,
    isLoading,
    fetchAds,
    loadAd,
    createAd,
    createAdWithImages,
    uploadAdImages,
    updateAd,
    patchModerationStatus,
    deleteAd,
  }
})

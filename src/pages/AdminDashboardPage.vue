<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAccessService } from '../services/accessService'
import { toPublicErrorMessage } from '../services/errorService'
import { apiClient } from '../api/apiClient'
import { mapAdListDtoToViewModel } from '../features/ads/model/adMapper'
import { getModerationStatusClass, getModerationStatusLabel } from '@/utils/moderationStatus'
import { resolveMediaUrl } from '../utils/resolveMediaUrl'
import Pagination from '../components/Pagination.vue'

const route = useRoute()
const access = useAccessService()

const ads = ref([])
const users = ref([])
const logs = ref([])
const deadletters = ref([])
const outboxItems = ref([])
const isLoading = ref(false)
const error = ref('')
const adsMeta = ref({ total: 0, page: 1, pageSize: 20, totalPages: 0, paged: true })
const usersMeta = ref({ total: 0, page: 1, pageSize: 20, totalPages: 0, paged: true })
const logsMeta = ref({ total: 0, page: 1, pageSize: 20, totalPages: 0, paged: true })
const deadlettersMeta = ref({ items: [], total: 0, page: 1, pageSize: 0, totalPages: 0, paged: false })
const outboxMeta = ref({ items: [], total: 0, page: 1, pageSize: 0, totalPages: 0, paged: false })
const TAKE = 20
const DEFAULT_ADMIN_ADS_PAGE_SIZE = 20
const ADMIN_ADS_PAGE_SIZES = [20, 50]
const ADMIN_ADS_STATUS_OPTIONS = ['active', 'pendingModeration', 'rejected', 'deleted']
const ADMIN_ADS_SORT_OPTIONS = [
  { value: '', label: 'Сначала новые' },
  { value: 'reports', label: 'По жалобам' },
]
const userActionId = ref('')
const adActionId = ref('')
const deadletterActionId = ref('')
const outboxActionId = ref('')
const loadedTabs = reactive({ ads: false, users: false, logs: false, deadletters: false, outbox: false })
const LOGIN_BAN_TYPE = 'LoginBan'
const adminAdsQuery = reactive({
  page: 1,
  pageSize: DEFAULT_ADMIN_ADS_PAGE_SIZE,
  status: [],
  sort: '',
})

const deadletterBulkCount = ref(50)
const deadletterBulkInProgress = ref(false)
const deadletterFilterEventType = ref('')
const deadletterFilterMaxAttemptCount = ref(null)
const outboxFilterStatus = ref('')
const outboxFilterCorrelationId = ref('')
const outboxFilterEventType = ref('')
const outboxSummary = ref(null)
const outboxSummaryInProgress = ref(false)

function normalizeTab(tab) {
  const value = String(tab || 'ads')
  return value === 'complaints' ? 'logs' : value
}

const canAccessAdmin = computed(() => access.canAccessAdmin())
const canModerateAds = computed(() => access.canModerate())
const activeTab = computed(() => {
  const requested = normalizeTab(route.query.tab)
  if (!canAccessAdmin.value && requested !== 'ads') return 'ads'
  return requested
})

function hasMore(meta) {
  return Boolean(meta?.paged && meta.page < meta.totalPages)
}

function normalizePositiveInteger(value, fallback = 1) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function clampAdminAdsPageSize(value) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_ADMIN_ADS_PAGE_SIZE
  return Math.min(parsed, 50)
}

function normalizeAdminAdsSort(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'reports' || normalized === 'reports_desc') return 'reports'
  return ''
}

function buildAdminAdsQueryString() {
  const query = new URLSearchParams()
  query.set('page', String(normalizePositiveInteger(adminAdsQuery.page, 1)))
  query.set('pageSize', String(clampAdminAdsPageSize(adminAdsQuery.pageSize)))

  if (adminAdsQuery.status.length) {
    query.set('status', adminAdsQuery.status.join(','))
  }

  const sort = normalizeAdminAdsSort(adminAdsQuery.sort)
  if (sort) {
    query.set('sort', sort)
  }

  return query.toString()
}

function isAdminAdsStatusSelected(status) {
  return adminAdsQuery.status.includes(status)
}

function toggleAdminAdsStatus(status) {
  const normalized = String(status || '').trim()
  if (!ADMIN_ADS_STATUS_OPTIONS.includes(normalized)) return

  const next = new Set(adminAdsQuery.status)
  if (next.has(normalized)) next.delete(normalized)
  else next.add(normalized)

  adminAdsQuery.status = ADMIN_ADS_STATUS_OPTIONS.filter(item => next.has(item))
  adminAdsQuery.page = 1
  void loadActiveTab({ force: true })
}

function setAdminAdsSort(value) {
  const nextSort = normalizeAdminAdsSort(value)
  if (nextSort === adminAdsQuery.sort) return

  adminAdsQuery.sort = nextSort
  adminAdsQuery.page = 1
  void loadActiveTab({ force: true })
}

function setAdminAdsPage(value) {
  const nextPage = normalizePositiveInteger(value, 1)
  if (nextPage === adminAdsQuery.page) return

  adminAdsQuery.page = nextPage
  void loadActiveTab({ force: true })
}

function setAdminAdsPageSize(value) {
  const nextPageSize = clampAdminAdsPageSize(value)
  if (nextPageSize === adminAdsQuery.pageSize) return

  adminAdsQuery.pageSize = nextPageSize
  adminAdsQuery.page = 1
  void loadActiveTab({ force: true })
}

function resetAdminAdsFilters() {
  adminAdsQuery.status = []
  adminAdsQuery.sort = ''
  adminAdsQuery.page = 1
  adminAdsQuery.pageSize = DEFAULT_ADMIN_ADS_PAGE_SIZE
  void loadActiveTab({ force: true })
}

const imagePlaceholder =
  'data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2240%22%20height%3D%2240%22%3E%3Crect%20width%3D%2240%22%20height%3D%2240%22%20fill%3D%22%23e9ecef%22/%3E%3Ctext%20x%3D%2220%22%20y%3D%2224%22%20font-family%3D%22Arial%2C%20sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23777%22%20text-anchor%3D%22middle%22%20alignment-baseline%3D%22middle%22%3E%3F%3C/text%3E%3C/svg%3E'

function getAdMainImage(ad) {
  const path = ad?.mainImagePath || ad?.mainImageUrl || ad?.mainImage || ad?.image
  return path ? resolveMediaUrl(path) : imagePlaceholder
}

function formatDate(dateString) {
  if (!dateString) return ''
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function pickText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

function extractPage(data) {
  if (Array.isArray(data)) {
    return {
      items: data,
      total: data.length,
      page: 1,
      pageSize: data.length,
      totalPages: 1,
      paged: false,
    }
  }

  if (Array.isArray(data?.items)) {
    const total = Number(data.totalCount ?? data.total ?? data.items.length) || data.items.length
    const page = Number(data.page ?? 1) || 1
    const pageSize = Number(data.pageSize ?? data.items.length ?? TAKE) || TAKE
    const totalPages = Number(data.totalPages ?? Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))) || 1
    return { items: data.items, total, page, pageSize, totalPages, paged: true }
  }

  if (Array.isArray(data?.data)) {
    const total = Number(data.totalCount ?? data.total ?? data.data.length) || data.data.length
    const page = Number(data.page ?? 1) || 1
    const pageSize = Number(data.pageSize ?? data.data.length ?? TAKE) || TAKE
    const totalPages = Number(data.totalPages ?? Math.max(1, Math.ceil(total / Math.max(pageSize, 1)))) || 1
    return { items: data.data, total, page, pageSize, totalPages, paged: true }
  }

  return { items: [], total: 0, page: 1, pageSize: TAKE, totalPages: 0, paged: true }
}

function formatModerationStatus(status) {
  return getModerationStatusLabel(status)
}

function formatListingType(listingType) {
  const normalized = String(listingType ?? '').trim().toLowerCase()
  if (normalized === 'sell') return 'Продажа'
  if (normalized === 'buy') return 'Покупка'
  if (normalized === 'service') return 'Услуга'
  return listingType || '—'
}

function moderationStatusClass(status) {
  return getModerationStatusClass(status)
}

function getAdId(ad) {
  return ad?.id ?? null
}

function getAdRejectionReason(ad) {
  return ad?.rejectionReason || ''
}

function updateAdAfterModeration(adId, patch = {}) {
  ads.value = ads.value.map((ad) => {
    if (String(getAdId(ad)) !== String(adId)) return ad
    return { ...ad, ...patch }
  })
}

async function runAdAction(ad, config) {
  const adId = getAdId(ad)
  if (!adId || adActionId.value) return

  adActionId.value = String(adId)
  error.value = ''

  try {
    const endpoint = config.endpoint ? `/${config.endpoint}` : ''

    await apiClient.request(`/admin/ads/${adId}${endpoint}`, {
      method: config.method || 'POST',
      body: config.body ?? null,
      errorHandlerOptions: { notify: false },
    })

    if (activeTab.value === 'ads') {
      await loadActiveTab({ force: true })
    } else if (config.patch) {
      updateAdAfterModeration(adId, config.patch)
    }
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось выполнить действие')
  } finally {
    adActionId.value = ''
  }
}

async function approveAd(ad) {
  await runAdAction(ad, {
    endpoint: 'approve',
    patch: {
      moderationStatus: 'active',
      status: 'active',
      rejectionReason: null,
      rejectedReason: null,
    },
  })
}

async function rejectAd(ad) {
  const reason = prompt('Укажите причину отклонения:', getAdRejectionReason(ad) || '')
  if (reason === null) return

  await runAdAction(ad, {
    endpoint: 'reject',
    body: { reason: String(reason || '').trim() },
    patch: {
      moderationStatus: 'rejected',
      status: 'rejected',
      rejectionReason: String(reason || '').trim(),
      rejectedReason: String(reason || '').trim(),
    },
  })
}

async function sendToModeration(ad) {
  await runAdAction(ad, {
    endpoint: 'send-to-moderation',
    patch: {
      moderationStatus: 'pendingModeration',
      status: 'pendingModeration',
    },
  })
}

async function softDeleteAd(ad) {
  await runAdAction(ad, {
    endpoint: '',
    method: 'DELETE',
    patch: {
      moderationStatus: 'deleted',
      status: 'deleted',
    },
  })
}

function getAdCategoryText(ad) {
  return pickText(ad?.category?.name, typeof ad?.category === 'string' ? ad.category : null, ad?.categoryName) || 'Без категории'
}

function getAdLocationText(ad) {
  return pickText(
    ad?.location?.name,
    typeof ad?.location === 'string' ? ad.location : null,
    ad?.locationName,
    ad?.city?.name,
    typeof ad?.city === 'string' ? ad.city : null,
    ad?.district?.name,
    typeof ad?.district === 'string' ? ad.district : null,
    ad?.region?.name,
    typeof ad?.region === 'string' ? ad.region : null,
  ) || '—'
}

function getUserId(user) {
  return user?.id ?? null
}

function getUserDisplayName(user) {
  const name = pickText(user?.userName, user?.name)
  const login = pickText(user?.userLogin, user?.login)

  if (name && login && name !== login) return `${name} (${login})`
  return name || login || `#${getUserId(user) ?? '—'}`
}

function getUserEmail(user) {
  return pickText(user?.userEmail, user?.email) || '—'
}

function getUserCreatedAt(user) {
  return user?.createdAt ?? null
}

function getUserLastActivity(user) {
  return user?.lastActivityAt ?? null
}

function getUserRoles(user) {
  const source = user?.roles ?? user?.role ?? []
  if (Array.isArray(source)) {
    return source
      .map(role => String(role || '').trim())
      .filter(Boolean)
  }

  return String(source || '')
    .split(',')
    .map(role => String(role || '').trim())
    .filter(Boolean)
}

function getUserRoleClass(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'admin' || normalized === 'superadmin') return 'bg-success'
  if (normalized === 'moderator') return 'bg-info text-dark'
  return 'bg-secondary'
}

function getAdminTabEndpoint(tab) {
  switch (normalizeTab(tab)) {
    case 'ads':
      return 'ads'
    case 'users':
      return 'users'
    case 'logs':
      return 'logs'
    case 'outbox':
      return 'outbox'
    case 'deadletters':
      return 'deadletters'
    default:
      return ''
  }
}

function getLogTimestamp(log) {
  return log?.createdAt ?? log?.timestamp ?? log?.occurredAt ?? null
}

function getLogLevel(log) {
  return pickText(log?.level, log?.severity, log?.type, log?.eventType) || 'INFO'
}

function getLogLevelClass(log) {
  const normalized = getLogLevel(log).toLowerCase()
  switch (normalized) {
    case 'error':
    case 'critical':
    case 'failed':
      return 'bg-danger'
    case 'warn':
    case 'warning':
      return 'bg-warning text-dark'
    case 'success':
      return 'bg-success'
    default:
      return 'bg-secondary'
  }
}

function getLogTitle(log) {
  return pickText(log?.message, log?.description, log?.action, log?.event, log?.title, log?.name) || `Запись #${log?.id ?? '—'}`
}

function getLogActor(log) {
  const actor = pickText(log?.userName, log?.userLogin, log?.actorName, log?.actorLogin, log?.userEmail, log?.actorEmail)
  if (actor) return actor

  const actorId = log?.userId ?? log?.actorId
  return actorId ? `Пользователь #${actorId}` : '—'
}

function getLogMeta(log) {
  const bits = []
  const entity = pickText(log?.entityType, log?.targetType, log?.resourceType)
  const entityId = pickText(log?.entityId, log?.targetId, log?.resourceId)
  const ip = pickText(log?.ipAddress, log?.ip)

  if (entity) bits.push(entity)
  if (entityId) bits.push(`#${entityId}`)
  if (ip) bits.push(`IP: ${ip}`)

  return bits.join(' · ')
}

async function loadActiveTab(options = {}) {
  const tab = normalizeTab(activeTab.value)
  const endpoint = getAdminTabEndpoint(tab)
  const force = Boolean(options.force)

  error.value = ''

  if (!endpoint) return
  if (tab !== 'ads' && !force && loadedTabs[tab]) return

  isLoading.value = true

  try {
    let data

    if (tab === 'ads') {
      data = await apiClient.get(`/admin/ads?${buildAdminAdsQueryString()}`, {
        errorHandlerOptions: { notify: false },
      })
    } else if (tab === 'deadletters') {
      data = await apiClient.get(`/admin/deadletters`, {
        errorHandlerOptions: { notify: false },
      })
    } else if (tab === 'outbox') {
      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('pageSize', String(TAKE))
      if (outboxFilterStatus.value) params.set('status', String(outboxFilterStatus.value))
      if (outboxFilterCorrelationId.value) params.set('correlationId', String(outboxFilterCorrelationId.value))
      if (outboxFilterEventType.value) params.set('eventType', String(outboxFilterEventType.value))
      data = await apiClient.get(`/admin/outbox?${params.toString()}`, {
        errorHandlerOptions: { notify: false },
      })
    } else {
      data = await apiClient.get(`/admin/${endpoint}?page=1&pageSize=${TAKE}`, {
        errorHandlerOptions: { notify: false },
      })
    }

    const { items, total, page, pageSize, totalPages, paged } = extractPage(data)

    if (tab === 'ads') {
      const mappedItems = mapAdListDtoToViewModel(items)
      ads.value = mappedItems
      adminAdsQuery.page = page
      adminAdsQuery.pageSize = pageSize
      adsMeta.value = { total, page, pageSize, totalPages, paged }
    } else if (tab === 'users') {
      if (!canAccessAdmin.value) return
      users.value = items
      usersMeta.value = { total, page, pageSize, totalPages, paged }
    } else if (tab === 'logs') {
      if (!canAccessAdmin.value) return
      logs.value = items
      logsMeta.value = { total, page, pageSize, totalPages, paged }
    } else if (tab === 'deadletters') {
      if (!canAccessAdmin.value) return
      deadletters.value = items
      deadlettersMeta.value = { items, total, page, pageSize, totalPages, paged }
    } else if (tab === 'outbox') {
      if (!canAccessAdmin.value) return
      outboxItems.value = items
      outboxMeta.value = { items, total, page, pageSize, totalPages, paged }
      // Load summary when opening outbox
      void loadOutboxSummary()
    }

    if (tab !== 'ads') {
      loadedTabs[tab] = true
    }
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось загрузить данные')
  } finally {
    isLoading.value = false
  }
}

async function loadMoreTab(tab) {
  const endpointMap = { users: 'users', logs: 'logs', outbox: 'outbox' }
  const listMap = { users, logs, outbox: outboxItems }
  const metaMap = { users: usersMeta, logs: logsMeta, outbox: outboxMeta }
  const endpoint = endpointMap[tab]
  const list = listMap[tab]
  const meta = metaMap[tab]

  if (!endpoint || !meta.value.paged || meta.value.page >= meta.value.totalPages) return
  if ((tab === 'users' || tab === 'logs') && !canAccessAdmin.value) return

  isLoading.value = true
  error.value = ''

  try {
    const nextPage = Number(meta.value.page || 1) + 1
    const data = await apiClient.get(`/admin/${endpoint}?page=${nextPage}&pageSize=${TAKE}`, {
      errorHandlerOptions: { notify: false },
    })
    const { items, total, page, pageSize, totalPages, paged } = extractPage(data)
    const mappedItems = tab === 'ads' ? mapAdListDtoToViewModel(items) : items
    list.value = [...list.value, ...mappedItems]
    meta.value = { total, page, pageSize, totalPages, paged }
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось загрузить')
  } finally {
    isLoading.value = false
  }
}

async function runUserRestrictionAction(userId, config) {
  if (!userId || userActionId.value) return

  userActionId.value = String(userId)
  error.value = ''

  try {
    const method = config.method || 'POST'
    const endpoint = method === 'DELETE'
      ? `/admin/users/${userId}/restrictions/${config.type || LOGIN_BAN_TYPE}`
      : `/admin/users/${userId}/restrictions`

    await apiClient.request(endpoint, {
      method,
      body: config.body ?? null,
      errorHandlerOptions: { notify: false },
    })

    if (typeof config.onSuccess === 'function') {
      config.onSuccess()
    }
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, config.errorMessage || 'Не удалось выполнить действие')
  } finally {
    userActionId.value = ''
  }
}

async function retryDeadLetter(item) {
  if (!item || deadletterActionId.value) return
  deadletterActionId.value = String(item.id)
  error.value = ''
  try {
    await apiClient.post(`/admin/deadletters/${item.id}/retry`, null, { errorHandlerOptions: { notify: false } })
    await loadActiveTab({ force: true })
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось повторить сообщение')
  } finally {
    deadletterActionId.value = ''
  }
}

async function downloadDeadLetterPayload(id) {
  if (!id) return
  error.value = ''
  try {
    const response = await apiClient.request(`/admin/deadletters/${id}/payload`, { method: 'GET', parseAs: 'raw', errorHandlerOptions: { notify: false } })
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `deadletter-${id}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось скачать payload')
  }
}

async function retryDeadlettersBulk() {
  if (deadletterBulkInProgress.value) return
  const count = Number(deadletterBulkCount.value || 0)
  if (!Number.isInteger(count) || count <= 0) {
    error.value = 'Количество должно быть положительным'
    return
  }
  const params = new URLSearchParams()
  if (deadletterFilterEventType.value) params.set('eventType', String(deadletterFilterEventType.value))
  const maxAttempt = Number(deadletterFilterMaxAttemptCount.value)
  if (Number.isInteger(maxAttempt) && maxAttempt > 0) params.set('maxAttemptCount', String(maxAttempt))
  const query = params.toString() ? `?${params.toString()}` : ''

  deadletterBulkInProgress.value = true
  error.value = ''
  try {
    const result = await apiClient.post(`/admin/deadletters/retry-bulk${query}`, count, { errorHandlerOptions: { notify: false } })
    await loadActiveTab({ force: true })
    const retried = result?.Retried ?? result?.retried ?? 0
    error.value = `Retried: ${retried}`
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось выполнить bulk retry')
  } finally {
    deadletterBulkInProgress.value = false
  }
}

async function loadOutboxSummary(windowSeconds = 60) {
  if (outboxSummaryInProgress.value) return
  outboxSummaryInProgress.value = true
  error.value = ''
  try {
    const result = await apiClient.get(`/admin/outbox/summary?windowSeconds=${Number(windowSeconds)}`, { errorHandlerOptions: { notify: false } })
    outboxSummary.value = result
  } catch (ex) {
    error.value = toPublicErrorMessage(ex, 'Не удалось загрузить сводку Outbox')
  } finally {
    outboxSummaryInProgress.value = false
  }
}

function banUser(id) {
  const reason = prompt('Укажите причину ограничения входа:', '')
  if (reason === null) return

  return runUserRestrictionAction(id, {
    method: 'POST',
    body: {
      type: LOGIN_BAN_TYPE,
      reason: String(reason || '').trim() || null,
      expiresAt: null,
    },
    errorMessage: 'Не удалось заблокировать вход пользователя',
  })
}

function unbanUser(id) {
  return runUserRestrictionAction(id, {
    method: 'DELETE',
    type: LOGIN_BAN_TYPE,
    errorMessage: 'Не удалось снять блокировку входа',
  })
}

onMounted(() => {
  void loadActiveTab()
})

watch(
  activeTab,
  () => {
    void loadActiveTab()
  }
)
</script>

<template>
  <div class="container-fluid px-3 px-lg-4 py-3 py-lg-4">
    <div class="mx-auto rounded-5 border bg-body-tertiary shadow-lg overflow-hidden" style="max-width: 1520px; min-height: calc(100vh - 90px);">
      <div class="d-flex flex-column h-100">
        <div class="px-3 px-lg-4 py-3 border-bottom bg-white d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
          <div>
            <div class="small text-uppercase text-secondary fw-semibold mb-1">Admin</div>
            <h1 class="h3 mb-0 fw-semibold">Панель администратора</h1>
          </div>
          <ul class="nav nav-pills flex-wrap gap-2">
            <li class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'ads' }" to="/admin?tab=ads">Объявления</router-link>
            </li>
            <li v-if="canAccessAdmin" class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'users' }" to="/admin?tab=users">Пользователи</router-link>
            </li>
            <li v-if="canAccessAdmin" class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'logs' }" to="/admin?tab=logs">Логи</router-link>
            </li>
            <li v-if="canAccessAdmin" class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'outbox' }" to="/admin?tab=outbox">Outbox</router-link>
            </li>
            <li v-if="canAccessAdmin" class="nav-item">
              <router-link class="nav-link rounded-pill" :class="{ active: activeTab === 'deadletters' }" to="/admin?tab=deadletters">Очередь ошибок</router-link>
            </li>
            <li v-if="canAccessAdmin" class="nav-item">
              <router-link class="nav-link rounded-pill" to="/admin/categories">Категории</router-link>
            </li>
          </ul>
        </div>

        <div class="flex-grow-1 overflow-auto p-3 p-lg-4" style="min-height: 0;">
          <p v-if="isLoading" class="alert alert-secondary">Загрузка...</p>
          <p v-if="error" class="alert alert-danger">{{ error }}</p>

          <section v-if="activeTab === 'ads'" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3 mb-3">
                <h3 class="h5 mb-0 fw-semibold">Объявления</h3>
                <div class="small text-secondary">Всего: {{ adsMeta.total }}</div>
              </div>

              <div class="border rounded-4 bg-body-tertiary p-3 mb-3 d-grid gap-3">
                <div class="row g-3 align-items-end">
                  <div class="col-12 col-xl-7">
                    <label class="form-label small text-uppercase text-secondary fw-semibold mb-2">Статусы</label>
                    <div class="d-flex flex-wrap gap-2">
                      <button
                        v-for="status in ADMIN_ADS_STATUS_OPTIONS"
                        :key="status"
                        type="button"
                        class="btn btn-sm rounded-pill"
                        :class="isAdminAdsStatusSelected(status) ? 'btn-dark' : 'btn-light border'"
                        @click="toggleAdminAdsStatus(status)"
                      >
                        {{ formatModerationStatus(status) }}
                      </button>
                    </div>
                  </div>

                  <div class="col-12 col-md-6 col-xl-3">
                    <label class="form-label small text-uppercase text-secondary fw-semibold mb-2">Сортировка</label>
                    <select class="form-select rounded-pill" :value="adminAdsQuery.sort" @change="setAdminAdsSort($event.target.value)">
                      <option v-for="option in ADMIN_ADS_SORT_OPTIONS" :key="option.value || 'default'" :value="option.value">
                        {{ option.label }}
                      </option>
                    </select>
                  </div>

                  <div class="col-12 col-md-6 col-xl-2 d-flex align-items-end">
                    <button type="button" class="btn btn-outline-secondary rounded-pill w-100" @click="resetAdminAdsFilters">
                      Сбросить
                    </button>
                  </div>
                </div>

                <div class="d-flex flex-wrap align-items-center gap-2">
                  <span v-if="adminAdsQuery.sort === 'reports'" class="badge rounded-pill text-bg-dark">Сортировка по жалобам</span>
                  <span v-if="adminAdsQuery.status.length" class="badge rounded-pill text-bg-light border text-secondary">
                    Статусов: {{ adminAdsQuery.status.length }}
                  </span>
                </div>
              </div>

              <div class="list-group">
                <div class="list-group-item list-group-item-action rounded-4 shadow-sm mb-2 border" v-for="ad in ads" :key="ad.id">
                  <div class="d-flex gap-3">
                    <img
                      :src="getAdMainImage(ad)"
                      :alt="ad.title"
                      width="60"
                      height="60"
                      class="rounded"
                      style="object-fit: cover; flex-shrink: 0"
                      @error="event => (event.target.src = imagePlaceholder)"
                    />
                    <div class="flex-grow-1">
                      <div class="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-2">
                        <div>
                          <router-link :to="`/ads/${ad.id}`" class="h6 mb-1 d-block text-decoration-none text-dark">{{ ad.title }}</router-link>
                          <div class="d-flex flex-wrap gap-2 align-items-center small">
                            <span class="badge bg-light text-dark border">{{ getAdCategoryText(ad) }}</span>
                            <span class="text-muted">{{ getAdLocationText(ad) }}</span>
                            <span class="text-primary fw-semibold">{{ ad.price ? ad.price + ' ₽' : 'Цена не указана' }}</span>
                          </div>
                          <div class="text-muted small mt-1">
                            Создано: {{ formatDate(ad.createdAt) }}
                            <span v-if="ad.updatedAt">· Обновлено: {{ formatDate(ad.updatedAt) }}</span>
                          </div>
                          <div v-if="getAdRejectionReason(ad)" class="small text-danger mt-1">
                            Причина отклонения: {{ getAdRejectionReason(ad) }}
                          </div>
                        </div>
                            <div class="d-flex flex-column align-items-end gap-2">
                              <span class="badge" :class="moderationStatusClass(ad.moderationStatus ?? ad.status)">{{ formatModerationStatus(ad.moderationStatus ?? ad.status) }}</span>
                              <span class="badge bg-secondary">{{ formatListingType(ad.listingType) }}</span>
                            </div>
                      </div>

                      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-2">
                        <div class="text-muted small">
                          Автор: <router-link :to="`/users/${ad.user?.id ?? ad.authorId ?? ad.userId}`" class="text-decoration-none">{{ pickText(ad.user?.userLogin, ad.userLogin, ad.user?.userName, ad.authorName, ad.userName, ad.userId) || '—' }}</router-link>
                        </div>
                        <div class="d-flex flex-wrap gap-2 justify-content-end">
                          <router-link :to="`/ads/${ad.id}`" class="btn btn-sm btn-primary">Просмотреть объявление</router-link>
                          <router-link :to="`/ads/${ad.id}`" class="btn btn-sm btn-outline-dark" title="Открыть объявление для проверки жалоб">Жалобы</router-link>
                          <template v-if="canModerateAds">
                            <button class="btn btn-sm btn-outline-success" :disabled="adActionId === String(getAdId(ad))" @click="approveAd(ad)">Одобрить</button>
                            <button class="btn btn-sm btn-outline-danger" :disabled="adActionId === String(getAdId(ad))" @click="rejectAd(ad)">Отклонить</button>
                            <button class="btn btn-sm btn-outline-warning" :disabled="adActionId === String(getAdId(ad))" @click="sendToModeration(ad)">На модерацию</button>
                            <button class="btn btn-sm btn-outline-secondary" :disabled="adActionId === String(getAdId(ad))" @click="softDeleteAd(ad)">Удалить</button>
                          </template>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p v-if="!ads.length && !isLoading" class="text-secondary small mb-0 mt-3">Объявления не найдены.</p>
            </div>
            <div v-if="adsMeta.paged && adsMeta.totalPages > 1" class="card-footer bg-transparent border-top-0 pt-0">
              <Pagination
                :currentPage="adsMeta.page"
                :totalPages="adsMeta.totalPages"
                :totalCount="adsMeta.total"
                :pageSize="adsMeta.pageSize"
                :pageSizes="ADMIN_ADS_PAGE_SIZES"
                @changePage="setAdminAdsPage"
                @changePageSize="setAdminAdsPageSize"
              />
            </div>
          </section>

          <section v-if="canAccessAdmin && activeTab === 'deadletters'" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="h5 mb-0 fw-semibold">Очередь ошибок</h3>
                            <div class="d-flex gap-2 align-items-center">
                              <input type="text" class="form-control form-control-sm" style="width:200px" v-model="deadletterFilterEventType" placeholder="eventType" />
                              <input type="number" class="form-control form-control-sm" style="width:140px" v-model.number="deadletterFilterMaxAttemptCount" min="1" placeholder="max attempts" />
                              <input type="number" class="form-control form-control-sm" style="width:120px" v-model.number="deadletterBulkCount" min="1" />
                              <button class="btn btn-sm btn-outline-primary rounded-pill" :disabled="deadletterBulkInProgress" @click="retryDeadlettersBulk">
                                <span v-if="deadletterBulkInProgress" class="spinner-border spinner-border-sm me-2" role="status"></span>
                                Повторить пачку
                              </button>
                            </div>
              </div>

              <div class="list-group">
                <div class="list-group-item list-group-item-action rounded-4 shadow-sm mb-2 border" v-for="dl in deadletters" :key="dl.id">
                  <div class="d-flex flex-column flex-lg-row justify-content-between gap-3">
                    <div class="flex-grow-1">
                      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                        <span class="badge bg-light text-dark border">{{ dl.eventType }}</span>
                        <span class="small text-secondary">{{ formatDate(dl.createdAt) || '—' }}</span>
                        <span class="small text-secondary">Попыток: {{ dl.attemptCount ?? 0 }}</span>
                      </div>
                      <div class="fw-semibold small text-truncate">{{ dl.payloadJson ? (dl.payloadJson.slice(0, 200) + (dl.payloadJson.length > 200 ? '…' : '')) : '—' }}</div>
                      <div v-if="dl.error" class="small text-danger mt-1">{{ dl.error }}</div>
                    </div>

                    <div class="d-flex flex-column align-items-end gap-2">
                      <div class="d-flex flex-wrap gap-2">
                        <button class="btn btn-sm btn-outline-primary" @click="downloadDeadLetterPayload(dl.id)">Скачать payload</button>
                        <button class="btn btn-sm btn-outline-success" :disabled="deadletterActionId === String(dl.id)" @click="retryDeadLetter(dl)">
                          {{ deadletterActionId === String(dl.id) ? 'Выполнение...' : 'Повторить' }}
                        </button>
                      </div>
                      <details class="flex-shrink-0 mt-2">
                        <summary class="small text-secondary">Raw</summary>
                        <pre class="mb-0 mt-2 small font-monospace">{{ JSON.stringify(dl, null, 2) }}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>

              <p v-if="!deadletters.length && !isLoading" class="text-secondary small mb-0 mt-3">Сообщений не найдено.</p>
            </div>
          </section>

          <section v-if="canAccessAdmin && activeTab === 'users'" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <h3 class="h5 mb-3 fw-semibold">Пользователи</h3>
              <div class="list-group">
                <div v-for="user in users" :key="getUserId(user) ?? getUserEmail(user)" class="list-group-item list-group-item-action rounded-4 shadow-sm mb-2 border">
                  <div class="d-flex flex-column flex-lg-row justify-content-between gap-3">
                    <div>
                      <div class="fw-semibold">{{ getUserDisplayName(user) }}</div>
                      <div class="small text-secondary">ID: {{ getUserId(user) ?? '—' }} · Email: {{ getUserEmail(user) }}</div>
                      <div class="small text-secondary">
                        Создан: {{ formatDate(getUserCreatedAt(user)) || '—' }}
                        <span v-if="getUserLastActivity(user)">· Последняя активность: {{ formatDate(getUserLastActivity(user)) || '—' }}</span>
                      </div>
                    </div>

                    <div class="d-flex flex-column flex-lg-row align-items-start align-items-lg-center justify-content-start justify-content-lg-end gap-3">
                      <div class="d-flex flex-wrap gap-2">
                        <span
                          v-for="role in getUserRoles(user)"
                          :key="role"
                          class="badge rounded-pill"
                          :class="getUserRoleClass(role)"
                        >
                          {{ role }}
                        </span>
                        <span v-if="!getUserRoles(user).length" class="badge rounded-pill bg-secondary">
                          Пользователь
                        </span>
                      </div>

                      <div class="btn-group btn-group-sm" role="group" aria-label="User restrictions">
                        <button
                          class="btn btn-outline-danger"
                          :disabled="userActionId === String(getUserId(user))"
                          @click="banUser(getUserId(user))"
                        >
                          {{ userActionId === String(getUserId(user)) ? 'Выполнение...' : 'Заблокировать вход' }}
                        </button>
                        <button
                          class="btn btn-outline-success"
                          :disabled="userActionId === String(getUserId(user))"
                          @click="unbanUser(getUserId(user))"
                        >
                          {{ userActionId === String(getUserId(user)) ? 'Выполнение...' : 'Снять блокировку' }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="hasMore(usersMeta)" class="card-footer bg-transparent text-center border-top-0 pt-0">
              <button class="btn btn-outline-secondary rounded-pill px-4" :disabled="isLoading" @click="loadMoreTab('users')">
                <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
                Загрузить ещё ({{ users.length }} / {{ usersMeta.total }})
              </button>
            </div>
          </section>

          <section v-if="canAccessAdmin && activeTab === 'outbox'" class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h3 class="h5 mb-0 fw-semibold">Outbox (статус)</h3>
                <div class="d-flex gap-2 align-items-center">
                  <input type="text" class="form-control form-control-sm" style="width:160px" v-model="outboxFilterStatus" placeholder="status" />
                  <input type="text" class="form-control form-control-sm" style="width:200px" v-model="outboxFilterCorrelationId" placeholder="correlationId" />
                  <input type="text" class="form-control form-control-sm" style="width:200px" v-model="outboxFilterEventType" placeholder="eventType" />
                  <button class="btn btn-sm btn-outline-secondary rounded-pill" @click="() => { void loadActiveTab({ force: true }) }">Применить</button>
                  <button class="btn btn-sm btn-outline-primary rounded-pill" :disabled="outboxSummaryInProgress" @click="() => { void loadOutboxSummary() }">
                    <span v-if="outboxSummaryInProgress" class="spinner-border spinner-border-sm me-2" role="status"></span>
                    Обновить сводку
                  </button>
                </div>
              </div>

              <div v-if="outboxSummary" class="mb-3">
                <div class="row g-2">
                  <div class="col-auto small text-secondary">PendingBacklog: <strong>{{ outboxSummary.PendingBacklog ?? outboxSummary.pendingBacklog ?? '—' }}</strong></div>
                  <div class="col-auto small text-secondary">DeadLetterCount: <strong>{{ outboxSummary.DeadLetterCount ?? outboxSummary.deadLetterCount ?? '—' }}</strong></div>
                  <div class="col-auto small text-secondary">AvgLatencyMs: <strong>{{ outboxSummary.AvgLatencyMs ?? outboxSummary.avgLatencyMs ?? '—' }}</strong></div>
                  <div class="col-auto small text-secondary">P95LatencyMs: <strong>{{ outboxSummary.P95LatencyMs ?? outboxSummary.p95LatencyMs ?? '—' }}</strong></div>
                  <div class="col-auto small text-secondary">ProcessedInWindow: <strong>{{ outboxSummary.ProcessedInWindow ?? outboxSummary.processedInWindow ?? '—' }}</strong></div>
                  <div class="col-auto small text-secondary">ProcessedPerSecond: <strong>{{ outboxSummary.ProcessedPerSecond ?? outboxSummary.processedPerSecond ?? '—' }}</strong></div>
                  <div class="col-auto small text-secondary">RetryRate: <strong>{{ outboxSummary.RetryRate ?? outboxSummary.retryRate ?? '—' }}</strong></div>
                </div>
              </div>

              <div class="list-group">
                <div class="list-group-item list-group-item-action rounded-4 shadow-sm mb-2 border" v-for="o in outboxItems" :key="o.id">
                  <div class="d-flex flex-column flex-lg-row justify-content-between gap-3">
                    <div class="flex-grow-1">
                      <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                        <span class="badge bg-light text-dark border">{{ o.eventType }}</span>
                        <span class="small text-secondary">{{ formatDate(o.createdAt) || '—' }}</span>
                        <span class="small text-secondary">Status: {{ o.status }}</span>
                        <span class="small text-secondary">Attempts: {{ o.attemptCount ?? 0 }}</span>
                      </div>
                      <div class="fw-semibold small text-truncate">Correlation: {{ o.correlationId || '—' }} · Latency: {{ o.latencyMs ?? '—' }}ms</div>
                      <div v-if="o.lastError" class="small text-danger mt-1">{{ o.lastError }}</div>
                    </div>

                    <div class="d-flex flex-column align-items-end gap-2">
                      <details class="flex-shrink-0 mt-2">
                        <summary class="small text-secondary">Raw</summary>
                        <pre class="mb-0 mt-2 small font-monospace">{{ JSON.stringify(o, null, 2) }}</pre>
                      </details>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="hasMore(outboxMeta)" class="card-footer bg-transparent text-center border-top-0 pt-0">
                <button class="btn btn-outline-secondary rounded-pill px-4" :disabled="isLoading" @click="loadMoreTab('outbox')">
                  <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
                  Загрузить ещё ({{ outboxItems.length }} / {{ outboxMeta.total }})
                </button>
              </div>
            </div>
          </section>

          <section v-if="canAccessAdmin && activeTab === 'logs'" class="card border-0 shadow-sm rounded-4">
            <div class="card-body">
              <h3 class="h5 mb-3 fw-semibold">Логи</h3>
              <div class="list-group">
                <div v-for="log in logs" :key="log.id ?? getLogTitle(log)" class="list-group-item list-group-item-action rounded-4 shadow-sm mb-2 border">
                  <div class="d-flex flex-column flex-lg-row justify-content-between gap-3">
                    <div class="flex-grow-1">
                      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <span class="badge rounded-pill" :class="getLogLevelClass(log)">{{ getLogLevel(log) }}</span>
                        <span class="small text-secondary">{{ formatDate(getLogTimestamp(log)) || '—' }}</span>
                        <span v-if="getLogMeta(log)" class="small text-secondary">{{ getLogMeta(log) }}</span>
                      </div>
                      <div class="fw-semibold">{{ getLogTitle(log) }}</div>
                      <div class="small text-secondary">Автор: {{ getLogActor(log) }}</div>
                    </div>

                    <details class="flex-shrink-0">
                      <summary class="small text-secondary">Raw</summary>
                      <pre class="mb-0 mt-2 small font-monospace">{{ JSON.stringify(log, null, 2) }}</pre>
                    </details>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="hasMore(logsMeta)" class="card-footer bg-transparent text-center border-top-0 pt-0">
              <button class="btn btn-outline-secondary rounded-pill px-4" :disabled="isLoading" @click="loadMoreTab('logs')">
                <span v-if="isLoading" class="spinner-border spinner-border-sm me-2" role="status"></span>
                Загрузить ещё ({{ logs.length }} / {{ logsMeta.total }})
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

import { getApiBaseUrl } from '../config/apiBase'
import { extractApiErrorFromResponse, handleApiError } from '../services/errorService'

const inFlightByDedupeKey = new Map()
const controllerByCancelKey = new Map()

function normalizeMethod(value) {
  return String(value || 'GET').trim().toUpperCase() || 'GET'
}

function resolveUrl(path) {
  const base = getApiBaseUrl().replace(/\/$/, '')
  const raw = String(path || '').trim()

  if (!raw) return base
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('/')) return `${base}${raw}`
  return `${base}/${raw}`
}

function buildHeaders(customHeaders = {}, { skipAuth = false, body = null } = {}) {
  const headers = new Headers(customHeaders || {})

  if (!skipAuth && !headers.has('Authorization')) {
    const token = localStorage.getItem('token') || ''
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  const isBlob = typeof Blob !== 'undefined' && body instanceof Blob
  const isBodyString = typeof body === 'string'
  const isUrlSearchParams = typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams

  if (body != null && !isFormData && !isBlob && !isBodyString && !isUrlSearchParams && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return headers
}

function serializeBody(body, headers) {
  if (body == null) return null

  const contentType = String(headers.get('Content-Type') || '').toLowerCase()
  if (contentType.includes('application/json')) {
    return JSON.stringify(body)
  }

  return body
}

async function parseResponseBody(response, mode = 'json') {
  if (mode === 'raw') return response
  if (response.status === 204) return null

  const text = await response.text().catch(() => '')
  if (!text) return null

  if (mode === 'text') return text

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function unlinkCancelController(cancelKey, controller) {
  if (!cancelKey) return
  if (controllerByCancelKey.get(cancelKey) === controller) {
    controllerByCancelKey.delete(cancelKey)
  }
}

export async function apiRequest(path, options = {}) {
  const {
    method = 'GET',
    headers: customHeaders = {},
    body = null,
    parseAs = 'json',
    signal = null,
    dedupeKey = '',
    cancelKey = '',
    skipAuth = false,
    okStatuses = [],
    skipErrorHandler = false,
    errorHandlerOptions = {},
  } = options

  const dedupeCacheKey = String(dedupeKey || '').trim()
  if (dedupeCacheKey && inFlightByDedupeKey.has(dedupeCacheKey)) {
    return inFlightByDedupeKey.get(dedupeCacheKey)
  }

  const normalizedMethod = normalizeMethod(method)
  const url = resolveUrl(path)

  let cancelController = null
  let finalSignal = signal || null

  const normalizedCancelKey = String(cancelKey || '').trim()
  if (normalizedCancelKey) {
    const prevController = controllerByCancelKey.get(normalizedCancelKey)
    prevController?.abort()

    cancelController = new AbortController()
    controllerByCancelKey.set(normalizedCancelKey, cancelController)
    finalSignal = cancelController.signal
  }

  const headers = buildHeaders(customHeaders, { skipAuth, body })
  const requestBody = serializeBody(body, headers)

  const requestPromise = (async () => {
    const response = await fetch(url, {
      method: normalizedMethod,
      headers,
      body: requestBody,
      signal: finalSignal,
    })

    const normalizedOkStatuses = Array.isArray(okStatuses)
      ? okStatuses.map(status => Number(status)).filter(Number.isFinite)
      : []

    if (!response.ok && !normalizedOkStatuses.includes(response.status)) {
      const apiError = await extractApiErrorFromResponse(response)
      if (!skipErrorHandler) {
        await handleApiError(apiError, errorHandlerOptions)
      }
      throw apiError
    }

    return parseResponseBody(response, parseAs)
  })()

  const finalPromise = requestPromise.finally(() => {
    if (dedupeCacheKey) {
      inFlightByDedupeKey.delete(dedupeCacheKey)
    }

    unlinkCancelController(normalizedCancelKey, cancelController)
  })

  if (dedupeCacheKey) {
    inFlightByDedupeKey.set(dedupeCacheKey, finalPromise)
  }

  return finalPromise
}

export function cancelApiRequest(cancelKey) {
  const key = String(cancelKey || '').trim()
  if (!key) return

  const controller = controllerByCancelKey.get(key)
  if (!controller) return

  controller.abort()
  controllerByCancelKey.delete(key)
}

export const apiClient = {
  request: apiRequest,
  get: (path, options = {}) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PATCH', body }),
  put: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PUT', body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: 'DELETE' }),
}

import { pushNotification } from './notificationService'
import { normalizePatchIssues } from '../utils/patchResult'
import { isContractError, mapContractErrorToUi } from '../utils/apiContract'

export const API_ERROR_CODE = Object.freeze({
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  RATE_LIMITED: 'rate_limited',
  VALIDATION_ERROR: 'validation_error',
  UNKNOWN: 'unknown',
})

const runtimeContext = {
  router: null,
  getUserStore: null,
}

const PUBLIC_ERROR_MESSAGES = Object.freeze({
  [API_ERROR_CODE.UNAUTHORIZED]: 'Требуется авторизация.',
  [API_ERROR_CODE.FORBIDDEN]: 'Недостаточно прав для выполнения действия.',
  [API_ERROR_CODE.NOT_FOUND]: 'Ресурс недоступен или не найден.',
  [API_ERROR_CODE.RATE_LIMITED]: 'Слишком много запросов. Повторите позже.',
  [API_ERROR_CODE.VALIDATION_ERROR]: 'Некорректные данные запроса.',
  [API_ERROR_CODE.UNKNOWN]: 'Произошла ошибка. Попробуйте позже.',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function toSearchableText(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalizeCodeByStatus(status) {
  if (status === 400 || status === 422) return API_ERROR_CODE.VALIDATION_ERROR
  if (status === 401) return API_ERROR_CODE.UNAUTHORIZED
  if (status === 403) return API_ERROR_CODE.FORBIDDEN
  if (status === 404) return API_ERROR_CODE.NOT_FOUND
  if (status === 429) return API_ERROR_CODE.RATE_LIMITED
  return API_ERROR_CODE.UNKNOWN
}

function normalizeErrorCode(rawCode, status) {
  const code = normalizeText(rawCode).toLowerCase().replace(/[^a-z0-9_]/g, '')

  if (!code) return normalizeCodeByStatus(status)
  if (code === 'unauthorized' || code === 'unauthenticated' || code === 'authrequired') return API_ERROR_CODE.UNAUTHORIZED
  if (code === 'forbidden' || code === 'accessdenied') return API_ERROR_CODE.FORBIDDEN
  if (code === 'notfound' || code === 'resource_not_found') return API_ERROR_CODE.NOT_FOUND
  if (code === 'ratelimited' || code === 'toomanyrequests') return API_ERROR_CODE.RATE_LIMITED
  if (code === 'validationerror' || code === 'validationfailed' || code === 'badrequest') return API_ERROR_CODE.VALIDATION_ERROR

  return normalizeCodeByStatus(status)
}

function isLoginBanText(value) {
  const text = normalizeText(toSearchableText(value)).toLowerCase()
  return text.includes('account_banned') ||
    text.includes('accountbanned') ||
    text.includes('loginban') ||
    text.includes('isbanned') ||
    text.includes('banned') ||
    text.includes('заблок')
}

function parseRetryAfterSeconds(headers, payload = {}) {
  const direct = Number(payload.retryAfterSeconds ?? payload.retryAfter)
  if (Number.isFinite(direct) && direct > 0) return direct

  const retryAfterHeader = headers?.get?.('Retry-After')
  if (!retryAfterHeader) return null

  const asNumber = Number(retryAfterHeader)
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber

  const asDate = Date.parse(retryAfterHeader)
  if (Number.isNaN(asDate)) return null

  const seconds = Math.ceil((asDate - Date.now()) / 1000)
  return seconds > 0 ? seconds : null
}

function buildApiError({ code, status, message = '', details = null, issues = [], retryAfterSeconds = null, isLoginBan = false } = {}) {
  const normalizedCode = normalizeErrorCode(code, status)
  const normalizedMessage = normalizeText(message) || PUBLIC_ERROR_MESSAGES[normalizedCode] || PUBLIC_ERROR_MESSAGES[API_ERROR_CODE.UNKNOWN]

  return {
    code: normalizedCode,
    status: Number(status) || 0,
    message: normalizedMessage,
    details: details ?? null,
    issues: normalizePatchIssues(issues, normalizedCode === API_ERROR_CODE.VALIDATION_ERROR ? 'invalid_value' : 'error'),
    retryAfterSeconds: Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(Number(retryAfterSeconds))
      : null,
    isLoginBan: Boolean(isLoginBan),
  }
}

export function configureErrorService({ router, getUserStore } = {}) {
  runtimeContext.router = router || null
  runtimeContext.getUserStore = typeof getUserStore === 'function' ? getUserStore : null
}

export async function extractApiErrorFromResponse(response, fallbackCode = API_ERROR_CODE.UNKNOWN) {
  const status = Number(response?.status) || 0
  const text = await response?.clone?.().text().catch(() => '')

  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = { details: text }
    }
  }

  const code = payload?.code || payload?.errorCode || payload?.error || fallbackCode
  const message = payload?.message || ''
  const details = payload?.details ?? null
  const issues = payload?.issues ?? payload?.fields ?? []
  const retryAfterSeconds = parseRetryAfterSeconds(response?.headers, payload || {})
  const isLoginBan = isLoginBanText(code) || isLoginBanText(message) || isLoginBanText(details)

  return buildApiError({
    code,
    status,
    message,
    details,
    issues,
    retryAfterSeconds,
    isLoginBan,
  })
}

export function toApiError(error, fallbackCode = API_ERROR_CODE.UNKNOWN) {
  if (!error) {
    return buildApiError({ code: fallbackCode, status: 0 })
  }

  if (isContractError(error)) {
    return {
      code: error.code || fallbackCode,
      status: 0,
      message: mapContractErrorToUi(error),
      details: error.details ?? null,
      issues: [],
      retryAfterSeconds: null,
      isLoginBan: false,
    }
  }

  if (typeof error === 'object' && typeof error.code === 'string' && typeof error.message === 'string' && 'status' in error) {
    return buildApiError({
      code: error.code,
      status: error.status,
      message: error.message,
      details: error.details,
      issues: error.issues,
      retryAfterSeconds: error.retryAfterSeconds,
      isLoginBan: error.isLoginBan,
    })
  }

  if (typeof error === 'object') {
    return buildApiError({
      code: error.code || fallbackCode,
      status: error.status,
      message: error.message,
      details: error.details || error.message,
      issues: error.issues,
      isLoginBan: isLoginBanText(error.code) || isLoginBanText(error.message) || isLoginBanText(error.details),
      retryAfterSeconds: error.retryAfterSeconds,
    })
  }

  return buildApiError({
    code: fallbackCode,
    details: String(error),
    status: 0,
    isLoginBan: isLoginBanText(error),
  })
}

export function toPublicErrorMessage(error, fallbackMessage = PUBLIC_ERROR_MESSAGES[API_ERROR_CODE.UNKNOWN]) {
  const normalized = toApiError(error)
  return normalizeText(normalized.message) || fallbackMessage
}

export function isLoginBanError(error) {
  return toApiError(error).isLoginBan
}

function getNotificationType(code) {
  if (code === API_ERROR_CODE.RATE_LIMITED) return 'warning'
  if (code === API_ERROR_CODE.NOT_FOUND) return 'info'
  if (code === API_ERROR_CODE.VALIDATION_ERROR) return 'warning'
  if (code === API_ERROR_CODE.FORBIDDEN) return 'warning'
  return 'error'
}

export async function handleApiError(error, options = {}) {
  const normalized = toApiError(error)
  const {
    notify = true,
    redirect = true,
    logoutOnUnauthorized = false,
    updateRateLimitState = true,
  } = options

  const userStore = typeof runtimeContext.getUserStore === 'function' ? runtimeContext.getUserStore() : null
  const router = runtimeContext.router

  if (normalized.code === API_ERROR_CODE.RATE_LIMITED && updateRateLimitState) {
    userStore?.setRateLimitState?.({
      message: normalized.message,
      retryAfterSeconds: normalized.retryAfterSeconds,
      status: normalized.status,
    })
  }

  if (normalized.code === API_ERROR_CODE.UNAUTHORIZED && normalized.isLoginBan) {
    userStore?.setAuthState?.('blocked')
    userStore?.clearAuth?.()

    if (redirect && router) {
      try {
        await router.push('/blocked?reason=login-ban')
      } catch {
        // Ignore navigation race errors.
      }
    }

    return normalized
  }

  if (normalized.code === API_ERROR_CODE.UNAUTHORIZED && logoutOnUnauthorized) {
    userStore?.setAuthState?.('unauthenticated')
    userStore?.clearAuth?.()

    if (redirect && router) {
      try {
        await router.push('/login')
      } catch {
        // Ignore navigation race errors.
      }
    }

    return normalized
  }

  if (notify && normalized.code !== API_ERROR_CODE.UNAUTHORIZED) {
    pushNotification({
      type: getNotificationType(normalized.code),
      message: normalized.message,
      code: normalized.code,
      details: normalized.details,
      durationMs: normalized.code === API_ERROR_CODE.RATE_LIMITED ? 5000 : 3500,
    })
  }

  return normalized
}

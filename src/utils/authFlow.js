import { getApiBaseUrl } from '../config/apiBase'
import { useUserStore } from '../stores/userStore'
import { extractApiErrorFromResponse, handleApiError, isLoginBanError } from '../services/errorService'
import { validateApiRequestBody } from '../api/requestContract'
import { validateAuthDto } from './apiContract'

function isApiRequest(url, apiUrl) {
  return url.origin === apiUrl.origin && url.pathname.startsWith(apiUrl.pathname)
}

function getApiPath(url, apiUrl) {
  const basePath = apiUrl.pathname === '/' ? '' : apiUrl.pathname.replace(/\/$/, '')
  if (basePath && url.pathname.startsWith(basePath)) {
    return url.pathname.slice(basePath.length) || '/'
  }
  return url.pathname
}

function isPublicAuthPath(path) {
  return path === '/auth/login' || path === '/auth/register' || path === '/auth/refresh'
}

function isRefreshPath(path) {
  return path === '/auth/refresh'
}

function prepareRequest(request, token, shouldAttachAuth) {
  const headers = new Headers(request.headers)
  if (shouldAttachAuth && token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return new Request(request, { headers })
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeErrorPayload(payload = {}) {
  const code = normalizeText(payload?.code || payload?.errorCode || payload?.error)
  const message = String(payload?.message || '').trim()
  const details = String(payload?.details || '').trim()

  return {
    code,
    message,
    details,
  }
}

function isAccountBannedPayload(payload = {}) {
  const normalized = normalizeErrorPayload(payload)
  const combined = `${normalized.code} ${normalizeText(normalized.message)} ${normalizeText(normalized.details)}`

  return combined.includes('account_banned') ||
    combined.includes('accountbanned') ||
    combined.includes('loginban') ||
    combined.includes('isbanned') ||
    combined.includes('banned') ||
    combined.includes('заблок')
}

function parseRetryAfterSeconds(response) {
  const retryAfter = response.headers.get('Retry-After')
  if (!retryAfter) return null

  const asNumber = Number(retryAfter)
  if (Number.isFinite(asNumber) && asNumber >= 0) return asNumber

  const asDate = Date.parse(retryAfter)
  if (Number.isNaN(asDate)) return null

  const seconds = Math.ceil((asDate - Date.now()) / 1000)
  return seconds > 0 ? seconds : null
}

export function installAuthFlow({ router, pinia } = {}) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function') return
  if (window.__AUTH_FLOW_INSTALLED__) return

  const apiBase = getApiBaseUrl().replace(/\/$/, '')
  const apiUrl = new URL(apiBase, window.location.origin)
  const originalFetch = window.fetch.bind(window)
  let refreshPromise = null

  function getUserStore() {
    try {
      return useUserStore(pinia)
    } catch {
      return null
    }
  }

  function clearAuthState() {
    const userStore = getUserStore()
    if (userStore?.clearAuth) {
      userStore.setAuthState?.('unauthenticated')
      userStore.clearAuth()
      return
    }

    localStorage.removeItem('user')
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
  }

  function setRateLimitState(response, payload = {}) {
    const userStore = getUserStore()
    if (!userStore?.setRateLimitState) return

    const retryAfterSeconds = parseRetryAfterSeconds(response)
    userStore.setRateLimitState({
      message: payload.message || payload.details || 'Слишком много запросов. Повторите позже.',
      retryAfterSeconds,
      status: response.status,
    })
  }

  function clearRateLimitState() {
    const userStore = getUserStore()
    userStore?.clearRateLimitState?.()
  }

  function applyRefreshedTokens(tokens) {
    localStorage.setItem('token', tokens.accessToken)
    localStorage.setItem('refreshToken', tokens.refreshToken)

    const userStore = getUserStore()
    if (!userStore) return

    userStore.token = tokens.accessToken
    userStore.refreshToken = tokens.refreshToken
  }

  async function redirectToLogin() {
    const currentPath = router?.currentRoute?.value?.path
    if (currentPath === '/login') return

    try {
      await router.push('/login')
    } catch {
      // ignore router navigation errors
    }
  }

  async function redirectToBlocked(reason = 'login-ban') {
    const currentPath = router?.currentRoute?.value?.path
    if (currentPath === '/blocked') return

    const target = `/blocked?reason=${encodeURIComponent(reason)}`

    try {
      await router.push(target)
    } catch {
      // ignore router navigation errors
    }
  }

  async function forceLogoutToBlocked(reason = 'login-ban') {
    const userStore = getUserStore()
    userStore?.setAuthState?.('blocked')
    clearAuthState()
    await redirectToBlocked(reason)
  }

  async function refreshTokens() {
    if (refreshPromise) return refreshPromise

    refreshPromise = (async () => {
      const userStore = getUserStore()
      userStore?.setAuthState?.('refreshing')

      try {
        const currentRefreshToken = localStorage.getItem('refreshToken') || ''
        if (!currentRefreshToken) {
          userStore?.setAuthState?.('unauthenticated')
          throw new Error('No refresh token')
        }

        const requestBody = validateApiRequestBody('post', '/auth/refresh', { refreshToken: currentRefreshToken })

        const response = await originalFetch(`${apiBase}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        })

        if (!response.ok) {
          const apiError = await extractApiErrorFromResponse(response, 'Refresh request failed')
          await handleApiError(apiError, { notify: false, redirect: false, updateRateLimitState: false })
          const error = new Error(apiError.message || 'Refresh request failed')
          error.code = apiError.code
          error.payload = apiError
          throw error
        }

        const json = await response.json().catch(() => ({}))
        const tokens = validateAuthDto(json, { strict: false })

        if (!tokens || !tokens.accessToken || !tokens.refreshToken) {
          userStore?.setAuthState?.('unauthenticated')
          throw new Error('Refresh response does not contain tokens')
        }

        applyRefreshedTokens(tokens)
        userStore?.setAuthState?.('authenticated')

        return tokens
      } catch (error) {
        userStore?.setAuthState?.('unauthenticated')
        throw error
      }
    })()

    try {
      return await refreshPromise
    } finally {
      refreshPromise = null
    }
  }

  window.fetch = async (input, init) => {
    const baseRequest = new Request(input, init)
    const requestUrl = new URL(baseRequest.url, window.location.origin)
    const apiRequest = isApiRequest(requestUrl, apiUrl)
    const apiPath = getApiPath(requestUrl, apiUrl)
    const isPublicAuth = isPublicAuthPath(apiPath)
    const isProtectedApiRequest = apiRequest && !isPublicAuth
    const token = localStorage.getItem('token') || ''

    const retryBaseRequest = baseRequest.clone()
    const preparedRequest = prepareRequest(baseRequest, token, apiRequest && !isPublicAuth)

    let response = await originalFetch(preparedRequest)

    if (apiRequest && response.status < 400 && response.status !== 429) {
      clearRateLimitState()
    }

    if (apiRequest && response.status === 429) {
      const apiError = await extractApiErrorFromResponse(response)
      await handleApiError(apiError, { notify: false })
      setRateLimitState(response, apiError)
      return response
    }

    if (response.status === 401 && isProtectedApiRequest) {
      const apiError = await extractApiErrorFromResponse(response)
      if (isLoginBanError(apiError) || isAccountBannedPayload(apiError)) {
        await forceLogoutToBlocked('login-ban')
        return response
      }
    }

    const shouldRetryWithRefresh =
      response.status === 401 &&
      apiRequest &&
      !isPublicAuth &&
      !isRefreshPath(apiPath) &&
      Boolean(token)

    if (!shouldRetryWithRefresh) {
      return response
    }

    try {
      await refreshTokens()
      const refreshedToken = localStorage.getItem('token') || ''
      const retryRequest = prepareRequest(retryBaseRequest, refreshedToken, apiRequest)
      response = await originalFetch(retryRequest)

      if (apiRequest && response.status === 429) {
        const apiError = await extractApiErrorFromResponse(response)
        await handleApiError(apiError, { notify: false })
        setRateLimitState(response, apiError)
        return response
      }

      if (response.status === 401 && isProtectedApiRequest) {
        const apiError = await extractApiErrorFromResponse(response)
        if (isLoginBanError(apiError) || isAccountBannedPayload(apiError)) {
          await forceLogoutToBlocked('login-ban')
          return response
        }
      }

      if (response.status !== 401) {
        clearRateLimitState()
        return response
      }
    } catch (error) {
      if (isLoginBanError(error?.payload || error) || isAccountBannedPayload(error?.payload || { code: error?.code, message: error?.message })) {
        await forceLogoutToBlocked('login-ban')
        return response
      }

      // continue with forced clearAuth + redirect flow
    }

    clearAuthState()
    getUserStore()?.setAuthState?.('unauthenticated')
    await redirectToLogin()
    return response
  }

  window.__AUTH_FLOW_INSTALLED__ = true
}

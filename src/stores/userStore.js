import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getApiBaseUrl } from '../config/apiBase'

function parseJwt(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

async function parseErrMsg(response, fallback) {
  const text = await response.text().catch(() => '')
  if (!text) return fallback
  try {
    const json = JSON.parse(text)
    return json?.message || json?.error || text
  } catch {
    return text
  }
}

export const useUserStore = defineStore('user', () => {
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const token = ref(localStorage.getItem('token') || '')
  const apiBase = getApiBaseUrl()
  const usersBase = `${apiBase}/users`

  const jwtPayload = computed(() => parseJwt(token.value))
  const tokenUserId = computed(() => jwtPayload.value?.sub || jwtPayload.value?.id || jwtPayload.value?.userId)

  const isAdmin = computed(() => {
    const userIsAdmin = Boolean(user.value?.isAdmin)
    const userRole = String(user.value?.role || user.value?.userRole || user.value?.roleName || '').toLowerCase()
    const tokenRole = jwtPayload.value?.role || jwtPayload.value?.roles || jwtPayload.value?.roleName || ''
    const tokenRoles = Array.isArray(tokenRole) ? tokenRole : String(tokenRole).split(',').map(r => r.trim().toLowerCase())
    const tokenIsAdmin = Boolean(jwtPayload.value?.isAdmin)
    const hasRoleAdmin = tokenRoles.includes('admin') || tokenRoles.includes('админ') || userRole === 'admin' || userRole === 'админ'

    return userIsAdmin || tokenIsAdmin || hasRoleAdmin
  })

  function saveAuth(data) {
    const { token: t, ...rest } = data || {}
    token.value = t
    user.value = rest || null
    localStorage.setItem('token', t)
    localStorage.setItem('user', JSON.stringify(user.value))
  }

  async function auth(endpoint, userLogin, userPassword) {
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userLogin, userPassword }),
    }
    let res
    try {
      res = await fetch(`${apiBase}/auth/${endpoint}`, opts)
    } catch (_) {
      throw new Error('Сервер недоступен.')
    }
    if (!res.ok) throw new Error(await parseErrMsg(res, 'Ошибка запроса'))

    const data = (await res.json()).data
    saveAuth(data)

    // Ensure we have the latest user info (включая IsAdmin) from API
    try {
      const profile = await fetchProfile(tokenUserId.value)
      user.value = { ...user.value, ...profile }
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch {
      // ignore – права проверяются на сервере, главное, что мы залогинены
    }
  }

  const login = (l, p) => auth('login', l, p)
  const register = (l, p) => auth('register', l, p)
  const logout = () => { user.value = null; token.value = ''; localStorage.removeItem('user'); localStorage.removeItem('token') }

  function getAuthHeader() {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {}
  }

  async function fetchProfile(id) {
    const hdrs = getAuthHeader()
    const res = await fetch(`${usersBase}/${id}`, { headers: hdrs })
    if (!res.ok) throw new Error('Failed to load profile')
    return res.json()
  }

  async function refreshUser() {
    if (!token.value || !tokenUserId.value) return
    try {
      const profile = await fetchProfile(tokenUserId.value)
      user.value = { ...user.value, ...profile }
      localStorage.setItem('user', JSON.stringify(user.value))
    } catch {
      // ignore - user can still use the app without admin flag until next successful fetch
    }
  }

  // uploadAvatar sends FormData with field 'avatar'
  async function uploadAvatar(id, file) {
    if (!file) throw new Error('No file provided')
    const form = new FormData()
    form.append('avatar', file)

    const resp = await fetch(`${usersBase}/${id}/upload-avatar`, {
      method: 'POST',
      headers: {
        ...getAuthHeader()
        // DO NOT set Content-Type here
      },
      body: form
    })

    const json = await resp.json()
    if (!resp.ok) throw new Error(json?.message || json || `Upload failed (${resp.status})`)
    return json
  }

  // updateProfile PATCH JSON; returns normalized object
  async function updateProfile(id, data) {
    const res = await fetch(`${usersBase}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.message || json || 'Failed to update profile')

    // merge local user so that store stays в sync with what we sent (only non-sensitive fields)
    user.value = { ...user.value, ...data }
    localStorage.setItem('user', JSON.stringify(user.value))

    // normalize return: raw server response, arrays if present, and user object fallback
    return {
      raw: json,
      updated: json?.updated ?? null,
      skipped: json?.skipped ?? null,
      user: json?.user ?? json
    }
  }

  async function getFavorites(userId) {
    const res = await fetch(`${usersBase}/${userId}/favorites`, { headers: getAuthHeader() })
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return res.json()
  }

  async function checkIsFavorite(adId) {
    const res = await fetch(`${apiBase}/ads/${adId}/is-favorite`, { headers: getAuthHeader() })
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    const data = await res.json()
    return data.isFavorite
  }

  async function addFavorite(userId, adId) {
    const body = Number.isInteger(adId) ? String(adId) : JSON.stringify(adId)
    const res = await fetch(`${usersBase}/${userId}/favorites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body,
    })
    if (!res.ok) { throw new Error(await parseErrMsg(res, `Request failed (${res.status})`)) }
    return res.json()
  }

  async function removeFavorite(userId, adId) {
    const res = await fetch(`${usersBase}/${userId}/favorites/${adId}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    })
    if (!res.ok) {
      throw new Error(await parseErrMsg(res, `Request failed (${res.status})`))
    }

    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  return {
    user,
    token,
    tokenUserId,
    isAdmin,
    login,
    register,
    logout,
    fetchProfile,
    refreshUser,
    uploadAvatar,
    updateProfile,
    saveAuth,
    getFavorites,
    checkIsFavorite,
    addFavorite,
    removeFavorite,
  }
})
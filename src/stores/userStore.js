import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUserStore = defineStore('user', () => {
  const user = ref(JSON.parse(localStorage.getItem('user') || 'null'))
  const token = ref(localStorage.getItem('token') || '')
  const apiBase = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5122').replace(/\/$/, '')
  const usersBase = `${apiBase}/users`

  function saveAuth({ token: t, userId, userLogin, userName, avatar }) {
    token.value = t
    user.value = { userId, userLogin, userName, avatar }
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
    if (!res.ok) throw new Error((await res.text()) || 'Ошибка запроса')
    saveAuth((await res.json()).data)
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

  return {
    user,
    token,
    login,
    register,
    logout,
    fetchProfile,
    uploadAvatar,
    updateProfile,
    saveAuth
  }
})
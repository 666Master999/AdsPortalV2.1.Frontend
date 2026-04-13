import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { toPublicErrorMessage } from '../services/errorService'
import { apiClient } from '../api/apiClient'
import { validateApiRequestBody } from '../api/requestContract'
import { fetchDeduped } from '../utils/fetchDeduped'
import { validateAuthDto, validateBlockListDto, validateUserDto } from '../utils/apiContract'

const RESTRICTIONS_CACHE_MS = 15000
const PROFILE_CACHE_MS = 60000
const BLOCKS_CACHE_MS = 15000

function safeParseJson(value, fallback) {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

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

function normalizeLookupValue(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeUserId(value) {
  if (value === null || value === undefined) return null

  const raw = String(value).trim()
  if (!raw) return null

  if (/^-?\d+$/.test(raw)) {
    return Number(raw)
  }

  return raw
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function splitWhitespace(value) {
  return String(value || '')
    .split(/\s+/)
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function normalizeStringList(values) {
  const seen = new Set()
  const result = []

  for (const value of toArray(values).flatMap(item => (Array.isArray(item) ? item : [item]))) {
    const normalized = normalizeLookupValue(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function collectStringCandidates(candidates, options = {}) {
  const { splitByWhitespace = false } = options
  const values = []

  for (const candidate of toArray(candidates)) {
    if (candidate === null || candidate === undefined) continue

    if (Array.isArray(candidate)) {
      values.push(...candidate)
      continue
    }

    if (typeof candidate === 'string') {
      values.push(...splitCsv(candidate))
      if (splitByWhitespace) {
        values.push(...splitWhitespace(candidate))
      }
      continue
    }

    values.push(candidate)
  }

  return values
}

function normalizeRoleList(values) {
  return normalizeStringList(values)
}

function normalizePermissionList(values) {
  return normalizeStringList(values)
}

function normalizeRestrictionKey(value) {
  return normalizeLookupValue(value).replace(/[^a-z0-9а-яё]/g, '')
}

function normalizeRestrictionType(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const key = normalizeRestrictionKey(raw)
  if (!key) return raw

  if (key === 'postban' || (key.includes('post') && key.includes('ban'))) return 'PostBan'
  if (key === 'chatban' || key === 'commentban' || (key.includes('chat') && key.includes('ban')) || (key.includes('comment') && key.includes('ban'))) return 'ChatBan'
  if (key === 'loginban' || key === 'accountbanned' || (key.includes('login') && key.includes('ban'))) return 'LoginBan'

  return raw
}

function normalizeRestrictionTargets(entry) {
  const targetUserId = entry?.targetUserId ?? entry?.userId ?? null
  const targetAdId = entry?.targetAdId ?? entry?.adId ?? null
  const targetUserIds = normalizeStringList(
    entry?.targetUserIds ??
    entry?.userIds ??
    []
  )

  const normalizedSingleUserId = targetUserId == null ? null : String(targetUserId)
  if (normalizedSingleUserId && !targetUserIds.includes(normalizedSingleUserId)) {
    targetUserIds.push(normalizedSingleUserId)
  }

  return {
    targetUserId: normalizedSingleUserId,
    targetAdId: targetAdId == null ? null : String(targetAdId),
    targetUserIds,
  }
}

function normalizeRestrictionEntry(entry) {
  if (typeof entry === 'string') {
    const type = normalizeRestrictionType(entry)
    if (!type) return null

    return {
      type,
      key: normalizeRestrictionKey(type),
      reason: '',
      expiresAt: null,
      targetUserId: null,
      targetAdId: null,
      targetUserIds: [],
      raw: entry,
    }
  }

  if (!entry || typeof entry !== 'object') return null

  const type = normalizeRestrictionType(
    entry.type ??
    entry.restrictionType ??
    entry.name ??
    null
  )

  if (!type) return null

  const reason = String(
    entry.reason ??
    entry.message ??
    ''
  ).trim()

  const expiresAt =
    entry.expiresAt ??
    entry.until ??
    entry.endAt ??
    null

  const targets = normalizeRestrictionTargets(entry)

  return {
    type,
    key: normalizeRestrictionKey(type),
    reason,
    expiresAt: expiresAt ? String(expiresAt) : null,
    targetUserId: targets.targetUserId,
    targetAdId: targets.targetAdId,
    targetUserIds: targets.targetUserIds,
    raw: entry,
  }
}

function normalizeRestrictionList(values) {
  return toArray(values)
    .flatMap(item => (Array.isArray(item) ? item : [item]))
    .map(normalizeRestrictionEntry)
    .filter(Boolean)
}

function isRestrictionActive(restriction) {
  if (!restriction) return false
  if (!restriction.expiresAt) return true

  const expiresAt = Date.parse(restriction.expiresAt)
  if (Number.isNaN(expiresAt)) return true

  return expiresAt > Date.now()
}

function extractPage(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data)) return data.data
  return []
}

function extractRestrictionsPayload(raw) {
  const source = raw?.data ?? raw ?? {}

  const restrictions =
    extractPage(source?.restrictions) ||
    extractPage(source?.restrictionTypes) ||
    extractPage(source)

  const roles = normalizeRoleList(
    collectStringCandidates([
      source?.roles,
      source?.role,
      source?.user?.roles,
      source?.user?.role,
    ])
  )

  const permissions = normalizePermissionList(
    collectStringCandidates(
      [
        source?.permissions,
        source?.scope,
        source?.scp,
        source?.user?.permissions,
      ],
      { splitByWhitespace: true }
    )
  )

  return {
    restrictions,
    roles,
    permissions,
  }
}

function extractRolesFromSource(source, jwtPayload) {
  return normalizeRoleList(
    collectStringCandidates([
      source?.userProfile?.roles,
      source?.userProfile?.role,
      source?.user?.roles,
      source?.user?.role,
      source?.profile?.roles,
      source?.profile?.role,
      source?.roles,
      source?.role,
      jwtPayload?.roles,
      jwtPayload?.role,
    ])
  )
}

function extractPermissionsFromSource(source, jwtPayload) {
  return normalizePermissionList(
    collectStringCandidates(
      [
        source?.userProfile?.permissions,
        source?.user?.permissions,
        source?.profile?.permissions,
        source?.permissions,
        jwtPayload?.permissions,
        jwtPayload?.scope,
        jwtPayload?.scp,
      ],
      { splitByWhitespace: true }
    )
  )
}

export const useUserStore = defineStore('user', () => {
  const user = ref(safeParseJson(localStorage.getItem('user'), null))
  const token = ref(localStorage.getItem('token') || '')
  const refreshToken = ref(localStorage.getItem('refreshToken') || '')
  const authState = ref(token.value ? 'authenticated' : 'unauthenticated')
  const roles = ref(normalizeRoleList(safeParseJson(localStorage.getItem('roles'), [])))
  const permissions = ref(normalizePermissionList(safeParseJson(localStorage.getItem('permissions'), [])))
  const restrictions = ref(normalizeRestrictionList(safeParseJson(localStorage.getItem('restrictions'), [])))
  const restrictionsLoaded = ref(Boolean(restrictions.value.length))
  const rateLimitState = ref(null)

  let restrictionsPromise = null
  let restrictionsFetchedAt = 0
  let profilePromise = null
  let profileFetchedAt = 0

  const jwtPayload = computed(() => parseJwt(token.value))
  const tokenUserId = computed(() => normalizeUserId(jwtPayload.value?.sub))

  const roleSet = computed(() => new Set(roles.value.map(normalizeLookupValue)))
  const permissionSet = computed(() => new Set(permissions.value.map(normalizeLookupValue)))
  const activeRestrictions = computed(() => restrictions.value.filter(isRestrictionActive))
  const restrictionKeySet = computed(() => new Set(activeRestrictions.value.map(item => item.key)))

  function hasRole(roleName) {
    const key = normalizeLookupValue(roleName)
    return key ? roleSet.value.has(key) : false
  }

  function hasAnyRole(roleNames = []) {
    return toArray(roleNames).some(roleName => hasRole(roleName))
  }

  function hasPermission(permissionName) {
    const key = normalizeLookupValue(permissionName)
    return key ? permissionSet.value.has(key) : false
  }

  function hasAnyPermission(permissionNames = []) {
    return toArray(permissionNames).some(permissionName => hasPermission(permissionName))
  }

  function hasRestriction(restrictionType) {
    const key = normalizeRestrictionKey(restrictionType)
    return key ? restrictionKeySet.value.has(key) : false
  }

  function getRestriction(restrictionType) {
    const key = normalizeRestrictionKey(restrictionType)
    if (!key) return null
    return activeRestrictions.value.find(item => item.key === key) || null
  }

  const canAccessAdmin = computed(() => {
    return hasAnyRole(['Admin', 'SuperAdmin'])
  })

  const canModerateAds = computed(() => {
    return hasAnyRole(['Moderator', 'Admin', 'SuperAdmin'])
  })

  const isPostBanned = computed(() => hasRestriction('PostBan'))
  const isChatBanned = computed(() => hasRestriction('ChatBan'))
  const isLoginBanned = computed(() => hasRestriction('LoginBan'))
  const canCreateAds = computed(() => !isPostBanned.value)
  const canSendMessages = computed(() => !isChatBanned.value)
  const blockedUsers = ref([])
  const blockedUserIds = ref([])
  const blockedByUserIds = ref([])
  let blockedUsersFetchedAt = 0

  function getBlockOwnerId() {
    return String(user.value?.id ?? tokenUserId.value ?? '').trim()
  }

  function getBlockRequestKey() {
    const ownerId = getBlockOwnerId()
    return ownerId ? `users:blocks:${ownerId}` : 'users:blocks'
  }

  function applyBlockedUsers(items = []) {
    const list = Array.isArray(items)
      ? items.filter(item => item && typeof item === 'object')
      : []

    blockedUsers.value = list
    blockedUserIds.value = list
      .map(item => normalizeUserId(item?.targetUserId))
      .filter(id => id !== null && id !== undefined && String(id).trim() !== '')
    blockedUsersFetchedAt = Date.now()

    return blockedUsers.value
  }

  async function syncChatBlockState(options = {}) {
    const { force = false } = options
    const ownerId = getBlockOwnerId()

    if (!ownerId) {
      blockedUsers.value = []
      blockedUserIds.value = []
      blockedByUserIds.value = []
      blockedUsersFetchedAt = 0
      return blockedUsers.value
    }

    const now = Date.now()
    const isCacheValid = blockedUsersFetchedAt > 0 && now - blockedUsersFetchedAt < BLOCKS_CACHE_MS
    if (!force && isCacheValid) {
      return blockedUsers.value
    }

    const items = await fetchDeduped(getBlockRequestKey(), async () => {
      const json = await apiClient.get('/users/blocks', {
        errorHandlerOptions: { notify: false, redirect: false },
      })

      return validateBlockListDto(json, { strict: true })
    })

    return applyBlockedUsers(items)
  }

  function isUserBlocked(targetUserId) {
    const id = normalizeUserId(targetUserId)
    return id !== null && id !== undefined && blockedUserIds.value.includes(id)
  }

  function isBlockedByUser(targetUserId) {
    const id = normalizeUserId(targetUserId)
    return id !== null && id !== undefined && blockedByUserIds.value.includes(id)
  }

  function setBlockedUserId(targetUserId, blocked = true) {
    const id = normalizeUserId(targetUserId)
    if (id === null || id === undefined || String(id).trim() === '') return

    const next = new Set(blockedUserIds.value)
    if (blocked) next.add(id)
    else next.delete(id)

    blockedUserIds.value = Array.from(next)
    blockedUsersFetchedAt = 0
  }

  function setBlockedByUserId(targetUserId, blocked = true) {
    const id = normalizeUserId(targetUserId)
    if (id === null || id === undefined || String(id).trim() === '') return

    const next = new Set(blockedByUserIds.value)
    if (blocked) next.add(id)
    else next.delete(id)

    blockedByUserIds.value = Array.from(next)
  }

  function setAuthState(nextState) {
    const allowed = new Set(['unauthenticated', 'authenticating', 'authenticated', 'refreshing', 'blocked'])
    const normalized = String(nextState || '').trim().toLowerCase()
    authState.value = allowed.has(normalized) ? normalized : authState.value
  }

  function persistAccess() {
    localStorage.setItem('roles', JSON.stringify(roles.value))
    localStorage.setItem('permissions', JSON.stringify(permissions.value))
    localStorage.setItem('restrictions', JSON.stringify(restrictions.value))
  }

  function syncCurrentUserIdentity(sourceUser = user.value) {
    const currentUserId = tokenUserId.value
    if (currentUserId === null) return sourceUser && typeof sourceUser === 'object' ? sourceUser : null

    const currentUser = sourceUser && typeof sourceUser === 'object' ? sourceUser : null
    if (currentUser && currentUser.userId === currentUserId && currentUser.id === currentUserId) {
      return currentUser
    }

    return {
      ...(currentUser || {}),
      userId: currentUserId,
      id: currentUserId,
    }
  }

  function updateAccessFromSource(source, options = {}) {
    const { merge = false } = options
    const payload = parseJwt(token.value || localStorage.getItem('token') || '')
    const nextRoles = extractRolesFromSource(source, payload)
    const nextPermissions = extractPermissionsFromSource(source, payload)

    roles.value = merge ? normalizeRoleList([...roles.value, ...nextRoles]) : nextRoles
    permissions.value = merge ? normalizePermissionList([...permissions.value, ...nextPermissions]) : nextPermissions
    persistAccess()
  }

  function setRestrictions(nextRestrictions, options = {}) {
    const { markLoaded = true } = options
    restrictions.value = normalizeRestrictionList(nextRestrictions)
    restrictionsLoaded.value = markLoaded
    persistAccess()
  }

  async function fetchProfileDeduped(id, options = {}) {
    const { force = false } = options
    if (id == null) return null

    const now = Date.now()
    const cacheValid = !force && profileFetchedAt && now - profileFetchedAt < PROFILE_CACHE_MS
    if (cacheValid && user.value && (user.value.id == null || String(user.value.id) === String(id))) {
      return user.value
    }

    if (profilePromise) return profilePromise

    profilePromise = (async () => {
      try {
        const json = await apiClient.get(`/users/${id}`, {
          errorHandlerOptions: { notify: false, redirect: false },
        })
        const profileUser = validateUserDto(json, { strict: true })
        if (profileUser && typeof profileUser === 'object') {
          user.value = syncCurrentUserIdentity(profileUser)
          localStorage.setItem('user', JSON.stringify(user.value || null))
          // Profile is authoritative: override roles/permissions from profile
          updateAccessFromSource({ ...(json || {}), ...(user.value || {}) }, { merge: false })
        }
        profileFetchedAt = Date.now()
        return profileUser
      } finally {
        profilePromise = null
      }
    })()

    return profilePromise
  }

  function saveAuth(data) {
    const source = validateAuthDto(data, { strict: true })
    const t = source.accessToken || ''
    const rt = source.refreshToken || ''
    const {
      token: _token,
      accessToken: _accessToken,
      refreshToken: _refreshToken,
      user: sourceUser,
      profile: sourceProfile,
      ...rest
    } = source

    const fallbackUser = rest && typeof rest === 'object' ? rest : null
    const nextUser = (sourceUser && typeof sourceUser === 'object')
      ? sourceUser
      : (sourceProfile && typeof sourceProfile === 'object')
        ? sourceProfile
        : fallbackUser

    token.value = t
    refreshToken.value = rt
    user.value = syncCurrentUserIdentity(nextUser && Object.keys(nextUser).length ? nextUser : null)

    if (t) {
      localStorage.setItem('token', t)
    } else {
      localStorage.removeItem('token')
    }

    if (rt) {
      localStorage.setItem('refreshToken', rt)
    } else {
      localStorage.removeItem('refreshToken')
    }

    localStorage.setItem('user', JSON.stringify(user.value || null))
    updateAccessFromSource({ ...source, ...(user.value || {}) })
    blockedUsers.value = []
    blockedUserIds.value = []
    blockedByUserIds.value = []
    blockedUsersFetchedAt = 0
    setAuthState('authenticated')
  }

  function clearAuth() {
    user.value = null
    token.value = ''
    refreshToken.value = ''
    roles.value = []
    permissions.value = []
    restrictions.value = []
    restrictionsLoaded.value = false
    restrictionsFetchedAt = 0
    restrictionsPromise = null
    rateLimitState.value = null
    blockedUsers.value = []
    blockedUserIds.value = []
    blockedByUserIds.value = []
    blockedUsersFetchedAt = 0
    setAuthState('unauthenticated')

    localStorage.removeItem('user')
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('roles')
    localStorage.removeItem('permissions')
    localStorage.removeItem('restrictions')
  }

  async function hydrateAccessContext(options = {}) {
    const { force = false } = options
    user.value = syncCurrentUserIdentity(user.value)
    localStorage.setItem('user', JSON.stringify(user.value || null))
    updateAccessFromSource(user.value || {})

    if (!token.value) {
      setAuthState('unauthenticated')
      blockedUsers.value = []
      blockedUserIds.value = []
      blockedByUserIds.value = []
      blockedUsersFetchedAt = 0
      return user.value
    }

    setAuthState('authenticated')

    try {
      await syncChatBlockState()
    } catch {
      // Ignore block list refresh errors during auth hydration.
    }

    // If we have a token, prefer authoritative profile data from the API
    // Use a deduped/cached fetch to avoid duplicate requests on the same page.
    try {
      const currentId = tokenUserId.value
      if (currentId != null) {
        try {
          await fetchProfileDeduped(currentId)
        } catch {
          // Ignore profile fetch errors; fallback to JWT-derived access
        }
      }
    } catch {
      // Defensive: ignore any unexpected errors here
    }

    if (force || !restrictionsLoaded.value) {
      try {
        await ensureRestrictions({ force })
      } catch {
        // Restrictions endpoint can be temporarily unavailable.
      }
    }

    if (hasRestriction('LoginBan')) {
      setAuthState('blocked')
    } else {
      setAuthState('authenticated')
    }

    return user.value
  }

  async function ensureRestrictions(options = {}) {
    const { force = false } = options
    const currentToken = token.value || localStorage.getItem('token') || ''
    if (!currentToken) return restrictions.value

    const now = Date.now()
    const isCacheValid = restrictionsLoaded.value && now - restrictionsFetchedAt < RESTRICTIONS_CACHE_MS
    if (!force && isCacheValid) return restrictions.value

    if (restrictionsPromise) return restrictionsPromise

    restrictionsPromise = (async () => {
      const response = await apiClient.request('/me/restrictions', {
        method: 'GET',
        parseAs: 'raw',
        okStatuses: [404],
        headers: { Authorization: `Bearer ${currentToken}` },
        errorHandlerOptions: { notify: false, redirect: false },
      })

      if (response.status === 404) {
        setRestrictions([], { markLoaded: true })
        restrictionsFetchedAt = Date.now()
        return restrictions.value
      }

      const text = await response.text().catch(() => '')
      let json = []
      if (text) {
        try {
          json = JSON.parse(text)
        } catch {
          json = []
        }
      }
      const payload = extractRestrictionsPayload(json)

      setRestrictions(payload.restrictions, { markLoaded: true })

      if (hasRestriction('LoginBan')) {
        setAuthState('blocked')
      } else if (currentToken) {
        setAuthState('authenticated')
      }

      if (payload.roles.length || payload.permissions.length) {
        roles.value = normalizeRoleList([...roles.value, ...payload.roles])
        permissions.value = normalizePermissionList([...permissions.value, ...payload.permissions])
        persistAccess()
      }

      restrictionsFetchedAt = Date.now()
      return restrictions.value
    })()

    try {
      return await restrictionsPromise
    } finally {
      restrictionsPromise = null
    }
  }

  function setRateLimitState(nextState) {
    if (!nextState) {
      rateLimitState.value = null
      return
    }

    rateLimitState.value = {
      ...nextState,
      at: new Date().toISOString(),
    }
  }

  function clearRateLimitState() {
    rateLimitState.value = null
  }

  async function auth(endpoint, userLogin, userPassword) {
    setAuthState('authenticating')

    let data
    try {
      const requestBody = validateApiRequestBody('post', `/auth/${endpoint}`, { userLogin, userPassword })
      data = await apiClient.post(`/auth/${endpoint}`, requestBody, {
        skipAuth: true,
        errorHandlerOptions: { notify: false, redirect: false },
      })
    } catch (error) {
      setAuthState('unauthenticated')
      if (error?.name === 'TypeError') {
        throw new Error('Сервер недоступен.')
      }
      throw new Error(toPublicErrorMessage(error, 'Ошибка запроса'))
    }

    const payload = data?.data ?? data ?? {}
    saveAuth(payload)

    try {
      await hydrateAccessContext()
    } catch {
      // Ignore profile refresh errors, user is already logged in.
    }

    if (!hasRestriction('LoginBan')) {
      setAuthState('authenticated')
    }
  }

  const login = (l, p) => auth('login', l, p)
  const register = (l, p) => auth('register', l, p)

  async function logout() {
    let requestError = null

    try {
      await apiClient.post('/auth/logout', null, {
        errorHandlerOptions: { notify: false, redirect: false },
      })
    } catch (e) {
      requestError = new Error(toPublicErrorMessage(e, 'Ошибка выхода'))
    } finally {
      clearAuth()
    }

    if (requestError) throw requestError
  }

  async function logoutAll() {
    let requestError = null

    try {
      await apiClient.post('/auth/logout-all', null, {
        errorHandlerOptions: { notify: false, redirect: false },
      })
    } catch (e) {
      requestError = new Error(toPublicErrorMessage(e, 'Ошибка выхода со всех устройств'))
    } finally {
      clearAuth()
    }

    if (requestError) throw requestError
  }

  async function getSessions() {
    const json = await apiClient.get('/auth/sessions', {
      errorHandlerOptions: { notify: false, redirect: false },
    })
    const list = extractPage(json)

    return list.map(session => ({
      id: session?.id ?? null,
      deviceName: session?.deviceName ?? null,
      ipAddress: session?.ipAddress ?? null,
      lastActivityAt: session?.lastActivityAt ?? null,
      createdAt: session?.createdAt ?? null,
      isCurrent: Boolean(session?.isCurrent),
    }))
  }

  async function revokeSession(id) {
    const data = await apiClient.delete(`/auth/sessions/${id}`, {
      errorHandlerOptions: { notify: false, redirect: false },
    })

    return data ?? null
  }

  async function fetchPublicProfile(id) {
    const json = await apiClient.get(`/users/${id}`, {
      errorHandlerOptions: { notify: false, redirect: false },
    })

    const validatedProfile = validateUserDto(json, { strict: true })

    if (json && typeof json === 'object' && Object.prototype.hasOwnProperty.call(json, 'userProfile')) {
      return {
        ...json,
        userProfile: validatedProfile,
      }
    }

    return validatedProfile
  }

  async function fetchProfile(id) {
    const data = await apiClient.get(`/users/${id}`, {
      errorHandlerOptions: { notify: false, redirect: false },
    })

    return validateUserDto(data, { strict: true })
  }

  function normalizeProfilePatch(data = {}) {
    const payload = {}
    const fieldMap = {
      userLogin: 'userLogin',
      userName: 'userName',
      userEmail: 'userEmail',
      userPhoneNumber: 'userPhoneNumber',
      avatarPath: 'avatarPath',
    }

    for (const [sourceKey, targetKey] of Object.entries(fieldMap)) {
      if (Object.prototype.hasOwnProperty.call(data, sourceKey)) {
        payload[targetKey] = data[sourceKey]
      }
    }

    if (Object.prototype.hasOwnProperty.call(data, 'password')) {
      payload.password = data.password
    }

    return payload
  }

  async function uploadAvatar(id, file) {
    if (!file) throw new Error('No file provided')
    validateApiRequestBody('post', `/users/${id}/upload-avatar`, { avatar: file })

    const form = new FormData()
    form.append('avatar', file)

    const json = await apiClient.post(`/users/${id}/upload-avatar`, form, {
      errorHandlerOptions: { notify: false },
    })
    return json
  }

  async function updateProfile(id, data) {
    const payload = normalizeProfilePatch(data)

    const json = await apiClient.patch(`/users/${id}`, payload, {
      errorHandlerOptions: { notify: false },
    })

    user.value = { ...user.value, ...data }
    localStorage.setItem('user', JSON.stringify(user.value))
    updateAccessFromSource(user.value)

    return {
      raw: json,
      success: json?.success ?? null,
      updated: json?.updated ?? null,
      skipped: json?.skipped ?? null,
      errors: json?.errors ?? null,
      user: json?.user ?? json,
    }
  }

  async function getFavorites(userId) {
    return apiClient.get(`/users/${userId}/favorites`, {
      errorHandlerOptions: { notify: false },
    })
  }

  async function addFavorite(userId, adId) {
    const numericAdId = Number(adId)
    const body = Number.isFinite(numericAdId) ? numericAdId : adId
    validateApiRequestBody('post', `/users/${userId}/favorites`, body)

    return apiClient.post(`/users/${userId}/favorites`, body, {
      headers: { 'Content-Type': 'application/json' },
      errorHandlerOptions: { notify: false },
    })
  }

  async function removeFavorite(userId, adId) {
    return apiClient.delete(`/users/${userId}/favorites/${adId}`, {
      errorHandlerOptions: { notify: false },
    })
  }

  async function blockUser(targetUserId) {
    const targetId = String(normalizeUserId(targetUserId) ?? '').trim()
    if (!targetId) return null

    await apiClient.post(`/users/${targetId}/blocks`, null, {
      errorHandlerOptions: { notify: false, redirect: false },
    })

    setBlockedUserId(targetId, true)
    await syncChatBlockState({ force: true }).catch(() => null)
    return null
  }

  async function unblockUser(targetUserId) {
    const targetId = String(normalizeUserId(targetUserId) ?? '').trim()
    if (!targetId) return null

    await apiClient.delete(`/users/${targetId}/blocks`, {
      errorHandlerOptions: { notify: false, redirect: false },
    })

    setBlockedUserId(targetId, false)
    await syncChatBlockState({ force: true }).catch(() => null)
    return null
  }

  return {
    user,
    token,
    refreshToken,
    authState,
    roles,
    permissions,
    restrictions,
    rateLimitState,
    blockedUsers,
    tokenUserId,
    canAccessAdmin,
    canModerateAds,
    isPostBanned,
    isChatBanned,
    isLoginBanned,
    canCreateAds,
    canSendMessages,
    isUserBlocked,
    isBlockedByUser,
    blockUser,
    unblockUser,
    setBlockedUserId,
    setBlockedByUserId,
    syncChatBlockState,
    login,
    register,
    logout,
    logoutAll,
    clearAuth,
    setAuthState,
    saveAuth,
    hydrateAccessContext,
    ensureRestrictions,
    hasRole,
    hasAnyRole,
    hasPermission,
    hasAnyPermission,
    hasRestriction,
    getRestriction,
    setRateLimitState,
    clearRateLimitState,
    getSessions,
    revokeSession,
    fetchPublicProfile,
    fetchProfile,
    uploadAvatar,
    updateProfile,
    getFavorites,
    addFavorite,
    removeFavorite,
    isChatBanned,
  }
})

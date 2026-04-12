import { createAccessService, mapRestrictionToBlockedReason } from '../services/accessService'

export function createRouteAccessGuard({ getUserStore } = {}) {
  return async function routeAccessGuard(to) {
    const userStore = typeof getUserStore === 'function' ? getUserStore() : null
    if (!userStore) return true

    const access = createAccessService(userStore)
    const token = userStore.token || localStorage.getItem('token') || ''
    const requiresAuth = Boolean(to.meta?.requiresAuth)
    const isAuthPage = to.path === '/login' || to.path === '/register'

    if (requiresAuth && !token) {
      return { path: '/login' }
    }

    if (!token) return true

    try {
      await userStore.hydrateAccessContext()
    } catch {
      // Hydration is best-effort in route guard.
    }

    if (access.isAccountBlocked()) {
      userStore.setAuthState?.('blocked')
      userStore.clearAuth()
      return { path: '/blocked', query: { reason: 'login-ban' } }
    }

    const requiredRestrictions = Array.isArray(to.meta?.requiresNoRestrictions)
      ? to.meta.requiresNoRestrictions
      : []

    for (const restrictionType of requiredRestrictions) {
      if (access.hasRestriction(restrictionType)) {
        return {
          path: '/blocked',
          query: { reason: mapRestrictionToBlockedReason(restrictionType) },
        }
      }
    }

    const requiredRoles = Array.isArray(to.meta?.requireAnyRole) ? to.meta.requireAnyRole : []
    const requiredPermissions = Array.isArray(to.meta?.requireAnyPermission) ? to.meta.requireAnyPermission : []

    if (requiredRoles.length || requiredPermissions.length) {
      const roleOk = requiredRoles.length ? access.hasAnyRole(requiredRoles) : false
      const permissionOk = requiredPermissions.length ? access.hasAnyPermission(requiredPermissions) : false
      if (!roleOk && !permissionOk) {
        return { path: '/' }
      }
    }

    if (isAuthPage && token) {
      return { path: '/' }
    }

    return true
  }
}

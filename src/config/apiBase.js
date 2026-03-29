export function getApiBaseUrl() {
  const envBase = import.meta.env.VITE_API_BASE_URL

  if (envBase) {
    return envBase.replace(/\/$/, '')
  }

  return import.meta.env.PROD
    ? 'http://adportal.runasp.net'
    : 'http://localhost:5122'
}
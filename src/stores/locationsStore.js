import { defineStore } from 'pinia'
import { ref, reactive } from 'vue'
import { getApiBaseUrl } from '../config/apiBase'
import { fetchDeduped } from '../utils/fetchDeduped'

const VALID_LOCATION_TYPES = new Set(['region', 'city', 'district'])
const TYPE_LABELS = {
  region: 'область',
  city: 'город',
  district: 'район',
}

function extractResults(data) {
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.items)) return data.items
  if (Array.isArray(data?.data)) return data.data
  return []
}

function normalizeSearchItem(item) {
  const type = String(item?.type ?? item?.locationType ?? item?.kind ?? item?.entityType ?? '').trim().toLowerCase()
  const id = Number(item?.id ?? item?.locationId ?? item?.entityId)
  if (!VALID_LOCATION_TYPES.has(type) || !Number.isInteger(id) || id <= 0) return null

  const name = String(item?.name ?? item?.title ?? '').trim()
  const subtitle = String(item?.subtitle ?? item?.regionName ?? item?.cityName ?? '').trim()
  const label = String(item?.label ?? `${name} (${TYPE_LABELS[type] || type})`).trim()

  return {
    ...item,
    type,
    id,
    name,
    subtitle,
    label,
  }
}

export const useLocationsStore = defineStore('locations', () => {
  const regions = ref([])
  const citiesByRegion = reactive({})
  const districtsByCity = reactive({})
  const loadingCities = reactive({})
  const loadingDistricts = reactive({})

  const apiBase = getApiBaseUrl()

  async function loadRegions() {
    if (regions.value.length) return regions.value
    return fetchDeduped('regions', async () => {
      const response = await fetch(`${apiBase}/regions`)
      regions.value = await response.json()
      return regions.value
    })
  }

  async function loadCitiesByRegion(regionId) {
    if (citiesByRegion[regionId] !== undefined) return citiesByRegion[regionId]
    loadingCities[regionId] = true
    try {
      return await fetchDeduped(`cities:${regionId}`, async () => {
        const response = await fetch(`${apiBase}/cities?regionId=${regionId}`)
        citiesByRegion[regionId] = await response.json()
        return citiesByRegion[regionId]
      })
    } finally {
      loadingCities[regionId] = false
    }
  }

  async function loadDistrictsByCity(cityId) {
    if (districtsByCity[cityId] !== undefined) return districtsByCity[cityId]
    loadingDistricts[cityId] = true
    try {
      return await fetchDeduped(`districts:${cityId}`, async () => {
        const response = await fetch(`${apiBase}/districts?cityId=${cityId}`)
        districtsByCity[cityId] = await response.json()
        return districtsByCity[cityId]
      })
    } finally {
      loadingDistricts[cityId] = false
    }
  }

  async function searchLocations(query, signal) {
    const trimmedQuery = query?.trim()
    if (!trimmedQuery) return []

    try {
      const response = await fetch(
        `${apiBase}/locations/search?q=${encodeURIComponent(trimmedQuery)}`,
        signal ? { signal } : undefined
      )
      if (!response.ok) return []
      const data = await response.json()
      return extractResults(data).map(normalizeSearchItem).filter(Boolean)
    } catch (err) {
      if (err?.name === 'AbortError') return []
      throw err
    }
  }

  return {
    regions,
    citiesByRegion,
    districtsByCity,
    loadingCities,
    loadingDistricts,
    loadRegions,
    loadCitiesByRegion,
    loadDistrictsByCity,
    searchLocations,
  }
})

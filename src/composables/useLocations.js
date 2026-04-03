import { useLocationsStore } from '../stores/locationsStore'

export const VALID_LOCATION_TYPES = ['region', 'city', 'district']

export const LOCATION_PRESETS = {
  all: { label: 'Вся Беларусь' },
  minsk: { label: 'Минск', type: 'city', name: 'Минск' },
  minskRegion: { label: 'Минская обл.', type: 'region', name: 'Минская область' },
}

function toId(value) {
  const id = Number(value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function isValidLocation(item) {
  return item && VALID_LOCATION_TYPES.includes(item.type) && toId(item.id) != null
}

function normalizeLocation(item) {
  if (!isValidLocation(item)) return null
  return { type: item.type, id: toId(item.id) }
}

// Public: convert any API item to canonical LocationRef { type, id }
export function mapApiToLocationRef(item) {
  return normalizeLocation(item)
}

export function getParentRegionIdFromApi(item) {
  return toId(item?.regionId ?? item?.parentRegionId)
}

export function getParentCityIdFromApi(item) {
  return toId(item?.cityId ?? item?.parentCityId)
}

// Scan store data to find which region contains a given city
function findRegionOfCity(cityId, data) {
  for (const [regionId, cities] of Object.entries(data.citiesByRegion || {})) {
    if ((cities || []).some(c => c.id === cityId)) return toId(regionId)
  }
  return null
}

// Scan store data to find which region contains a given district (via its city)
function findRegionOfDistrict(districtId, data) {
  for (const [cityId, districts] of Object.entries(data.districtsByCity || {})) {
    if ((districts || []).some(d => d.id === districtId)) {
      return findRegionOfCity(toId(cityId), data)
    }
  }
  return null
}

function locationKey(item) {
  return `${item.type}:${item.id}`
}

function sameLocation(a, b) {
  return a?.type === b?.type && Number(a?.id) === Number(b?.id)
}

function uniqueLocations(locations = []) {
  const seen = new Set()
  const output = []
  for (const item of locations) {
    const normalized = normalizeLocation(item)
    if (!normalized) continue
    const key = locationKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }
  return output
}

export function parseLocations(str) {
  if (!str || typeof str !== 'string') return []
  return uniqueLocations(
    str.split(',').map((chunk) => {
      const colonIndex = chunk.indexOf(':')
      if (colonIndex === -1) return null
      return {
        type: chunk.slice(0, colonIndex),
        id: chunk.slice(colonIndex + 1),
      }
    })
  )
}

export function buildLocationsParam(locations) {
  return uniqueLocations(locations).map(locationKey).join(',')
}

export function getLocationData(store) {
  return {
    regions: store.regions,
    citiesByRegion: store.citiesByRegion,
    districtsByCity: store.districtsByCity,
    loadingCities: store.loadingCities,
    loadingDistricts: store.loadingDistricts,
  }
}

export function getRegionCities(regionId, data) {
  return data?.citiesByRegion?.[regionId] || []
}

export function getCityDistricts(cityId, data) {
  return data?.districtsByCity?.[cityId] || []
}

export function hasCityDistricts(cityId, data) {
  const districts = data?.districtsByCity?.[cityId]
  return districts === undefined || districts.length > 0
}

export function isRegionSelected(locations, regionId) {
  return locations.some(location => location.type === 'region' && location.id === regionId)
}

export function isCitySelected(locations, cityId) {
  return locations.some(location => location.type === 'city' && location.id === cityId)
}

export function isDistrictSelected(locations, districtId) {
  return locations.some(location => location.type === 'district' && location.id === districtId)
}

export function isLocationSelected(locations, item) {
  const normalized = normalizeLocation(item)
  return normalized ? locations.some(location => sameLocation(location, normalized)) : false
}

export function isBlockedByRegion(locations, regionId) {
  return isRegionSelected(locations, regionId)
}

export function normalizeLocations(locations, data = {}) {
  const unique = uniqueLocations(locations)
  const selectedRegionIds = new Set(unique.filter(location => location.type === 'region').map(location => location.id))
  if (!selectedRegionIds.size) return unique

  const coveredCityIds = new Set()
  const coveredDistrictIds = new Set()

  for (const regionId of selectedRegionIds) {
    for (const city of getRegionCities(regionId, data)) {
      coveredCityIds.add(city.id)
      for (const district of getCityDistricts(city.id, data)) {
        coveredDistrictIds.add(district.id)
      }
    }
  }

  return unique.filter(location => {
    if (location.type === 'city') return !coveredCityIds.has(location.id)
    if (location.type === 'district') return !coveredDistrictIds.has(location.id)
    return true
  })
}

export function addLocation(locations, item, data = {}) {
  const ref = normalizeLocation(item)
  if (!ref) return uniqueLocations(locations)
  let next = [...locations]
  // If the parent region is already selected, city/district wins: remove the region
  const regionId = ref.type === 'city'
    ? findRegionOfCity(ref.id, data)
    : ref.type === 'district'
      ? findRegionOfDistrict(ref.id, data)
      : null
  if (regionId != null && isRegionSelected(next, regionId)) {
    next = next.filter(l => !(l.type === 'region' && l.id === regionId))
  }
  return uniqueLocations([...next, ref])
}

export function removeLocation(locations, item) {
  const normalized = normalizeLocation(item)
  if (!normalized) return uniqueLocations(locations)
  return uniqueLocations(locations.filter(location => !sameLocation(location, normalized)))
}

export function toggleRegionSelection(locations, regionId) {
  const id = toId(regionId)
  if (id == null) return uniqueLocations(locations)
  if (isRegionSelected(locations, id)) {
    return uniqueLocations(locations.filter(l => !(l.type === 'region' && l.id === id)))
  }
  return uniqueLocations([...locations, { type: 'region', id }])
}

export function toggleCitySelection(locations, city, data = {}) {
  const normalized = normalizeLocation(city)
  if (!normalized) return uniqueLocations(locations)
  const regionId = findRegionOfCity(normalized.id, data)
  if (regionId != null && isRegionSelected(locations, regionId)) return uniqueLocations(locations)
  if (isCitySelected(locations, normalized.id)) {
    const districtIds = new Set(getCityDistricts(normalized.id, data).map(d => d.id))
    return uniqueLocations(locations.filter(l => {
      if (l.type === 'city') return l.id !== normalized.id
      if (l.type === 'district') return !districtIds.has(l.id)
      return true
    }))
  }
  return uniqueLocations([...locations, normalized])
}

export function toggleDistrictSelection(locations, district, data = {}) {
  const normalized = normalizeLocation(district)
  if (!normalized) return uniqueLocations(locations)
  const regionId = findRegionOfDistrict(normalized.id, data)
  if (regionId != null && isRegionSelected(locations, regionId)) return uniqueLocations(locations)
  if (isDistrictSelected(locations, normalized.id)) {
    return uniqueLocations(locations.filter(l => !(l.type === 'district' && l.id === normalized.id)))
  }
  return uniqueLocations([...locations, normalized])
}

export function findLocationByName(type, name, data = {}) {
  const target = String(name || '').trim().toLowerCase()
  if (!target) return null

  if (type === 'region') {
    return (data.regions || []).find(item => String(item.name || '').trim().toLowerCase() === target) || null
  }

  if (type === 'city') {
    for (const cities of Object.values(data.citiesByRegion || {})) {
      const match = cities.find(item => String(item.name || '').trim().toLowerCase() === target)
      if (match) return match
    }
    return null
  }

  if (type === 'district') {
    for (const districts of Object.values(data.districtsByCity || {})) {
      const match = districts.find(item => String(item.name || '').trim().toLowerCase() === target)
      if (match) return match
    }
    return null
  }

  return null
}

export function locationLabel(item, data = {}) {
  const normalized = normalizeLocation(item)
  if (!normalized) return ''

  if (normalized.type === 'region') {
    return data.regions?.find(region => region.id === normalized.id)?.name || `Область #${normalized.id}`
  }

  if (normalized.type === 'city') {
    for (const cities of Object.values(data.citiesByRegion || {})) {
      const city = cities.find(candidate => candidate.id === normalized.id)
      if (city) return city.name
    }
    return `Город #${normalized.id}`
  }

  for (const districts of Object.values(data.districtsByCity || {})) {
    const district = districts.find(candidate => candidate.id === normalized.id)
    if (district) return district.name
  }
  return `Район #${normalized.id}`
}

export function ensureLocationContext(items, data, loaders = {}) {
  const regionIds = new Set()
  const cityIds = new Set()

  for (const item of items || []) {
    if (!item) continue
    const type = item.type
    const itemId = toId(item.id)
    if (!type || itemId == null) continue

    if (type === 'region') {
      regionIds.add(itemId)
      continue
    }

    const regionId = getParentRegionIdFromApi(item)
    const cityId = getParentCityIdFromApi(item)

    if (regionId != null) regionIds.add(regionId)
    if (type === 'district' && cityId != null) cityIds.add(cityId)
  }

  const regionTasks = [...regionIds].map(regionId => loaders.loadCitiesByRegion?.(regionId, data))
  const cityTasks = [...cityIds].map(cityId => loaders.loadDistrictsByCity?.(cityId, data))
  return Promise.all([...regionTasks, ...cityTasks])
}

export async function resolvePresetLocations(key, data = {}, searchLocations) {
  if (key === 'all') return []
  const preset = LOCATION_PRESETS[key]
  if (!preset?.type) return []

  const loadedMatch = findLocationByName(preset.type, preset.name, data)
  if (loadedMatch) return [{ type: loadedMatch.type, id: loadedMatch.id }]

  if (typeof searchLocations !== 'function') return []
  const results = await searchLocations(preset.name)
  const exactMatch = results.find(item => item.type === preset.type && String(item.name || '').trim().toLowerCase() === preset.name.trim().toLowerCase())
    || results.find(item => item.type === preset.type)
  if (!exactMatch) return []
  return [{ type: exactMatch.type, id: exactMatch.id }]
}

export function useLocations() {
  const store = useLocationsStore()
  const data = getLocationData(store)

  async function ensureSelectionContext(items) {
    return ensureLocationContext(items, data, {
      loadCitiesByRegion: store.loadCitiesByRegion,
      loadDistrictsByCity: store.loadDistrictsByCity,
    })
  }

  async function applyPreset(key) {
    if (key === 'all') return []
    return resolvePresetLocations(key, data, store.searchLocations)
  }

  function normalizeCurrentLocations(locations) {
    return normalizeLocations(locations, data)
  }

  function labelForLocation(item) {
    return locationLabel(item, data)
  }

  return {
    ...data,
    loadRegions: store.loadRegions,
    loadCitiesByRegion: store.loadCitiesByRegion,
    loadDistrictsByCity: store.loadDistrictsByCity,
    searchLocations: store.searchLocations,
    ensureSelectionContext,
    applyPreset,
    normalizeCurrentLocations,
    labelForLocation,
    parseLocations,
    buildLocationsParam,
    getRegionCities: regionId => getRegionCities(regionId, data),
    getCityDistricts: cityId => getCityDistricts(cityId, data),
    hasCityDistricts: cityId => hasCityDistricts(cityId, data),
    isRegionSelected: (locations, regionId) => isRegionSelected(locations, regionId),
    isCitySelected: (locations, cityId) => isCitySelected(locations, cityId),
    isDistrictSelected: (locations, districtId) => isDistrictSelected(locations, districtId),
    isBlockedByRegion: (locations, regionId) => isBlockedByRegion(locations, regionId),
    normalizeLocations: locations => normalizeLocations(locations, data),
    mapApiToLocationRef,
    addLocation: (locations, item) => addLocation(locations, item, data),
    removeLocation: (locations, item) => removeLocation(locations, item),
    toggleRegionSelection: (locations, regionId) => toggleRegionSelection(locations, regionId),
    toggleCitySelection: (locations, city) => toggleCitySelection(locations, city, data),
    toggleDistrictSelection: (locations, district) => toggleDistrictSelection(locations, district, data),
    isLocationSelected: (locations, item) => isLocationSelected(locations, item),
  }
}

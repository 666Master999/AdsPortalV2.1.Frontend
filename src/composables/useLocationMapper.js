import { LocationType } from '@/types/location'

const VALID_LOCATION_TYPES = new Set(Object.values(LocationType))

function parseLocationSource(location) {
  if (typeof location !== 'string') return location
  try {
    return JSON.parse(location)
  } catch {
    return null
  }
}

function toLocationRef(location) {
  const source = parseLocationSource(location)
  if (!source || typeof source !== 'object') return null
  const type = String(source.type || '').trim()
  const id = Number(source.id)
  if (!VALID_LOCATION_TYPES.has(type) || !Number.isInteger(id) || id <= 0) return null

  return {
    type,
    id,
    name: source.name ?? null,
  }
}

function toLocationList(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

export function mapLocationToApi(location) {
  const normalized = Array.isArray(location) ? mapLocationsToApi(location) : toLocationRef(location)
  if (!normalized) return {}

  switch (normalized.type) {
    case LocationType.CITY:
      return { CityId: normalized.id, DistrictId: null }
    case LocationType.DISTRICT:
      return { DistrictId: normalized.id }
    case LocationType.REGION:
    default:
      return {}
  }
}

export function mapLocationsToApi(locations) {
  const normalized = toLocationList(locations).map(toLocationRef).filter(Boolean)

  const district = normalized.find(item => item.type === LocationType.DISTRICT)
  if (district) return { DistrictId: district.id }

  const city = normalized.find(item => item.type === LocationType.CITY)
  if (city) return { CityId: city.id, DistrictId: null }

  return {}
}

export function mapApiToLocation(source) {
  if (Array.isArray(source)) {
    return source.map(mapApiToLocation).flat().filter(Boolean)
  }

  const direct = toLocationRef(source)
  if (direct) return [direct]

  const ad = source || {}
  const candidates = [ad.district, ad.city, ad.region, ad.District, ad.City, ad.Region]
  const explicit = candidates.map(toLocationRef).find(Boolean)
  return explicit ? [explicit] : []
}

export function mapLocationToFilter(location) {
  return toLocationList(location)
    .map(toLocationRef)
    .filter(Boolean)
    .map(item => ({
      type: 'location',
      value: `${item.type}:${item.id}`,
    }))
}

export function mapFilterToLocation(filters) {
  return toLocationList(filters)
    .filter(filter => filter?.type === 'location' && typeof filter.value === 'string')
    .map((filter) => {
      const colonIndex = filter.value.indexOf(':')
      if (colonIndex === -1) return null
      const type = filter.value.slice(0, colonIndex)
      const id = Number(filter.value.slice(colonIndex + 1))
      if (!VALID_LOCATION_TYPES.has(type) || !Number.isInteger(id) || id <= 0) return null
      return { type, id, name: null }
    })
    .filter(Boolean)
}
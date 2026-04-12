import { normalizeLocationId } from './useLocations'

function pickLocationId(source) {
  return normalizeLocationId(source?.locationId)
}

export function mapLocationIdToApi(locationId) {
  const normalized = normalizeLocationId(locationId)
  return normalized == null ? {} : { locationId: normalized }
}

export function mapApiToLocationId(source) {
  return pickLocationId(source)
}

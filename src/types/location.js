export const LocationType = Object.freeze({
  REGION: 0,
  CITY: 1,
  DISTRICT: 2,
})

export const LOCATION_TYPE_LABELS = Object.freeze({
  [LocationType.REGION]: 'область',
  [LocationType.CITY]: 'город',
  [LocationType.DISTRICT]: 'район',
})

export function normalizeLocationType(value) {
  const type = Number(value)
  return Number.isInteger(type) && type in LOCATION_TYPE_LABELS ? type : null
}

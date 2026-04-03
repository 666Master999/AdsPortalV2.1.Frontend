export const LocationType = Object.freeze({
  CITY: 'city',
  DISTRICT: 'district',
  REGION: 'region',
})

/**
 * @typedef {Object} LocationRef
 * @property {'city'|'district'|'region'} type
 * @property {number} id
 * @property {string|null} name
 */
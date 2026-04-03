const inFlight = new Map()

/**
 * Deduplicates identical in-flight requests.
 * Multiple simultaneous calls with the same key share one Promise (one network request).
 * Once the request settles, the key is removed — subsequent calls make a fresh request.
 *
 * @param {string} key   Unique cache key for this request
 * @param {() => Promise<any>} fn  Factory that actually performs the fetch
 */
export async function fetchDeduped(key, fn) {
  if (inFlight.has(key)) {
    return inFlight.get(key)
  }

  const promise = fn().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, promise)
  return promise
}

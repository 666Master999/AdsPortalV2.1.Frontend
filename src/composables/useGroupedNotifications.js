import { computed, unref } from 'vue'

function readValue(source) {
  return typeof source === 'function'
    ? source()
    : unref(source)
}

export function useGroupedNotifications(source) {
  return computed(() => {
    const notifications = readValue(source) || []
    const map = new Map()

    for (const n of notifications) {
      if (!n || typeof n !== 'object') continue
      const key = n.adId ? `ad:${n.adId}` : `single:${n.id}`

      if (!map.has(key)) map.set(key, [])
      map.get(key).push(n)
    }

    return Array.from(map.entries())
      .map(([key, items]) => {
        const sorted = Array.isArray(items) ? [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : []

        if (String(key).startsWith('ad:') && sorted.length > 1) {
          return {
            type: 'group',
            key: String(key),
            adId: sorted[0].adId,
            items: sorted,
            isRead: sorted.every(i => i.isRead),
          }
        }

        return {
          type: 'single',
          key: String(key),
          item: sorted[0],
        }
      })
      .sort((a, b) => {
        const aDate = a.type === 'single' ? a.item.createdAt : a.items[0].createdAt
        const bDate = b.type === 'single' ? b.item.createdAt : b.items[0].createdAt
        return new Date(bDate) - new Date(aDate)
      })
  })
}

import { defineStore } from 'pinia'
import { reactive, computed } from 'vue'

// typingByConversation: Map<conversationId(string), Map<userId(string), timestamp(number)>>
// typingTimers:         Map<conversationId:userId, timeoutId>

const TYPING_TIMEOUT = 2000

export const useTypingStore = defineStore('typing', () => {
  const typingByConversation = reactive(new Map())
  const typingTimers = new Map()

  function _timerKey(cid, uid) { return `${cid}:${uid}` }

  function _getOrCreate(cid) {
    if (!typingByConversation.has(cid)) typingByConversation.set(cid, new Map())
    return typingByConversation.get(cid)
  }

  function applyTypingEvent(payload, currentUserId) {
    const cid = String(payload?.conversationId ?? '')
    const uid = String(payload?.userId ?? '')
    const userName = String(payload?.userName ?? uid)
    if (!cid || !uid) return
    if (uid === String(currentUserId ?? '')) return

    const map = _getOrCreate(cid)
    map.set(uid, { timestamp: Date.now(), userName })

    const key = _timerKey(cid, uid)
    clearTimeout(typingTimers.get(key))
    typingTimers.set(key, setTimeout(() => {
      clearUser(cid, uid)
    }, TYPING_TIMEOUT))
  }

  function clearUser(cid, uid) {
    const map = typingByConversation.get(cid)
    if (map) map.delete(uid)
    const key = _timerKey(cid, uid)
    clearTimeout(typingTimers.get(key))
    typingTimers.delete(key)
  }

  function clearConversation(cid) {
    const map = typingByConversation.get(cid)
    if (!map) return
    for (const uid of map.keys()) {
      const key = _timerKey(cid, uid)
      clearTimeout(typingTimers.get(key))
      typingTimers.delete(key)
    }
    typingByConversation.delete(cid)
  }

  function getTypingUsers(cid) {
    const map = typingByConversation.get(cid)
    if (!map || !map.size) return []
    return Array.from(map.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .map(([userId, { userName }]) => ({ userId, userName }))
  }

  // Returns a computed-compatible getter for a single conversation
  function typingUsersFor(cid) {
    return computed(() => getTypingUsers(String(cid ?? '')))
  }

  return {
    typingByConversation,
    applyTypingEvent,
    clearUser,
    clearConversation,
    getTypingUsers,
    typingUsersFor,
  }
})

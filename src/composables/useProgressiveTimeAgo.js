import { ref, watch, onUnmounted } from 'vue'
import { timeAgo as formatTimeAgo } from '@/utils/formatDate'
import { messageTime } from '@/utils/formatDate'

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value

  let raw = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    raw += 'Z'
  }
  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

function getNextDelaySeconds(diffSec) {
  if (diffSec < 0) return 1
  // default progressive: 5s -> 60s -> 3600s
  if (diffSec < 60) {
    const rem = diffSec % 5
    return rem === 0 ? 5 : 5 - rem
  }
  if (diffSec < 3600) {
    const rem = diffSec % 60
    return rem === 0 ? 60 : 60 - rem
  }
  const rem = diffSec % 3600
  return rem === 0 ? 3600 : 3600 - rem
}

export function useProgressiveTimeAgo(source, opts = {}) {
  const label = ref('')
  let timer = null

  function clearTimer() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function plural(n, one, few, many) {
    const abs = Math.abs(n)
    const mod10 = abs % 10
    const mod100 = abs % 100
    if (mod100 >= 11 && mod100 <= 19) return many
    if (mod10 === 1) return one
    if (mod10 >= 2 && mod10 <= 4) return few
    return many
  }

  function formatMessengerLabel(date, prefix) {
    if (!date) return ''
    const now = Date.now()
    const diffSec = Math.floor((now - date.getTime()) / 1000)
    const p = prefix || ''
    if (diffSec < 60) return p + 'только что'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return p + `${diffMin} ${plural(diffMin, 'минуту', 'минуты', 'минут')} назад`
    const diffHrs = Math.floor(diffMin / 60)
    if (diffHrs < 24) return p + `${diffHrs} ${plural(diffHrs, 'час', 'часа', 'часов')} назад`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays === 1) {
      const hm = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
      return p + `вчера в ${hm}`
    }
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function computeAndSchedule() {
    clearTimer()
    const raw = (source && typeof source === 'object' && 'value' in source) ? source.value : source

    // Determine effective date according to opts
    let date = null
    const online = opts && typeof opts === 'object' && opts.online && typeof opts.online === 'object' && 'value' in opts.online
      ? opts.online.value
      : opts && opts.online

    const localLastSeen = opts && typeof opts === 'object' && opts.localLastSeen && typeof opts.localLastSeen === 'object' && 'value' in opts.localLastSeen
      ? opts.localLastSeen.value
      : opts && opts.localLastSeen

    if (online) {
      label.value = (opts.prefix || '') + 'онлайн'
      return
    }

    if (localLastSeen) {
      const dd = new Date(localLastSeen)
      if (!isNaN(dd.getTime())) date = dd
    }

    if (!date) {
      date = parseDate(raw)
    }

    if (!date) {
      label.value = String(raw || '')
      return
    }

    const strategy = opts.strategy || 'progressive'
    if (strategy === 'messenger') {
      label.value = formatMessengerLabel(date, opts.prefix)
      const now = Date.now()
      const diffSec = Math.floor((now - date.getTime()) / 1000)
      let nextSec = 0
      if (diffSec < 60) nextSec = 60 - diffSec
      else if (diffSec < 3600) nextSec = 60 - diffSec % 60
      else if (diffSec < 86400) nextSec = 3600 - diffSec % 3600
      else nextSec = 0
      if (nextSec > 0) timer = setTimeout(() => computeAndSchedule(), Math.max(1000, nextSec * 1000))
      return
    }

    // fallback to original progressive behavior
    label.value = formatTimeAgo(raw, opts)
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000)
    const nextSec = getNextDelaySeconds(diffSec)
    timer = setTimeout(() => {
      computeAndSchedule()
    }, Math.max(1000, nextSec * 1000))
  }

  // watch source if it's a ref / reactive
  // Build reactive watch sources: source, opts.online, opts.localLastSeen (if refs)
  const watchSources = []
  if (source && typeof source === 'object' && 'value' in source) watchSources.push(source)
  if (opts && typeof opts === 'object') {
    if (opts.online && typeof opts.online === 'object' && 'value' in opts.online) watchSources.push(() => opts.online.value)
    if (opts.localLastSeen && typeof opts.localLastSeen === 'object' && 'value' in opts.localLastSeen) watchSources.push(() => opts.localLastSeen.value)
  }

  if (watchSources.length) {
    watch(watchSources, () => computeAndSchedule(), { immediate: true })
  } else {
    // static value — compute once
    computeAndSchedule()
  }

  onUnmounted(() => clearTimer())

  return label
}

/**
 * Форматирует дату в человекочитаемый вид.
 *
 * Примеры вывода:
 *   только что
 *   1 минуту назад / 5 минут назад
 *   1 час назад / 7 часов назад
 *   сегодня в 14:32
 *   вчера в 09:15
 *   2 дня назад
 *   неделю назад
 *   2 недели назад
 *   месяц назад
 *   3 месяца назад
 *   13.03.2026  (больше года — просто дата)
 */

function plural(n, one, few, many) {
  const abs = Math.abs(n)
  const mod10 = abs % 10
  const mod100 = abs % 100
  if (mod100 >= 11 && mod100 <= 19) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

function parseDate(value) {
  if (!value) return null
  if (value instanceof Date) return value

  let raw = String(value).trim()

  // если нет Z или timezone → считаем UTC
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(raw) &&
    !/[Zz]|[+-]\d{2}:?\d{2}$/.test(raw)
  ) {
    raw += 'Z'
  }

  const d = new Date(raw)
  return isNaN(d.getTime()) ? null : d
}

/**
 * @param {string|number|Date|null|undefined} value
 * @param {{ prefix?: string }} [opts]
 *   prefix — строка перед результатом, например 'Был(а) в сети '
 * @returns {string}
 */
export function timeAgo(value, opts = {}) {
  if (!value) return ''

  const date = parseDate(value)
  if (!date) return String(value)

  const now = new Date()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHrs = Math.floor(diffMin / 60)
  const diffDays = Math.floor(diffHrs / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  const prefix = opts.prefix ?? ''

  let result

  if (diffSec < 10) {
    result = 'только что'
  } else if (diffSec < 60) {
    result = `${diffSec} ${plural(diffSec, 'секунду', 'секунды', 'секунд')} назад`
  } else if (diffMin < 60) {
    result = `${diffMin} ${plural(diffMin, 'минуту', 'минуты', 'минут')} назад`
  } else if (diffHrs < 24) {
    const hm = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (date >= todayStart) {
      result = `сегодня в ${hm}`
    } else {
      result = `${diffHrs} ${plural(diffHrs, 'час', 'часа', 'часов')} назад`
    }
  } else if (diffDays === 1) {
    const hm = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    result = `вчера в ${hm}`
  } else if (diffDays < 7) {
    result = `${diffDays} ${plural(diffDays, 'день', 'дня', 'дней')} назад`
  } else if (diffWeeks === 1) {
    result = 'неделю назад'
  } else if (diffWeeks < 4) {
    result = `${diffWeeks} ${plural(diffWeeks, 'неделю', 'недели', 'недель')} назад`
  } else if (diffMonths === 1) {
    result = 'месяц назад'
  } else if (diffMonths < 12) {
    result = `${diffMonths} ${plural(diffMonths, 'месяц', 'месяца', 'месяцев')} назад`
  } else {
    result = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return prefix ? prefix + result : result
}

/**
 * Форматирует время сообщения в чате:
 *   сегодня → 14:32
 *   вчера   → вчера
 *   иначе   → 13.03.26
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {string}
 */
export function chatTime(value) {
  if (!value) return ''
  const date = parseDate(value)
  if (!date) return ''

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterdayStart = new Date(todayStart - 86400000)

  if (date >= todayStart) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  if (date >= yesterdayStart) {
    return 'вчера'
  }
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/**
 * Форматирует время сообщения внутри пузырька:
 *   всегда ЧЧ:ММ
 *
 * @param {string|number|Date|null|undefined} value
 * @returns {string}
 */
export function messageTime(value) {
  if (!value) return ''
  const date = parseDate(value)
  if (!date) return ''
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

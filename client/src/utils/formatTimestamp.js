const INDIA_TIME_ZONE = 'Asia/Kolkata'

export function parseTimestamp(value) {
  if (!value) return ''
  const timestamp = typeof value === 'string' && !/(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value}Z`
    : value
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatTimestamp(value) {
  const date = parseTimestamp(value)
  if (!date) return ''
  return date.toLocaleString('en-IN', {
    timeZone: INDIA_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatTime(value) {
  const date = parseTimestamp(value)
  return date ? date.toLocaleTimeString('en-IN', { timeZone: INDIA_TIME_ZONE, hour: 'numeric', minute: '2-digit' }) : ''
}

export function formatIndiaDayKey(value) {
  const date = parseTimestamp(value)
  if (!date) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: INDIA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = type => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function formatIndiaDayLabel(value, now = new Date()) {
  const date = parseTimestamp(value)
  if (!date) return ''
  const todayKey = formatIndiaDayKey(now)
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const key = formatIndiaDayKey(date)
  if (key === todayKey) return 'Today'
  if (key === formatIndiaDayKey(yesterday)) return 'Yesterday'
  const year = new Intl.DateTimeFormat('en', { timeZone: INDIA_TIME_ZONE, year: 'numeric' }).format(date)
  const currentYear = new Intl.DateTimeFormat('en', { timeZone: INDIA_TIME_ZONE, year: 'numeric' }).format(now)
  return date.toLocaleDateString('en-IN', {
    timeZone: INDIA_TIME_ZONE, month: 'long', day: 'numeric', ...(year !== currentYear ? { year: 'numeric' } : {}),
  })
}

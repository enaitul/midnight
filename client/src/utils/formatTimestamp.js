export function formatTimestamp(value) {
  if (!value) return ''
  const timestamp = typeof value === 'string' && !/(?:z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? `${value}Z`
    : value
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

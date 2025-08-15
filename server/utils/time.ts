export function formatToUTC8(dateString?: string): string {
  if (!dateString) return ''

  try {
    const d = new Date(dateString)
    // Use Intl to format in Asia/Shanghai timezone (UTC+8)
    return d.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    console.error('formatToUTC8 error:', e)
    return ''
  }
}

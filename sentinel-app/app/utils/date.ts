export function formatTelemetryDate(dateString: string | null, t: (key: string) => string, fallback = 'N/A'): string {
  if (!dateString) return fallback
  const date = new Date(dateString)
  const pad = (num: number) => String(num).padStart(2, '0')
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  const day = date.getDate()
  
  const monthKeys: ('jan' | 'feb' | 'mar' | 'apr' | 'mei' | 'jun' | 'jul' | 'agu' | 'sep' | 'okt' | 'nov' | 'des')[] = [
    'jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'
  ]
  const month = t(monthKeys[date.getMonth()])
  
  const currentYear = new Date().getFullYear()
  const year = date.getFullYear()
  if (year !== currentYear) {
    return `${hours}.${minutes}.${seconds} - ${day} ${month} ${year}`
  }
  return `${hours}.${minutes}.${seconds} - ${day} ${month}`
}

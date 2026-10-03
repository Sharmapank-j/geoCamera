import type { AppSettings } from '../types'

export const formatDate = (iso: string, settings: AppSettings) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  if (settings.dateFormat === 'YYYY-MM-DD') {
    return d.toISOString().slice(0, 10)
  }

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()

  return settings.dateFormat === 'DD/MM/YYYY' ? `${dd}/${mm}/${yyyy}` : `${mm}/${dd}/${yyyy}`
}

export const formatTime = (iso: string, use24Hour: boolean) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: !use24Hour,
  })
}

export const displayDatePretty = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export const displayDateLong = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString([], {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const formatTimeZone = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const part = new Intl.DateTimeFormat([], { timeZoneName: 'shortOffset' })
    .formatToParts(d)
    .find(item => item.type === 'timeZoneName')?.value
  return part || Intl.DateTimeFormat().resolvedOptions().timeZone
}

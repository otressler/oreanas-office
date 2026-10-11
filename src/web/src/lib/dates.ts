// German dates and times (knowledge/decisions/ui-language.md).

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** A calendar date "2026-10-11" as "So., 11. Oktober 2026", without time zone shifts. */
export function formatDate(isoDate: string): string {
  const [year = 1970, month = 1, day = 1] = isoDate.split('-').map(Number)
  return dateFormat.format(new Date(year, month - 1, day))
}

/** A point in time in local time, e.g. "11.10., 18:30". */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso))
}

/** Today's local date as "YYYY-MM-DD", the value format of <input type="date">. */
export function todayIso(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

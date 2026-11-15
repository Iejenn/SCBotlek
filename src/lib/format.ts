// Datums altijd in Nederlandse tijd tonen, ook als iemand op vakantie is
const TZ = 'Europe/Amsterdam'

export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ,
  }).format(new Date(iso))
}

export function formatLongDay(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
  }).format(new Date(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(new Date(iso))
}

// ISO -> waarde voor <input type="datetime-local"> (lokale tijd van de browser)
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// <input type="datetime-local"> -> ISO (of null als leeg)
export function fromLocalInput(value: string): string | null {
  return value ? new Date(value).toISOString() : null
}

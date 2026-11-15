import { prettyTeam } from './sportlink'
import { TEAM_NAME_BY_SEASON } from './teamNames'

// Een voetbalseizoen loopt van 1 juli t/m 30 juni.
// We rekenen met het startjaar: seizoen 2026 = 2026/27.

export function seasonOf(iso: string | Date): number {
  const d = new Date(iso)
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1
}

export function seasonLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function seasonRange(startYear: number): { from: string; to: string } {
  return {
    from: new Date(startYear, 6, 1).toISOString(),
    to: new Date(startYear + 1, 6, 1).toISOString(),
  }
}

// Meest voorkomende teamnaam per seizoen, bijv. 2025 -> "SC Botlek 6".
// Het team krijgt soms elk seizoen een ander nummer.
export function teamNameBySeason(events: { starts_at: string; team_name: string | null }[]): Map<number, string> {
  const counts = new Map<number, Map<string, number>>()
  for (const e of events) {
    if (!e.team_name) continue
    const y = seasonOf(e.starts_at)
    const m = counts.get(y) ?? new Map<string, number>()
    m.set(e.team_name, (m.get(e.team_name) ?? 0) + 1)
    counts.set(y, m)
  }
  const result = new Map<number, string>()
  for (const [y, name] of Object.entries(TEAM_NAME_BY_SEASON)) result.set(Number(y), name)
  for (const [y, m] of counts) {
    if (result.has(y)) continue // vaste naam uit teamNames.ts gaat voor
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]
    result.set(y, prettyTeam(best))
  }
  return result
}

// Teamnaam voor één wedstrijd: vaste naam van dat seizoen, anders die uit Sportlink
export function teamNameFor(ev: { starts_at: string; team_name: string | null }): string {
  return TEAM_NAME_BY_SEASON[seasonOf(ev.starts_at)] ?? (ev.team_name ? prettyTeam(ev.team_name) : 'SC Botlek')
}

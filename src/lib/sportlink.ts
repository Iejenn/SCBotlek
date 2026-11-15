// Live gegevens rechtstreeks uit de Sportlink Club.Dataservice (dezelfde bron als voetbal.nl).
// De client_id is de openbare sleutel van SC Botlek (staat ook op scbotlek.nl).
// Wordt die ooit vernieuwd: hier aanpassen én in supabase/002_sportlink_sync.sql.
const BASE = 'https://data.sportlink.com'
const CLIENT_ID = 'Uwi8A1u9lK'
export const TEAM_CODE = 119436 // SC Botlek 7

export type Poule = { poulecode: number; teamnaam: string }

export type StandingRow = {
  positie: number
  teamnaam: string
  clublogo?: string
  gespeeldewedstrijden: number
  gewonnen: number
  gelijk: number
  verloren: number
  doelpuntenvoor: number
  doelpuntentegen: number
  doelsaldo: number
  verliespunten: number
  punten: number
  eigenteam: string // "true" / "false" (als tekst, zo levert Sportlink het)
}

async function get<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const qs = new URLSearchParams({ client_id: CLIENT_ID, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
  const res = await fetch(`${BASE}/${path}?${qs}`)
  if (!res.ok) throw new Error(`Sportlink gaf ${res.status}`)
  return res.json() as Promise<T>
}

// Poules van ons team dit seizoen (competitie + beker). Zo hoeven we de
// poulecode niet elk seizoen met de hand aan te passen.
export function fetchTeamPoules(): Promise<Poule[]> {
  return get<Poule[]>('teampoulelijst', { teamcode: TEAM_CODE, lokaleteamcode: -1 })
}

export function fetchStanding(poulecode: number): Promise<StandingRow[]> {
  return get<StandingRow[]>('poulestand', { poulecode })
}

// "Botlek, SC 7 (0214 Mannen Zaterdag reserve)" -> "Competitie" / "Beker"
export function pouleLabel(p: Poule): string {
  return /beker/i.test(p.teamnaam) ? 'Beker' : 'Competitie'
}

// "Botlek, SC 7" -> "SC Botlek 7" (leesbaarder)
export function prettyTeam(name: string): string {
  return name.replace(/^Botlek, SC\b/, 'SC Botlek')
}

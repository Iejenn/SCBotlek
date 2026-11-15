// Types die 1-op-1 de databasetabellen volgen (snake_case zoals de kolommen)

export type Role = 'supporter' | 'speler' | 'aanvoerder' | 'beheerder'

export type Profile = {
  id: string
  username: string
  display_name: string
  role: Role
  blocked: boolean
  player_id: string | null
  created_at: string
}

export type Player = {
  id: string
  name: string
  shirt_number: number | null
  position: 'keeper' | 'verdediger' | 'middenvelder' | 'aanvaller' | null
  active: boolean
}

export type EventKind = 'wedstrijd' | 'training'
export type EventStatus = 'gepland' | 'gespeeld' | 'afgelast'

export type TeamEvent = {
  id: string
  kind: EventKind
  starts_at: string
  meet_at: string | null
  location: string | null
  opponent: string | null
  is_home: boolean | null
  competition: 'competitie' | 'beker' | 'oefen' | null
  score_us: number | null
  score_them: number | null
  status: EventStatus
  notes: string | null
  team_name: string | null // onze teamnaam volgens Sportlink, bijv. "Botlek, SC 6"
  source: 'handmatig' | 'voetbalnl' // 'voetbalnl' = automatisch uit Sportlink
}

// 'wachtlijst' kiest de server zelf als de wedstrijd vol zit
export type AttendanceStatus = 'aanwezig' | 'afwezig' | 'misschien' | 'wachtlijst'

export type Attendance = {
  event_id: string
  player_id: string
  status: AttendanceStatus
  note: string | null
  updated_at?: string // moment van aanmelden; bepaalt de volgorde op de wachtlijst
}

export const ROLE_LABELS: Record<Role, string> = {
  supporter: 'Supporter',
  speler: 'Speler',
  aanvoerder: 'Aanvoerder',
  beheerder: 'Beheerder',
}

// Rolchecks op de client zijn alleen voor de weergave (knoppen tonen/verbergen).
// De echte controle zit in de database-functies.
export const isTeam = (r?: Role) => r === 'speler' || r === 'aanvoerder' || r === 'beheerder'
export const isStaff = (r?: Role) => r === 'aanvoerder' || r === 'beheerder'

export type MatchStat = {
  event_id: string
  player_id: string
  goals: number
  assists: number
  yellow_cards: number
  red_card: boolean
}

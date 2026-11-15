import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export type TeamSettings = {
  maxMatchPlayers: number | null // max spelers per wedstrijd, null = geen limiet
  signupOpenDays: number | null // ✓ pas X dagen voor de wedstrijd, null = altijd
}

const EMPTY: TeamSettings = { maxMatchPlayers: null, signupOpenDays: null }

// Teaminstellingen (één rij in team_settings). Eén keer ophalen per sessie,
// daarna uit het geheugen; na opslaan in Beheer roept die pagina refresh aan.
let cache: Promise<TeamSettings> | null = null

function load(): Promise<TeamSettings> {
  cache = Promise.resolve(
    supabase.from('team_settings').select('max_match_players, signup_open_days').maybeSingle(),
  ).then(({ data }) => ({
    maxMatchPlayers: (data?.max_match_players as number | null | undefined) ?? null,
    signupOpenDays: (data?.signup_open_days as number | null | undefined) ?? null,
  }))
  return cache
}

export function refreshTeamSettings(): Promise<TeamSettings> {
  return load()
}

export function useTeamSettings(): TeamSettings {
  const [settings, setSettings] = useState<TeamSettings>(EMPTY)
  useEffect(() => {
    let alive = true
    ;(cache ?? load()).then((v) => alive && setSettings(v))
    return () => {
      alive = false
    }
  }, [])
  return settings
}

// Vanaf wanneer kun je ✓ geven voor deze activiteit? null = altijd (of geen wedstrijd)
export function signupOpensAt(
  ev: { kind: string; starts_at: string },
  signupOpenDays: number | null,
): Date | null {
  if (ev.kind !== 'wedstrijd' || signupOpenDays === null) return null
  return new Date(new Date(ev.starts_at).getTime() - signupOpenDays * 24 * 3600_000)
}

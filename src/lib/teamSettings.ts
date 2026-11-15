import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Teaminstellingen (één rij in team_settings). Eén keer ophalen per sessie,
// daarna uit het geheugen; na opslaan in Beheer roept die pagina refresh aan.
let cache: Promise<number | null> | null = null

function load(): Promise<number | null> {
  cache = Promise.resolve(
    supabase.from('team_settings').select('max_match_players').maybeSingle(),
  ).then(({ data }) => (data?.max_match_players as number | null | undefined) ?? null)
  return cache
}

export function refreshTeamSettings(): Promise<number | null> {
  return load()
}

// Maximaal aantal spelers per wedstrijd, of null = geen limiet
export function useMaxMatchPlayers(): number | null {
  const [max, setMax] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    ;(cache ?? load()).then((v) => alive && setMax(v))
    return () => {
      alive = false
    }
  }, [])
  return max
}

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Profile } from './types'

// "Nog te koppelen": accounts zonder speler, niet geblokkeerd, en nog supporter.
// (Supporters die gewoon supporter willen blijven, haal je hier weg door ze
// te koppelen of door hun rol bewust te laten staan; zie Beheer → Gebruikers.)
export function isPending(u: Profile): boolean {
  return !u.player_id && !u.blocked && u.role === 'supporter'
}

// Aantal accounts dat wacht op koppeling (voor de stip in het menu)
export function usePendingCount(enabled: boolean): number {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!enabled) return
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .is('player_id', null)
      .eq('blocked', false)
      .eq('role', 'supporter')
      .then(({ count: c }) => setCount(c ?? 0))
  }, [enabled])
  return count
}

// Naam vergelijken zonder hoofdletters/spaties/accenten
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

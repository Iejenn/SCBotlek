import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabaseConfigured = Boolean(url && key)

// Fallback-waarden zodat de app niet crasht als .env.local nog ontbreekt;
// App.tsx toont dan een melding.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')

// Supabase Auth werkt met e-mailadressen. Wij willen alleen een gebruikersnaam,
// dus maken we er intern een nep-adres van. Er wordt nooit mail naartoe gestuurd
// (zet "Confirm email" uit in Supabase, zie README).
const USERNAME_DOMAIN = 'users.scbotlek.app'

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`
}

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

// Nederlandse foutmeldingen voor de "reason"-codes uit de RPC's
const REASONS: Record<string, string> = {
  not_allowed: 'Je hebt hier geen rechten voor.',
  invalid_status: 'Ongeldige keuze.',
  no_player_linked: 'Je account is nog niet aan een speler gekoppeld. Vraag de beheerder.',
  event_not_found: 'Deze activiteit bestaat niet (meer).',
  event_started: 'Deze activiteit is al begonnen; vraag de aanvoerder om het aan te passen.',
  opponent_required: 'Vul een tegenstander in.',
  invalid_input: 'Controleer de ingevulde gegevens.',
  invalid_role: 'Ongeldige rol.',
  cannot_change_self: 'Je kunt je eigen rol of blokkade niet aanpassen.',
  user_not_found: 'Gebruiker niet gevonden.',
  player_not_found: 'Speler niet gevonden.',
  player_already_linked: 'Deze speler is al aan een ander account gekoppeld.',
  too_soon: 'Er is net al bijgewerkt; probeer het over een paar minuten opnieuw.',
  sync_failed: 'Ophalen bij Sportlink mislukt. Kijk in het logboek hieronder.',
  not_a_match: 'Statistieken kun je alleen bij wedstrijden invullen.',
  match_not_started: 'Deze wedstrijd is nog niet begonnen.',
  player_linked: 'Deze speler is gekoppeld aan een account. Ontkoppel eerst bij Gebruikers.',
  player_has_history: 'Deze speler heeft al aanmeldingen of statistieken. Zet hem op niet actief in plaats van verwijderen.',
  too_many_goals: 'Meer doelpunten of assists ingevuld dan de uitslag toelaat.',
}

export function reasonText(reason: unknown): string {
  return (typeof reason === 'string' && REASONS[reason]) || 'Er ging iets mis, probeer het opnieuw.'
}

type RpcResult = { ok: boolean; reason?: string; [k: string]: unknown }

// Kleine helper: roept een RPC aan en geeft altijd {ok, reason} terug
export async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await supabase.rpc(name, args)
  if (error) return { ok: false, reason: 'error' }
  return data as RpcResult
}

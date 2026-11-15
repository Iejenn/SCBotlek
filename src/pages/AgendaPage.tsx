import { Fragment, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/format'
import { seasonLabel, seasonOf, teamNameBySeason } from '../lib/season'
import { useMaxMatchPlayers } from '../lib/teamSettings'
import { isStaff, isTeam, type Attendance, type TeamEvent } from '../lib/types'
import AttendanceButtons from '../components/AttendanceButtons'
import { EventTitle, Score } from '../components/EventBits'

type Tab = 'aankomend' | 'gespeeld'

export default function AgendaPage() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('aankomend')
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)

  const team = isTeam(profile?.role)
  const teamNames = teamNameBySeason(events)
  const maxPlayers = useMaxMatchPlayers()
  const myPlayerId = profile?.player_id ?? null

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      // Een activiteit telt nog 3 uur na aanvang als "aankomend" (lopende wedstrijd)
      const cutoff = new Date(Date.now() - 3 * 3600_000).toISOString()
      const query = supabase.from('events').select('*').limit(60)
      const { data } =
        tab === 'aankomend'
          ? await query.gte('starts_at', cutoff).order('starts_at', { ascending: true })
          : await query.lt('starts_at', cutoff).order('starts_at', { ascending: false })

      const list = (data as TeamEvent[] | null) ?? []
      let att: Attendance[] = []
      // Aanwezigheid is alleen zichtbaar voor het team (RLS), dus supporters slaan dit over
      if (team && list.length) {
        const { data: a } = await supabase
          .from('attendance')
          .select('event_id, player_id, status, note, updated_at')
          .in('event_id', list.map((e) => e.id))
        att = (a as Attendance[] | null) ?? []
      }
      if (!cancelled) {
        setEvents(list)
        setAttendance(att)
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [tab, team])

  // Na aan-/afmelden opnieuw ophalen: door de wachtlijst kunnen ook anderen verschoven zijn
  async function refreshEvent(eventId: string) {
    const { data } = await supabase
      .from('attendance')
      .select('event_id, player_id, status, note, updated_at')
      .eq('event_id', eventId)
    setAttendance((prev) => [...prev.filter((a) => a.event_id !== eventId), ...((data as Attendance[] | null) ?? [])])
  }

  return (
    <div>
      <div className="page-head">
        <h1>Agenda</h1>
        {isStaff(profile?.role) && (
          <Link to="/activiteit/nieuw" className="btn btn-primary btn-small">+ Nieuw</Link>
        )}
      </div>

      <div className="tabs">
        <button className={tab === 'aankomend' ? 'is-active' : ''} onClick={() => setTab('aankomend')}>Aankomend</button>
        <button className={tab === 'gespeeld' ? 'is-active' : ''} onClick={() => setTab('gespeeld')}>Geweest</button>
      </div>

      {team && !myPlayerId && (
        <p className="notice">
          Je account is nog niet aan een speler gekoppeld, dus je kunt je nog niet aan- of afmelden.{' '}
          {profile?.role === 'beheerder' ? (
            <>Ga naar <Link to="/beheer">Beheer → Gebruikers</Link> en kies bij jezelf "+ Nieuwe speler".</>
          ) : (
            <>Vraag de beheerder om je te koppelen.</>
          )}
        </p>
      )}

      {loading ? (
        <p className="muted">Laden…</p>
      ) : events.length === 0 ? (
        <p className="muted">Nog niets gepland.</p>
      ) : (
        <ul className="event-list">
          {events.map((ev, i) => {
            // Kopje boven de eerste activiteit van elk seizoen
            const season = seasonOf(ev.starts_at)
            const newSeason = i === 0 || seasonOf(events[i - 1].starts_at) !== season
            const seasonTeam = teamNames.get(season)
            const evAtt = attendance.filter((a) => a.event_id === ev.id)
            const mine = evAtt.find((a) => a.player_id === myPlayerId)?.status
            const coming = evAtt.filter((a) => a.status === 'aanwezig').length
            const waiting = evAtt.filter((a) => a.status === 'wachtlijst').length
            // Limiet geldt alleen voor wedstrijden
            const cap = ev.kind === 'wedstrijd' ? maxPlayers : null
            const canRespond =
              team && myPlayerId && tab === 'aankomend' && ev.status !== 'afgelast' && new Date(ev.starts_at) > new Date()

            return (
              <Fragment key={ev.id}>
              {newSeason && (
                <li className="season-header">
                  Seizoen {seasonLabel(season)}
                  {seasonTeam && <span className="muted"> · {seasonTeam}</span>}
                </li>
              )}
              <li>
                <Link to={`/activiteit/${ev.id}`} className={`event-card kind-${ev.kind} status-${ev.status}`}>
                  <div className="event-date">
                    <span>{formatDay(ev.starts_at)}</span>
                    <strong>{formatTime(ev.starts_at)}</strong>
                  </div>
                  <div className="event-main">
                    <div className="event-title">
                      <EventTitle ev={ev} />
                      {ev.status === 'afgelast' && <span className="badge badge-red">Afgelast</span>}
                    </div>
                    <div className="event-meta">
                      {ev.kind === 'wedstrijd' && ev.is_home !== null && (
                        <span className="badge">{ev.is_home ? 'Thuis' : 'Uit'}</span>
                      )}
                      {ev.location && <span>{ev.location}</span>}
                      {/* bij oude wedstrijden zonder aanmeldingen (bijv. vorig seizoen) geen "0 aanwezig" */}
                      {team && ev.status !== 'afgelast' && (tab === 'aankomend' || coming > 0) && (
                        <span className={cap !== null && coming >= cap ? 'full' : ''}>
                          {cap !== null ? `${coming}/${cap}` : coming} aanwezig
                          {cap !== null && coming >= cap && ' · vol'}
                          {waiting > 0 && ` · ${waiting} wachtlijst`}
                        </span>
                      )}
                    </div>
                    {canRespond && (
                      <AttendanceButtons eventId={ev.id} current={mine} compact onChange={() => void refreshEvent(ev.id)} />
                    )}
                  </div>
                  {ev.score_us !== null && ev.score_them !== null && <Score ev={ev} />}
                </Link>
              </li>
              </Fragment>
            )
          })}
        </ul>
      )}
    </div>
  )
}

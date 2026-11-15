import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { reasonText, rpc, supabase } from '../lib/supabase'
import { formatLongDay, formatTime } from '../lib/format'
import {
  isStaff, isTeam,
  type Attendance, type AttendanceStatus, type MatchStat, type Player, type TeamEvent,
} from '../lib/types'
import AttendanceButtons from '../components/AttendanceButtons'
import { EventTitle, Score } from '../components/EventBits'
import MatchStatsEditor from '../components/MatchStatsEditor'

const COMPETITION_LABEL = { competitie: 'Competitie', beker: 'Beker', oefen: 'Oefenwedstrijd' } as const

export default function EventPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [ev, setEv] = useState<TeamEvent | null>(null)
  // Alle spelers (ook inactieve), nodig om namen bij statistieken te tonen
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [stats, setStats] = useState<MatchStat[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const team = isTeam(profile?.role)
  const staff = isStaff(profile?.role)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [er, pr, sr] = await Promise.all([
        supabase.from('events').select('*').eq('id', id!).maybeSingle(),
        supabase.from('players').select('*').order('name'),
        supabase.from('match_stats').select('*').eq('event_id', id!),
      ])
      let a: Attendance[] = []
      // Aanwezigheid alleen voor het team (RLS laat supporters toch niets zien)
      if (team) {
        const { data } = await supabase.from('attendance').select('event_id, player_id, status, note').eq('event_id', id!)
        a = (data as Attendance[] | null) ?? []
      }
      if (!cancelled) {
        setEv(er.data as TeamEvent | null)
        setAllPlayers((pr.data as Player[] | null) ?? [])
        setStats((sr.data as MatchStat[] | null) ?? [])
        setAttendance(a)
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [id, team])

  function setStatus(playerId: string, status: AttendanceStatus) {
    setAttendance((prev) => [
      ...prev.filter((x) => x.player_id !== playerId),
      { event_id: id!, player_id: playerId, status, note: null },
    ])
  }

  async function handleDelete() {
    if (!ev || !confirm('Weet je zeker dat je deze activiteit wilt verwijderen?')) return
    const res = await rpc('delete_event', { p_id: ev.id })
    if (res.ok) navigate('/')
    else setError(reasonText(res.reason))
  }

  if (loading) return <p className="muted">Laden…</p>
  if (!ev) return <p>Activiteit niet gevonden. <Link to="/">Terug naar agenda</Link></p>

  const upcoming = new Date(ev.starts_at) > new Date() && ev.status !== 'afgelast'
  const started = new Date(ev.starts_at) <= new Date()
  const players = allPlayers.filter((p) => p.active)
  const nameOf = (pid: string) => allPlayers.find((p) => p.id === pid)?.name ?? 'Onbekend'
  // In de editor: actieve spelers + oud-spelers die al statistieken in deze wedstrijd hebben
  const editorPlayers = allPlayers.filter((p) => p.active || stats.some((s) => s.player_id === p.id))
  const scorers = stats.filter((s) => s.goals > 0).sort((a, b) => b.goals - a.goals)
  const assisters = stats.filter((s) => s.assists > 0).sort((a, b) => b.assists - a.assists)
  const carded = stats.filter((s) => s.yellow_cards > 0 || s.red_card)
  const statusOf = (pid: string) => attendance.find((a) => a.player_id === pid)?.status
  const groups: { key: AttendanceStatus | 'onbekend'; title: string; list: Player[] }[] = [
    { key: 'aanwezig', title: 'Komt', list: players.filter((p) => statusOf(p.id) === 'aanwezig') },
    { key: 'misschien', title: 'Misschien', list: players.filter((p) => statusOf(p.id) === 'misschien') },
    { key: 'afwezig', title: 'Kan niet', list: players.filter((p) => statusOf(p.id) === 'afwezig') },
    { key: 'onbekend', title: 'Nog niet gereageerd', list: players.filter((p) => !statusOf(p.id)) },
  ]

  return (
    <div>
      <Link to="/" className="back">← Agenda</Link>

      <div className={`card event-hero kind-${ev.kind}`}>
        <div className="event-hero-top">
          <div>
            <h1><EventTitle ev={ev} /></h1>
            <p className="muted">
              {formatLongDay(ev.starts_at)} · {formatTime(ev.starts_at)}
              {ev.meet_at && <> · verzamelen {formatTime(ev.meet_at)}</>}
            </p>
          </div>
          {ev.score_us !== null && ev.score_them !== null && <Score ev={ev} />}
        </div>
        <div className="event-meta">
          {ev.status === 'afgelast' && <span className="badge badge-red">Afgelast</span>}
          {ev.kind === 'wedstrijd' && ev.is_home !== null && <span className="badge">{ev.is_home ? 'Thuis' : 'Uit'}</span>}
          {ev.competition && <span className="badge">{COMPETITION_LABEL[ev.competition]}</span>}
          {ev.location && <span>📍 {ev.location}</span>}
        </div>
        {ev.notes && <p className="notes">{ev.notes}</p>}

        {staff && (
          <div className="actions">
            <Link to={`/activiteit/${ev.id}/bewerken`} className="btn btn-small">Bewerken</Link>
            {/* Wedstrijden uit Sportlink komen bij de volgende sync terug, dus niet verwijderbaar */}
            {ev.source !== 'voetbalnl' && (
              <button className="btn btn-small btn-danger" onClick={handleDelete}>Verwijderen</button>
            )}
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {ev.kind === 'wedstrijd' && stats.length > 0 && (
        <div className="card">
          <h2>Wedstrijdverslag</h2>
          {scorers.length > 0 && (
            <p><span className="stat-label">⚽ Doelpunten</span> {scorers.map((s) => `${nameOf(s.player_id)}${s.goals > 1 ? ` (${s.goals})` : ''}`).join(', ')}</p>
          )}
          {assisters.length > 0 && (
            <p><span className="stat-label">🅰️ Assists</span> {assisters.map((s) => `${nameOf(s.player_id)}${s.assists > 1 ? ` (${s.assists})` : ''}`).join(', ')}</p>
          )}
          {carded.length > 0 && (
            <p>
              <span className="stat-label">Kaarten</span>{' '}
              {carded.map((s) => `${nameOf(s.player_id)} ${'🟨'.repeat(s.yellow_cards)}${s.red_card ? '🟥' : ''}`).join(', ')}
            </p>
          )}
        </div>
      )}

      {staff && ev.kind === 'wedstrijd' && started && ev.status !== 'afgelast' && (
        <MatchStatsEditor
          eventId={ev.id}
          players={editorPlayers}
          stats={stats}
          scoreUs={ev.score_us}
          onSaved={setStats}
        />
      )}

      {team && profile?.player_id && upcoming && (
        <div className="card">
          <h2>Ben jij erbij?</h2>
          <AttendanceButtons
            eventId={ev.id}
            current={statusOf(profile.player_id)}
            onChange={(s) => setStatus(profile.player_id!, s)}
          />
        </div>
      )}

      {team && (
        <div className="card">
          <h2>Aanwezigheid</h2>
          {players.length === 0 && <p className="muted">Nog geen spelers in de selectie.</p>}
          {groups.map((g) =>
            g.list.length === 0 ? null : (
              <div key={g.key} className="att-group">
                <h3>
                  {g.title} <span className="muted">({g.list.length})</span>
                </h3>
                <ul className="att-list">
                  {g.list.map((p) => {
                    const note = attendance.find((a) => a.player_id === p.id)?.note
                    return (
                      <li key={p.id}>
                        <span>
                          {p.shirt_number && <span className="shirt">{p.shirt_number}</span>}
                          {p.name}
                          {note && <span className="muted small"> — {note}</span>}
                        </span>
                        {/* Staf kan voor iedereen invullen, ook achteraf */}
                        {staff && (
                          <AttendanceButtons
                            eventId={ev.id}
                            playerId={p.id}
                            current={statusOf(p.id)}
                            compact
                            onChange={(s) => setStatus(p.id, s)}
                          />
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

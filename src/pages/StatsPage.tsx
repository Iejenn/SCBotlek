import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { seasonLabel, seasonOf, seasonRange } from '../lib/season'
import Standings from '../components/Standings'
import { isTeam, type Attendance, type MatchStat, type Player, type TeamEvent } from '../lib/types'

type CompFilter = 'alles' | 'competitie' | 'beker'
type SortKey = 'goals' | 'assists' | 'ga' | 'cards' | 'matchPct' | 'trainingPct'

type PlayerRow = {
  player: Player
  goals: number
  assists: number
  yellow: number
  red: number
  matchesPresent: number
  trainingsPresent: number
}

// Statistieken per seizoen: teamresultaten, topscorers en aanwezigheid.
// Alles wordt hier in de browser opgeteld; het gaat om een paar honderd rijen per seizoen.
export default function StatsPage() {
  const { profile } = useAuth()
  const team = isTeam(profile?.role)

  const [seasons, setSeasons] = useState<number[]>([seasonOf(new Date())])
  const [season, setSeason] = useState(seasonOf(new Date()))
  const [comp, setComp] = useState<CompFilter>('alles')
  const [sortKey, setSortKey] = useState<SortKey>('goals')

  const [events, setEvents] = useState<TeamEvent[]>([])
  const [stats, setStats] = useState<MatchStat[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)

  // Welke seizoenen zijn er? Van de oudste activiteit t/m nu.
  useEffect(() => {
    supabase.from('events').select('starts_at').order('starts_at').limit(1).then(({ data }) => {
      const first = data?.[0]?.starts_at as string | undefined
      if (!first) return
      const list: number[] = []
      for (let y = seasonOf(new Date()); y >= seasonOf(first); y--) list.push(y)
      setSeasons(list)
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { from, to } = seasonRange(season)
      const [er, pr] = await Promise.all([
        supabase.from('events').select('*').gte('starts_at', from).lt('starts_at', to).order('starts_at'),
        supabase.from('players').select('*').order('name'),
      ])
      const evs = (er.data as TeamEvent[] | null) ?? []
      const ids = evs.map((e) => e.id)
      let st: MatchStat[] = []
      let att: Attendance[] = []
      if (ids.length) {
        const [sr, ar] = await Promise.all([
          supabase.from('match_stats').select('*').in('event_id', ids),
          team
            ? supabase.from('attendance').select('event_id, player_id, status, note').in('event_id', ids)
            : Promise.resolve({ data: [] }),
        ])
        st = (sr.data as MatchStat[] | null) ?? []
        att = (ar.data as Attendance[] | null) ?? []
      }
      if (!cancelled) {
        setEvents(evs)
        setPlayers((pr.data as Player[] | null) ?? [])
        setStats(st)
        setAttendance(att)
        setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [season, team])

  const now = new Date()
  const matches = events.filter((e) => e.kind === 'wedstrijd' && (comp === 'alles' || e.competition === comp))
  const matchIds = new Set(matches.map((e) => e.id))
  const played = matches.filter((e) => e.status === 'gespeeld' && e.score_us !== null && e.score_them !== null)

  // Teamresultaat
  const record = played.reduce(
    (r, e) => {
      const us = e.score_us!, them = e.score_them!
      if (us > them) r.w++
      else if (us === them) r.d++
      else r.l++
      r.gf += us
      r.ga += them
      return r
    },
    { w: 0, d: 0, l: 0, gf: 0, ga: 0 },
  )

  // Noemers voor aanwezigheid: wat is er al geweest en niet afgelast?
  const pastMatches = matches.filter((e) => new Date(e.starts_at) < now && e.status !== 'afgelast')
  const pastTrainings = events.filter((e) => e.kind === 'training' && new Date(e.starts_at) < now && e.status !== 'afgelast')
  const pastMatchIds = new Set(pastMatches.map((e) => e.id))
  const pastTrainingIds = new Set(pastTrainings.map((e) => e.id))
  // Is er dit seizoen überhaupt aanwezigheid bijgehouden? (bij geïmporteerde oude seizoenen niet)
  const hasAttendance = team && attendance.length > 0

  const rows: PlayerRow[] = useMemo(() => {
    const byPlayer = new Map<string, PlayerRow>()
    const row = (p: Player) => {
      if (!byPlayer.has(p.id)) {
        byPlayer.set(p.id, { player: p, goals: 0, assists: 0, yellow: 0, red: 0, matchesPresent: 0, trainingsPresent: 0 })
      }
      return byPlayer.get(p.id)!
    }
    const playerById = new Map(players.map((p) => [p.id, p]))
    players.filter((p) => p.active).forEach(row)

    for (const s of stats) {
      if (!matchIds.has(s.event_id)) continue
      const p = playerById.get(s.player_id)
      if (!p) continue
      const r = row(p)
      r.goals += s.goals
      r.assists += s.assists
      r.yellow += s.yellow_cards
      r.red += s.red_card ? 1 : 0
    }
    for (const a of attendance) {
      if (a.status !== 'aanwezig') continue
      const p = playerById.get(a.player_id)
      if (!p) continue
      if (pastMatchIds.has(a.event_id)) row(p).matchesPresent++
      else if (pastTrainingIds.has(a.event_id)) row(p).trainingsPresent++
    }
    return [...byPlayer.values()]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, stats, attendance, comp, events])

  const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0)
  const sortValue = (r: PlayerRow): number => {
    switch (sortKey) {
      case 'goals': return r.goals * 1000 + r.assists
      case 'assists': return r.assists * 1000 + r.goals
      case 'ga': return (r.goals + r.assists) * 1000 + r.goals
      case 'cards': return r.red * 1000 + r.yellow
      case 'matchPct': return pct(r.matchesPresent, pastMatches.length)
      case 'trainingPct': return pct(r.trainingsPresent, pastTrainings.length)
    }
  }
  const sorted = [...rows].sort((a, b) => sortValue(b) - sortValue(a) || a.player.name.localeCompare(b.player.name))
  const top = [...rows].sort((a, b) => b.goals - a.goals)[0]

  const Th = ({ k, children, title, className = '' }: { k: SortKey; children: React.ReactNode; title: string; className?: string }) => (
    <th className={`num ${className}`}>
      <button
        className={`sort-btn ${sortKey === k ? 'is-active' : ''}`}
        onClick={() => setSortKey(k)}
        title={`Sorteer op ${title.toLowerCase()}`}
        aria-label={title}
      >
        {children}
      </button>
    </th>
  )

  return (
    <div>
      <div className="page-head">
        <h1>Statistieken</h1>
        <select value={season} onChange={(e) => setSeason(Number(e.target.value))} aria-label="Seizoen">
          {seasons.map((y) => <option key={y} value={y}>{seasonLabel(y)}</option>)}
        </select>
      </div>

      {/* Sportlink geeft alleen de stand van het lopende seizoen */}
      {season === seasonOf(new Date()) && <Standings />}

      <h2 className="section-title">Ons team</h2>
      <div className="tabs">
        {(['alles', 'competitie', 'beker'] as CompFilter[]).map((c) => (
          <button key={c} className={comp === c ? 'is-active' : ''} onClick={() => setComp(c)}>
            {c === 'alles' ? 'Alles' : c === 'competitie' ? 'Competitie' : 'Beker'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted">Laden…</p>
      ) : (
        <>
          <div className="tiles">
            <div className="tile">
              <span className="tile-label">Gespeeld</span>
              <span className="tile-value">{played.length}</span>
            </div>
            <div className="tile">
              <span className="tile-label">W – G – V</span>
              <span className="tile-value">{record.w}–{record.d}–{record.l}</span>
            </div>
            <div className="tile">
              <span className="tile-label">Doelsaldo</span>
              <span className="tile-value">
                {record.gf - record.ga > 0 ? '+' : ''}{record.gf - record.ga}
              </span>
              <span className="tile-sub">{record.gf} voor · {record.ga} tegen</span>
            </div>
            <div className="tile">
              <span className="tile-label">Topscorer</span>
              {top && top.goals > 0 ? (
                <>
                  <span className="tile-value tile-name">{top.player.name}</span>
                  <span className="tile-sub">{top.goals} doelpunten</span>
                </>
              ) : (
                <span className="tile-value tile-name muted">–</span>
              )}
            </div>
          </div>

          <div className="card">
            <h2>Spelers</h2>
            {stats.length === 0 && (
              <p className="muted small">
                Nog geen doelpunten of assists ingevuld voor dit seizoen. Aanvoerders doen dat op de wedstrijdpagina.
              </p>
            )}
            <div className="table-wrap">
              <table className="table stats-table">
                <thead>
                  <tr>
                    <th>Speler</th>
                    <Th k="goals" title="Doelpunten">⚽</Th>
                    <Th k="assists" title="Assists">🅰️</Th>
                    <Th k="ga" title="Doelpunten + assists" className="hide-sm">G+A</Th>
                    <Th k="cards" title="Kaarten" className="hide-sm">🟨🟥</Th>
                    {hasAttendance && <Th k="matchPct" title="Aanwezig bij wedstrijden">W%</Th>}
                    {hasAttendance && <Th k="trainingPct" title="Aanwezig bij trainingen">T%</Th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.player.id} className={r.player.active ? '' : 'is-inactive'}>
                      <td>
                        {r.player.shirt_number && <span className="shirt">{r.player.shirt_number}</span>}
                        {r.player.name}
                      </td>
                      <td className="num strong">{r.goals || '–'}</td>
                      <td className="num">{r.assists || '–'}</td>
                      <td className="num hide-sm">{r.goals + r.assists || '–'}</td>
                      <td className="num hide-sm">
                        {r.yellow || r.red ? `${r.yellow}${r.red ? ` / ${r.red}` : ''}` : '–'}
                      </td>
                      {hasAttendance && (
                        <td className="num" title={`${r.matchesPresent} van ${pastMatches.length}`}>
                          {pct(r.matchesPresent, pastMatches.length)}%
                        </td>
                      )}
                      {hasAttendance && (
                        <td className="num" title={`${r.trainingsPresent} van ${pastTrainings.length}`}>
                          {pastTrainings.length ? `${pct(r.trainingsPresent, pastTrainings.length)}%` : '–'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">
              Tik op een kolomkop om te sorteren. Kaarten: geel / rood.
              {hasAttendance && ' W% / T% = aanwezig bij wedstrijden / trainingen die al geweest zijn (✓-aanmeldingen).'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

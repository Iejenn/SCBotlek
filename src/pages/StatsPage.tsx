import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { formatDay, formatTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import { seasonLabel, seasonOf, seasonRange, teamNameBySeason } from '../lib/season'
import Standings from '../components/Standings'
import { isTeam, type Attendance, type MatchStat, type Player, type TeamEvent } from '../lib/types'
import PlayerName from '../components/PlayerName'

type CompFilter = 'alles' | 'competitie' | 'beker'
type SortKey = 'goals' | 'assists' | 'ga' | 'yellow' | 'red'

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
  const [seasonTeams, setSeasonTeams] = useState<Map<number, string>>(new Map())
  const [season, setSeason] = useState(seasonOf(new Date()))
  const [comp, setComp] = useState<CompFilter>('alles')
  const [sortKey, setSortKey] = useState<SortKey>('goals')
  const [attSort, setAttSort] = useState<'matchPct' | 'trainingPct'>('matchPct')

  const [events, setEvents] = useState<TeamEvent[]>([])
  const [stats, setStats] = useState<MatchStat[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [loading, setLoading] = useState(true)

  // Welke seizoenen zijn er? Van de oudste activiteit t/m nu.
  useEffect(() => {
    // Alle Sportlink-wedstrijden: voor de lijst met seizoenen + teamnaam per seizoen
    supabase
      .from('events')
      .select('starts_at, team_name')
      .order('starts_at')
      .then(({ data }) => {
        const all = (data as { starts_at: string; team_name: string | null }[] | null) ?? []
        if (!all.length) return
        const list: number[] = []
        for (let y = seasonOf(new Date()); y >= seasonOf(all[0].starts_at); y--) list.push(y)
        setSeasons(list)
        setSeasonTeams(teamNameBySeason(all))
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

  const sortValue = (r: PlayerRow): number => {
    switch (sortKey) {
      case 'goals': return r.goals * 1000 + r.assists
      case 'assists': return r.assists * 1000 + r.goals
      case 'ga': return (r.goals + r.assists) * 1000 + r.goals
      case 'yellow': return r.yellow * 1000 + r.red
      case 'red': return r.red * 1000 + r.yellow
    }
  }
  const sorted = [...rows].sort((a, b) => sortValue(b) - sortValue(a) || a.player.name.localeCompare(b.player.name))
  const top = [...rows].sort((a, b) => b.goals - a.goals)[0]

  // Aanwezigheid: meest aanwezig bovenaan
  const attRows = [...rows].sort((a, b) =>
    attSort === 'matchPct'
      ? b.matchesPresent - a.matchesPresent || b.trainingsPresent - a.trainingsPresent
      : b.trainingsPresent - a.trainingsPresent || b.matchesPresent - a.matchesPresent,
  )
  const presentAtMatches = attendance.filter((a) => a.status === 'aanwezig' && pastMatchIds.has(a.event_id)).length
  const avgPerMatch = pastMatches.length ? presentAtMatches / pastMatches.length : null
  const presentAtTrainings = attendance.filter((a) => a.status === 'aanwezig' && pastTrainingIds.has(a.event_id)).length
  const avgPerTraining = pastTrainings.length ? presentAtTrainings / pastTrainings.length : null
  const nextTraining = events.find((e) => e.kind === 'training' && new Date(e.starts_at) >= now && e.status !== 'afgelast')

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
          {seasons.map((y) => (
            <option key={y} value={y}>
              {seasonLabel(y)}{seasonTeams.get(y) ? ` · ${seasonTeams.get(y)}` : ''}
            </option>
          ))}
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
                    <Th k="yellow" title="Gele kaarten">🟨</Th>
                    <Th k="red" title="Rode kaarten">🟥</Th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.player.id} className={r.player.active ? '' : 'is-inactive'}>
                      <td>
                        <PlayerName player={r.player} />
                      </td>
                      <td className="num strong">{r.goals || '–'}</td>
                      <td className="num">{r.assists || '–'}</td>
                      <td className="num hide-sm">{r.goals + r.assists || '–'}</td>
                      <td className="num">{r.yellow || '–'}</td>
                      <td className="num">{r.red || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">
              Tik op een kolomkop om te sorteren.
            </p>
          </div>

          {/* Aanwezigheid: alleen voor het team (supporters kunnen dit via RLS niet zien) */}
          {team && (
            <div className="card">
              <div className="card-head">
                <h2>Aanwezigheid</h2>
                <div className="segmented segmented-small">
                  <button className={attSort === 'matchPct' ? 'is-active' : ''} onClick={() => setAttSort('matchPct')}>Wedstrijden</button>
                  <button className={attSort === 'trainingPct' ? 'is-active' : ''} onClick={() => setAttSort('trainingPct')}>Trainingen</button>
                </div>
              </div>
              {(() => {
                // Schakelaar toont óf wedstrijden óf trainingen
                const isMatch = attSort === 'matchPct'
                const total = isMatch ? pastMatches.length : pastTrainings.length
                const avg = isMatch ? avgPerMatch : avgPerTraining
                if (total === 0) {
                  return (
                    <p className="muted small">
                      {isMatch ? 'Er is dit seizoen nog geen wedstrijd geweest.' : 'Er is dit seizoen nog geen training geweest.'}
                      {!isMatch && nextTraining && <> De eerste is {formatDay(nextTraining.starts_at)} {formatTime(nextTraining.starts_at)}.</>}
                    </p>
                  )
                }
                if (!hasAttendance) {
                  return <p className="muted small">Voor dit seizoen is (nog) geen aanwezigheid bijgehouden.</p>
                }
                return (
                  <>
                    <p className="muted small">
                      {total} {isMatch ? (total === 1 ? 'wedstrijd' : 'wedstrijden') : total === 1 ? 'training' : 'trainingen'} geweest
                      {avg !== null && (
                        <> · gemiddeld <b>{avg.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</b> spelers per {isMatch ? 'wedstrijd' : 'training'}</>
                      )}
                    </p>
                    <div className="table-wrap">
                      <table className="table att-table">
                        <thead>
                          <tr>
                            <th>Speler</th>
                            <th>{isMatch ? 'Wedstrijden' : 'Trainingen'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {attRows.map((r) => (
                            <tr key={r.player.id} className={r.player.active ? '' : 'is-inactive'}>
                              <td>
                                <PlayerName player={r.player} />
                              </td>
                              <td><Meter n={isMatch ? r.matchesPresent : r.trainingsPresent} total={total} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )
              })()}
              <p className="muted small">
                Telt de ✓-aanmeldingen bij activiteiten die al geweest zijn (afgelaste niet). Was iemand er toch wel of
                niet? Een aanvoerder kan dat achteraf aanpassen op de wedstrijd- of trainingspagina.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// "5 / 7" met een balkje: hoe vaak iemand er was
function Meter({ n, total }: { n: number; total: number }) {
  if (!total) return <span className="muted">–</span>
  const p = Math.round((n / total) * 100)
  return (
    <div className="meter" title={`${n} van ${total} (${p}%)`}>
      <span className="meter-text">
        <b>{n}</b>
        <span className="muted"> / {total}</span>
      </span>
      <span className="meter-track" aria-hidden="true">
        <span className="meter-fill" style={{ width: `${p}%` }} />
      </span>
    </div>
  )
}

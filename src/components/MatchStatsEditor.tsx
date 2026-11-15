import { useState } from 'react'
import { reasonText, rpc } from '../lib/supabase'
import type { MatchStat, Player } from '../lib/types'

type Row = { goals: number; assists: number; yellow_cards: number; red_card: boolean }
const EMPTY: Row = { goals: 0, assists: 0, yellow_cards: 0, red_card: false }

type Props = {
  eventId: string
  players: Player[] // actieve spelers + wie al statistieken heeft
  stats: MatchStat[]
  scoreUs: number | null
  onSaved: (stats: MatchStat[]) => void
}

// Invoerscherm voor aanvoerders: doelpunten, assists en kaarten per speler.
// Slaat alles in één keer op via de save_match_stats RPC.
export default function MatchStatsEditor({ eventId, players, stats, scoreUs, onSaved }: Props) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    Object.fromEntries(stats.map((s) => [s.player_id, { ...s }])),
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const get = (id: string) => rows[id] ?? EMPTY
  const update = (id: string, patch: Partial<Row>) => {
    setMessage(null)
    setRows((prev) => ({ ...prev, [id]: { ...get(id), ...patch } }))
  }

  const totalGoals = Object.values(rows).reduce((sum, r) => sum + r.goals, 0)
  const totalAssists = Object.values(rows).reduce((sum, r) => sum + r.assists, 0)

  async function save() {
    setBusy(true)
    setError(null)
    setMessage(null)
    const payload = Object.entries(rows).map(([player_id, r]) => ({ player_id, ...r }))
    const res = await rpc('save_match_stats', { p_event_id: eventId, p_stats: payload })
    setBusy(false)
    if (!res.ok) return setError(reasonText(res.reason))
    setMessage('Opgeslagen.')
    onSaved(
      payload
        .filter((r) => r.goals || r.assists || r.yellow_cards || r.red_card)
        .map((r) => ({ event_id: eventId, ...r })),
    )
  }

  const num = (id: string, field: 'goals' | 'assists', value: number) => (
    <input
      type="number"
      min={0}
      max={20}
      inputMode="numeric"
      className="input-num"
      value={value || ''}
      placeholder="0"
      onChange={(e) => update(id, { [field]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
      aria-label={field === 'goals' ? 'Doelpunten' : 'Assists'}
    />
  )

  return (
    <div className="card">
      <h2>Statistieken invullen</h2>
      <p className="muted small">
        Doelpunten {totalGoals}
        {scoreUs !== null && <> van {scoreUs}</>} · assists {totalAssists}
        {scoreUs !== null && totalGoals < scoreUs && <> · rest = eigen doelpunten tegenstander of onbekend</>}
      </p>
      <div className="table-wrap">
        <table className="table stats-input">
          <thead>
            <tr>
              <th>Speler</th>
              <th title="Doelpunten">⚽</th>
              <th title="Assists">🅰️</th>
              <th title="Gele kaarten">🟨</th>
              <th title="Rode kaart">🟥</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const r = get(p.id)
              return (
                <tr key={p.id}>
                  <td>
                    {p.shirt_number && <span className="shirt">{p.shirt_number}</span>}
                    {p.name}
                  </td>
                  <td>{num(p.id, 'goals', r.goals)}</td>
                  <td>{num(p.id, 'assists', r.assists)}</td>
                  <td>
                    <select
                      value={r.yellow_cards}
                      onChange={(e) => update(p.id, { yellow_cards: Number(e.target.value) })}
                      aria-label="Gele kaarten"
                    >
                      <option value={0}>0</option>
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.red_card}
                      onChange={(e) => update(p.id, { red_card: e.target.checked })}
                      aria-label="Rode kaart"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <button className="btn btn-primary" onClick={save} disabled={busy || players.length === 0}>
        {busy ? 'Opslaan…' : 'Statistieken opslaan'}
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { fetchStanding, fetchTeamPoules, pouleLabel, prettyTeam, type Poule, type StandingRow } from '../lib/sportlink'

// Competitiestand, live opgehaald bij Sportlink zodra de pagina opent.
// Zo actueel als voetbal.nl: bijgewerkt zodra de uitslag in Sportlink staat.
export default function Standings() {
  const [poules, setPoules] = useState<Poule[]>([])
  const [active, setActive] = useState<number | null>(null)
  const [rows, setRows] = useState<StandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 1) Welke poules (competitie, beker) heeft ons team?
  useEffect(() => {
    fetchTeamPoules()
      .then((list) => {
        // competitie eerst
        const sorted = [...list].sort((a, b) => Number(/beker/i.test(a.teamnaam)) - Number(/beker/i.test(b.teamnaam)))
        setPoules(sorted)
        setActive(sorted[0]?.poulecode ?? null)
        if (!sorted.length) setLoading(false)
      })
      .catch(() => {
        setError('De stand kon niet worden opgehaald bij Sportlink.')
        setLoading(false)
      })
  }, [])

  // 2) Stand van de gekozen poule
  useEffect(() => {
    if (active === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchStanding(active)
      .then((data) => !cancelled && setRows(data))
      .catch(() => !cancelled && setError('De stand kon niet worden opgehaald bij Sportlink.'))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [active])

  return (
    <div className="card">
      <div className="card-head">
        <h2>Stand</h2>
        {poules.length > 1 && (
          <div className="segmented segmented-small">
            {poules.map((p) => (
              <button key={p.poulecode} className={active === p.poulecode ? 'is-active' : ''} onClick={() => setActive(p.poulecode)}>
                {pouleLabel(p)}
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <p className="error">{error}</p>
      ) : loading ? (
        <p className="muted">Laden…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Nog geen stand beschikbaar.</p>
      ) : (
        <div className="table-wrap">
          <table className="table standings">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Team</th>
                <th className="num" title="Gespeeld">G</th>
                <th className="num hide-sm" title="Winst">W</th>
                <th className="num hide-sm" title="Gelijk">G</th>
                <th className="num hide-sm" title="Verlies">V</th>
                <th className="num" title="Doelsaldo">+/-</th>
                <th className="num" title="Punten">P</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.positie + r.teamnaam} className={r.eigenteam === 'true' ? 'is-own' : ''}>
                  <td className="num">{r.positie}</td>
                  <td>
                    <span className="team-cell">
                      {r.clublogo && <img src={r.clublogo} alt="" className="club-logo" loading="lazy" />}
                      {prettyTeam(r.teamnaam)}
                    </span>
                  </td>
                  <td className="num">{r.gespeeldewedstrijden}</td>
                  <td className="num hide-sm">{r.gewonnen}</td>
                  <td className="num hide-sm">{r.gelijk}</td>
                  <td className="num hide-sm">{r.verloren}</td>
                  <td className="num">{r.doelsaldo > 0 ? `+${r.doelsaldo}` : r.doelsaldo}</td>
                  <td className="num strong">{r.punten}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">Live uit Sportlink (zelfde bron als voetbal.nl). G = gespeeld, P = punten.</p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/format'
import type { TeamEvent } from '../lib/types'
import { EventTitle, Score } from '../components/EventBits'

// Startpagina voor bezoekers zonder account: volgende wedstrijd, laatste uitslag,
// knoppen naar agenda en statistieken, en klein "inloggen voor spelers".
// Ingelogde gebruikers zien op "/" gewoon de agenda.
export default function HomePage() {
  const [next, setNext] = useState<TeamEvent | null>(null)
  const [last, setLast] = useState<TeamEvent | null>(null)

  useEffect(() => {
    const now = new Date().toISOString()
    void Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('kind', 'wedstrijd')
        .neq('status', 'afgelast')
        .gte('starts_at', now)
        .order('starts_at')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('events')
        .select('*')
        .eq('kind', 'wedstrijd')
        .eq('status', 'gespeeld')
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]).then(([n, l]) => {
      setNext((n.data as TeamEvent | null) ?? null)
      setLast((l.data as TeamEvent | null) ?? null)
    })
  }, [])

  return (
    <div className="home">
      <div className="home-hero">
        <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="SC Botlek" className="home-logo" />
        <h1>SC Botlek 7</h1>
        <p className="muted">Wedstrijden, uitslagen en statistieken van ons team</p>
      </div>

      <div className="home-cards">
        {next && (
          <Link to={`/activiteit/${next.id}`} className="card home-match">
            <span className="tile-label">Volgende wedstrijd</span>
            <strong><EventTitle ev={next} /></strong>
            <span className="muted small">
              {formatDay(next.starts_at)} · {formatTime(next.starts_at)}
              {next.location && <> · {next.location}</>}
            </span>
          </Link>
        )}
        {last && (
          <Link to={`/activiteit/${last.id}`} className="card home-match">
            <span className="tile-label">Laatste uitslag</span>
            <div className="home-result">
              <strong><EventTitle ev={last} /></strong>
              <Score ev={last} />
            </div>
            <span className="muted small">{formatDay(last.starts_at)}</span>
          </Link>
        )}
      </div>

      <div className="home-actions">
        <Link to="/agenda" className="btn btn-primary btn-big">📅 Bekijk agenda</Link>
        <Link to="/statistieken" className="btn btn-primary btn-big">📊 Bekijk teamstatistieken</Link>
      </div>

      <p className="home-login">
        Speler van het team? <Link to="/inloggen">Inloggen</Link>
      </p>
    </div>
  )
}

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { reasonText, rpc, supabase } from '../lib/supabase'
import { fromLocalInput, toLocalInput } from '../lib/format'
import type { EventKind, EventStatus, TeamEvent } from '../lib/types'

// Formulier voor nieuwe of bestaande activiteit (alleen staf).
export default function EventFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)

  const [kind, setKind] = useState<EventKind>('wedstrijd')
  const [startsAt, setStartsAt] = useState('')
  const [meetAt, setMeetAt] = useState('')
  const [location, setLocation] = useState('')
  const [opponent, setOpponent] = useState('')
  const [isHome, setIsHome] = useState(true)
  const [competition, setCompetition] = useState<'competitie' | 'beker' | 'oefen'>('competitie')
  const [status, setStatus] = useState<EventStatus>('gepland')
  const [scoreUs, setScoreUs] = useState('')
  const [scoreThem, setScoreThem] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Bij bewerken: bestaande gegevens inladen
  useEffect(() => {
    if (!id) return
    supabase.from('events').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      const ev = data as TeamEvent | null
      if (!ev) return
      setKind(ev.kind)
      setStartsAt(toLocalInput(ev.starts_at))
      setMeetAt(toLocalInput(ev.meet_at))
      setLocation(ev.location ?? '')
      setOpponent(ev.opponent ?? '')
      setIsHome(ev.is_home ?? true)
      setCompetition(ev.competition ?? 'competitie')
      setStatus(ev.status)
      setScoreUs(ev.score_us?.toString() ?? '')
      setScoreThem(ev.score_them?.toString() ?? '')
      setNotes(ev.notes ?? '')
    })
  }, [id])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!startsAt) {
      setError('Vul een datum en tijd in.')
      return
    }
    const match = kind === 'wedstrijd'
    setBusy(true)
    const res = await rpc('upsert_event', {
      p_id: id ?? null,
      p_kind: kind,
      p_starts_at: fromLocalInput(startsAt),
      p_meet_at: fromLocalInput(meetAt),
      p_location: location,
      p_opponent: match ? opponent : null,
      p_is_home: match ? isHome : null,
      p_competition: match ? competition : null,
      p_status: status,
      p_score_us: match && scoreUs !== '' ? Number(scoreUs) : null,
      p_score_them: match && scoreThem !== '' ? Number(scoreThem) : null,
      p_notes: notes,
    })
    setBusy(false)
    if (res.ok) navigate(`/activiteit/${res.id as string}`)
    else setError(reasonText(res.reason))
  }

  return (
    <div>
      <Link to={id ? `/activiteit/${id}` : '/'} className="back">← Terug</Link>
      <form className="card form" onSubmit={handleSubmit}>
        <h1>{editing ? 'Activiteit bewerken' : 'Nieuwe activiteit'}</h1>

        <div className="segmented">
          <button type="button" className={kind === 'wedstrijd' ? 'is-active' : ''} onClick={() => setKind('wedstrijd')}>Wedstrijd</button>
          <button type="button" className={kind === 'training' ? 'is-active' : ''} onClick={() => setKind('training')}>Training</button>
        </div>

        <div className="grid-2">
          <label>
            Aanvang
            <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </label>
          <label>
            Verzamelen (optioneel)
            <input type="datetime-local" value={meetAt} onChange={(e) => setMeetAt(e.target.value)} />
          </label>
        </div>

        {kind === 'wedstrijd' && (
          <>
            <label>
              Tegenstander
              <input value={opponent} onChange={(e) => setOpponent(e.target.value)} maxLength={60} placeholder="bijv. Spijkenisse 3" />
            </label>
            <div className="grid-2">
              <label>
                Thuis / uit
                <select value={isHome ? 'thuis' : 'uit'} onChange={(e) => setIsHome(e.target.value === 'thuis')}>
                  <option value="thuis">Thuis</option>
                  <option value="uit">Uit</option>
                </select>
              </label>
              <label>
                Soort
                <select value={competition} onChange={(e) => setCompetition(e.target.value as typeof competition)}>
                  <option value="competitie">Competitie</option>
                  <option value="beker">Beker</option>
                  <option value="oefen">Oefenwedstrijd</option>
                </select>
              </label>
            </div>
          </>
        )}

        <label>
          Locatie
          <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} />
        </label>

        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as EventStatus)}>
            <option value="gepland">Gepland</option>
            <option value="gespeeld">Gespeeld</option>
            <option value="afgelast">Afgelast</option>
          </select>
        </label>

        {kind === 'wedstrijd' && status === 'gespeeld' && (
          <div className="grid-2">
            <label>
              Doelpunten SC Botlek
              <input type="number" min={0} value={scoreUs} onChange={(e) => setScoreUs(e.target.value)} />
            </label>
            <label>
              Doelpunten tegenstander
              <input type="number" min={0} value={scoreThem} onChange={(e) => setScoreThem(e.target.value)} />
            </label>
          </div>
        )}

        <label>
          Opmerkingen
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
        </label>

        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
      </form>
    </div>
  )
}

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { reasonText, rpc, supabase } from '../lib/supabase'
import { ROLE_LABELS, type Player, type Profile, type Role } from '../lib/types'

type Tab = 'selectie' | 'trainingen' | 'gebruikers'

// Beheer: selectie (staf), trainingsreeks (staf), gebruikers & rollen (beheerder)
export default function ManagePage() {
  const { profile } = useAuth()
  const admin = profile?.role === 'beheerder'
  const [tab, setTab] = useState<Tab>('selectie')

  return (
    <div>
      <h1>Beheer</h1>
      <div className="tabs">
        <button className={tab === 'selectie' ? 'is-active' : ''} onClick={() => setTab('selectie')}>Selectie</button>
        <button className={tab === 'trainingen' ? 'is-active' : ''} onClick={() => setTab('trainingen')}>Trainingen</button>
        {admin && (
          <button className={tab === 'gebruikers' ? 'is-active' : ''} onClick={() => setTab('gebruikers')}>Gebruikers</button>
        )}
      </div>
      {tab === 'selectie' && <SquadTab />}
      {tab === 'trainingen' && <TrainingSeriesTab />}
      {tab === 'gebruikers' && admin && <UsersTab />}
    </div>
  )
}

// ---------------------------------------------------------------- Selectie
function SquadTab() {
  const [players, setPlayers] = useState<Player[]>([])
  const [name, setName] = useState('')
  const [shirt, setShirt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('players').select('*').order('active', { ascending: false }).order('name')
    setPlayers((data as Player[] | null) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const res = await rpc('upsert_player', {
      p_id: null,
      p_name: name,
      p_shirt_number: shirt ? Number(shirt) : null,
    })
    if (!res.ok) return setError(reasonText(res.reason))
    setName('')
    setShirt('')
    void load()
  }

  async function save(p: Player) {
    setError(null)
    const res = await rpc('upsert_player', {
      p_id: p.id,
      p_name: p.name,
      p_shirt_number: p.shirt_number,
      p_position: p.position,
      p_active: p.active,
    })
    if (!res.ok) setError(reasonText(res.reason))
    void load()
  }

  return (
    <div className="card">
      <form className="inline-form" onSubmit={add}>
        <input placeholder="Naam speler" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
        <input placeholder="Nr." type="number" min={1} max={99} value={shirt} onChange={(e) => setShirt(e.target.value)} className="input-narrow" />
        <button className="btn btn-primary btn-small">Toevoegen</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr><th>Nr.</th><th>Naam</th><th>Positie</th><th>Actief</th></tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'is-inactive'}>
              <td>{p.shirt_number ?? '–'}</td>
              <td>{p.name}</td>
              <td>
                <select
                  value={p.position ?? ''}
                  onChange={(e) => save({ ...p, position: (e.target.value || null) as Player['position'] })}
                >
                  <option value="">–</option>
                  <option value="keeper">Keeper</option>
                  <option value="verdediger">Verdediger</option>
                  <option value="middenvelder">Middenvelder</option>
                  <option value="aanvaller">Aanvaller</option>
                </select>
              </td>
              <td>
                <input type="checkbox" checked={p.active} onChange={(e) => save({ ...p, active: e.target.checked })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Spelers die vertrekken: vinkje "actief" uit. Zo blijven hun statistieken bewaard.</p>
    </div>
  )
}

// ---------------------------------------------------------------- Trainingen
const WEEKDAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

function TrainingSeriesTab() {
  const [weekday, setWeekday] = useState(2)
  const [time, setTime] = useState('19:30')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [location, setLocation] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    const res = await rpc('create_training_series', {
      p_weekday: weekday,
      p_time: time,
      p_from: from,
      p_to: to,
      p_location: location,
    })
    if (res.ok) setMessage(`${res.created as number} trainingen ingepland.`)
    else setError(reasonText(res.reason))
  }

  return (
    <form className="card form" onSubmit={submit}>
      <p className="muted">Plan een vaste trainingsavond in één keer in. Losse trainingen afgelast? Pas ze daarna aan in de agenda.</p>
      <div className="grid-2">
        <label>
          Dag
          <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
          </select>
        </label>
        <label>
          Tijd
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </label>
        <label>
          Vanaf
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
        </label>
        <label>
          Tot en met
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
        </label>
      </div>
      <label>
        Locatie
        <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={100} />
      </label>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary">Inplannen</button>
    </form>
  )
}

// ---------------------------------------------------------------- Gebruikers
function UsersTab() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [u, p] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('players').select('*').eq('active', true).order('name'),
    ])
    setUsers((u.data as Profile[] | null) ?? [])
    setPlayers((p.data as Player[] | null) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function act(name: string, args: Record<string, unknown>) {
    setError(null)
    const res = await rpc(name, args)
    if (!res.ok) setError(reasonText(res.reason))
    void load()
  }

  return (
    <div className="card">
      <p className="muted small">
        Nieuwe accounts zijn altijd supporter. Maak teamleden <b>speler</b> en koppel ze aan hun naam in de selectie,
        dan kunnen ze zich aan- en afmelden.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Gebruiker</th><th>Rol</th><th>Speler</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me?.id
              return (
                <tr key={u.id} className={u.blocked ? 'is-inactive' : ''}>
                  <td>
                    <div>{u.display_name}</div>
                    <div className="muted small">@{u.username}</div>
                  </td>
                  <td>
                    <select
                      value={u.role}
                      disabled={self}
                      onChange={(e) => act('admin_set_role', { p_user_id: u.id, p_role: e.target.value as Role })}
                    >
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </td>
                  <td>
                    <select
                      value={u.player_id ?? ''}
                      onChange={(e) => act('admin_link_player', { p_user_id: u.id, p_player_id: e.target.value || null })}
                    >
                      <option value="">– geen –</option>
                      {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td>
                    {!self && (
                      <button
                        className={`btn btn-small ${u.blocked ? '' : 'btn-danger'}`}
                        onClick={() => act('admin_set_blocked', { p_user_id: u.id, p_blocked: !u.blocked })}
                      >
                        {u.blocked ? 'Deblokkeren' : 'Blokkeren'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

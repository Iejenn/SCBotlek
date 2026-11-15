import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { reasonText, rpc, supabase } from '../lib/supabase'
import { formatDay, formatTime } from '../lib/format'
import { refreshTeamSettings } from '../lib/teamSettings'
import { isPending, normName, usePendingCount } from '../lib/pendingUsers'
import { ROLE_LABELS, type Player, type Profile, type Role } from '../lib/types'

type Tab = 'selectie' | 'trainingen' | 'sportlink' | 'instellingen' | 'gebruikers'

// Beheer: selectie (staf), trainingsreeks (staf), gebruikers & rollen (beheerder)
export default function ManagePage() {
  const { profile } = useAuth()
  const admin = profile?.role === 'beheerder'
  const [tab, setTab] = useState<Tab>('selectie')
  const pending = usePendingCount(admin)
  // Wachten er nieuwe accounts? Dan direct het tabblad Gebruikers openen
  useEffect(() => {
    if (pending > 0) setTab('gebruikers')
  }, [pending])

  return (
    <div>
      <h1>Beheer</h1>
      <div className="tabs">
        <button className={tab === 'selectie' ? 'is-active' : ''} onClick={() => setTab('selectie')}>Selectie</button>
        <button className={tab === 'trainingen' ? 'is-active' : ''} onClick={() => setTab('trainingen')}>Trainingen</button>
        <button className={tab === 'sportlink' ? 'is-active' : ''} onClick={() => setTab('sportlink')}>Sportlink</button>
        <button className={tab === 'instellingen' ? 'is-active' : ''} onClick={() => setTab('instellingen')}>Instellingen</button>
        {admin && (
          <button className={tab === 'gebruikers' ? 'is-active' : ''} onClick={() => setTab('gebruikers')}>
            Gebruikers{pending > 0 && <span className="tab-count">{pending}</span>}
          </button>
        )}
      </div>
      {tab === 'selectie' && <SquadTab />}
      {tab === 'trainingen' && <TrainingSeriesTab />}
      {tab === 'instellingen' && <SettingsTab />}
      {tab === 'sportlink' && <SyncTab />}
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
  const [busy, setBusy] = useState(false)

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
    // Voorkom per ongeluk dubbele spelers
    const exists = players.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
    if (exists && !confirm(`Er staat al een speler "${name.trim()}" in de selectie. Toch nog een toevoegen?`)) return
    setBusy(true)
    const res = await rpc('upsert_player', {
      p_id: null,
      p_name: name,
      p_shirt_number: shirt ? Number(shirt) : null,
    })
    setBusy(false)
    if (!res.ok) return setError(reasonText(res.reason))
    setName('')
    setShirt('')
    void load()
  }

  async function remove(p: Player) {
    if (!confirm(`Speler "${p.name}" verwijderen?`)) return
    setError(null)
    const res = await rpc('delete_player', { p_id: p.id })
    if (!res.ok) setError(reasonText(res.reason))
    void load()
  }

  async function save(p: Player) {
    setError(null)
    const res = await rpc('upsert_player', {
      p_id: p.id,
      p_name: p.name,
      p_shirt_number: p.shirt_number,
      p_active: p.active,
      p_is_guest: p.is_guest,
    })
    if (!res.ok) setError(reasonText(res.reason))
    void load()
  }

  return (
    <div className="card">
      <form className="inline-form" onSubmit={add}>
        <input placeholder="Naam speler" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
        <input placeholder="Nr." type="number" min={1} max={99} value={shirt} onChange={(e) => setShirt(e.target.value)} className="input-narrow" />
        <button className="btn btn-primary btn-small" disabled={busy}>Toevoegen</button>
      </form>
      {error && <p className="error">{error}</p>}

      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>Nr.</th><th>Naam</th><th className="center">Actief</th><th className="center" title="Leenspeler van een ander team">Leen</th><th></th></tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.id} className={p.active ? '' : 'is-inactive'}>
              {/* Rugnummer en naam direct aanpasbaar; opslaan bij verlaten van het veld of Enter */}
              <td>
                <input
                  key={`nr-${p.id}-${p.shirt_number ?? ''}`}
                  type="number"
                  min={1}
                  max={99}
                  inputMode="numeric"
                  className="input-num"
                  defaultValue={p.shirt_number ?? ''}
                  placeholder="–"
                  aria-label={`Rugnummer ${p.name}`}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    if (v !== p.shirt_number) void save({ ...p, shirt_number: v })
                  }}
                />
              </td>
              <td>
                <input
                  key={`naam-${p.id}-${p.name}`}
                  className="input-name"
                  defaultValue={p.name}
                  maxLength={40}
                  aria-label={`Naam ${p.name}`}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  onBlur={(e) => {
                    const v = e.target.value.trim()
                    if (!v) e.target.value = p.name // lege naam niet opslaan
                    else if (v !== p.name) void save({ ...p, name: v })
                  }}
                />
              </td>
              <td className="center">
                <input
                  type="checkbox"
                  checked={p.active}
                  onChange={(e) => save({ ...p, active: e.target.checked })}
                  aria-label={`${p.name} actief`}
                />
              </td>
              <td className="center">
                <input
                  type="checkbox"
                  checked={p.is_guest}
                  onChange={(e) => save({ ...p, is_guest: e.target.checked })}
                  aria-label={`${p.name} leenspeler`}
                />
              </td>
              <td>
                <button className="btn-icon" onClick={() => remove(p)} title="Verwijderen" aria-label={`${p.name} verwijderen`}>
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="muted small">Rugnummer of naam aanpassen: tik erop, wijzig en tik ernaast. "Leen" = leenspeler van een ander team. Spelers die vertrekken: vinkje "actief" uit, zo blijven hun statistieken bewaard. Verwijderen kan alleen bij
        spelers zonder koppeling, aanmeldingen of statistieken (bijv. per ongeluk dubbel aangemaakt).</p>
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

// ---------------------------------------------------------------- Instellingen
// Teaminstellingen. Nu: maximaal aantal spelers per wedstrijd (daarna wachtlijst).
function SettingsTab() {
  const [limitOn, setLimitOn] = useState(false)
  const [max, setMax] = useState('15')
  const [windowOn, setWindowOn] = useState(false)
  const [days, setDays] = useState('14')
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    refreshTeamSettings().then((v) => {
      setLimitOn(v.maxMatchPlayers !== null)
      if (v.maxMatchPlayers !== null) setMax(String(v.maxMatchPlayers))
      setWindowOn(v.signupOpenDays !== null)
      if (v.signupOpenDays !== null) setDays(String(v.signupOpenDays))
      setLoaded(true)
    })
  }, [])

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setError(null)
    const res = await rpc('set_team_settings', {
      p_max_match_players: limitOn ? Number(max) : null,
      p_signup_open_days: windowOn ? Number(days) : null,
    })
    setBusy(false)
    if (!res.ok) return setError(reasonText(res.reason))
    await refreshTeamSettings()
    const promoted = (res.promoted as number) ?? 0
    setMessage(
      `Opgeslagen.${promoted ? ` ${promoted} speler(s) van de wachtlijst zijn doorgeschoven.` : ''}`,
    )
  }

  if (!loaded) return <p className="muted">Laden…</p>

  return (
    <form className="card form" onSubmit={save}>
      <h2>Wedstrijden</h2>
      <label className="check-row">
        <input type="checkbox" checked={limitOn} onChange={(e) => setLimitOn(e.target.checked)} />
        Maximaal aantal spelers per wedstrijd
      </label>
      {limitOn && (
        <label>
          Aantal plekken
          <input
            type="number"
            min={1}
            max={50}
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="input-narrow-block"
            required
          />
        </label>
      )}
      <p className="muted small">
        Is een wedstrijd vol, dan komt wie daarna op ✓ drukt op de <b>wachtlijst</b>, op volgorde van aanmelden.
        Meldt iemand zich af, dan schuift de eerste van de wachtlijst automatisch door. Verlaag je het aantal,
        dan houdt wie al een plek heeft die. Trainingen hebben geen limiet.
      </p>

      <label className="check-row">
        <input type="checkbox" checked={windowOn} onChange={(e) => setWindowOn(e.target.checked)} />
        Aanmelden pas kort van tevoren
      </label>
      {windowOn && (
        <label>
          Aantal dagen voor de wedstrijd
          <input
            type="number"
            min={1}
            max={60}
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="input-narrow-block"
            required
          />
        </label>
      )}
      <p className="muted small">
        Bijvoorbeeld 14: voor een wedstrijd op zaterdag 14:45 kan je je pas aanmelden (✓) vanaf zaterdag twee weken
        eerder om 14:45. Zo heeft iedereen, ook wie in ploegendienst werkt, een eerlijke kans op een plek. Afmelden (✕)
        en "misschien" kunnen altijd. Wie zich al eerder had aangemeld, houdt die plek.
      </p>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? 'Opslaan…' : 'Opslaan'}</button>
    </form>
  )
}

// ---------------------------------------------------------------- Sportlink
type SyncRun = { id: number; ran_at: string; ok: boolean; imported: number | null; message: string | null }

// Wedstrijden komen elke 3 uur automatisch binnen; hier zie je het logboek
// en kun je handmatig bijwerken (bijv. direct na een verplaatste wedstrijd).
function SyncTab() {
  const [runs, setRuns] = useState<SyncRun[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data } = await supabase.from('sync_runs').select('*').order('ran_at', { ascending: false }).limit(10)
    setRuns((data as SyncRun[] | null) ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function syncNow() {
    setBusy(true)
    setMessage(null)
    setError(null)
    const res = await rpc('sync_now', {})
    setBusy(false)
    if (res.ok) setMessage(`Bijgewerkt: ${res.changed as number} wedstrijd(en) gewijzigd.`)
    else setError(reasonText(res.reason))
    void load()
  }

  return (
    <div className="card">
      <p className="muted">
        Het programma en de uitslagen van SC Botlek 7 komen automatisch uit Sportlink (dezelfde bron als voetbal.nl),
        elke 3 uur.
      </p>
      <button className="btn btn-primary btn-small" onClick={syncNow} disabled={busy}>
        {busy ? 'Bezig…' : 'Nu bijwerken'}
      </button>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <h3>Logboek</h3>
      {runs.length === 0 ? (
        <p className="muted small">Nog geen runs.</p>
      ) : (
        <table className="table">
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{formatDay(r.ran_at)} {formatTime(r.ran_at)}</td>
                <td>{r.ok ? '✓' : '✕'}</td>
                <td className="small">
                  {r.ok ? `${r.imported ?? 0} gewijzigd · ` : ''}
                  {r.message}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Gebruikers
function UsersTab() {
  const { profile: me } = useAuth()
  const [users, setUsers] = useState<Profile[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  // Koppel een account aan een speler. Met "__new__" maken we eerst een speler
  // aan met de naam van het account, zodat dat in één stap gaat.
  async function linkPlayer(u: Profile, value: string) {
    if (busy) return // voorkomt dubbel aanmaken bij snel twee keer kiezen
    setBusy(true)
    setError(null)
    let playerId: string | null = value || null
    if (value === '__new__') {
      // Staat er al een ongekoppelde speler met deze naam? Dan die gebruiken i.p.v. een dubbele maken
      const linked = new Set(users.map((x) => x.player_id).filter(Boolean))
      const same = players.find(
        (p) => !linked.has(p.id) && p.name.trim().toLowerCase() === u.display_name.trim().toLowerCase(),
      )
      if (same) {
        playerId = same.id
      } else {
        const created = await rpc('upsert_player', { p_id: null, p_name: u.display_name })
        if (!created.ok) {
          setError(reasonText(created.reason))
          setBusy(false)
          return
        }
        playerId = created.id as string
      }
    }
    const res = await rpc('admin_link_player', { p_user_id: u.id, p_player_id: playerId })
    if (!res.ok) {
      setError(reasonText(res.reason))
    } else if (playerId && u.role === 'supporter' && u.id !== me?.id) {
      // Een gekoppelde supporter kan zich niet aanmelden; maak er meteen een speler van
      const promoted = await rpc('admin_set_role', { p_user_id: u.id, p_role: 'speler' })
      if (!promoted.ok) setError(reasonText(promoted.reason))
    }
    await load()
    setBusy(false)
  }

  // Spelers die al aan een (ander) account hangen, niet nog eens aanbieden
  const linkedIds = new Set(users.map((x) => x.player_id).filter(Boolean) as string[])
  const freePlayers = players.filter((p) => !linkedIds.has(p.id))
  const pendingUsers = users.filter(isPending)
  // Beste gok voor een account: zelfde naam, anders zelfde voornaam
  const suggestFor = (u: Profile): Player | undefined => {
    const n = normName(u.display_name)
    return (
      freePlayers.find((p) => normName(p.name) === n) ??
      freePlayers.find((p) => normName(p.name).split(' ')[0] === n.split(' ')[0])
    )
  }

  return (
    <>
    {pendingUsers.length > 0 && (
      <div className="card pending-card">
        <h2>Nog te koppelen ({pendingUsers.length})</h2>
        <p className="muted small">
          Nieuwe accounts. Koppel ze aan hun naam in de selectie; ze worden dan automatisch speler en kunnen zich
          aanmelden. Is het een supporter (geen speler)? Laat dan staan; je kunt dit blok negeren.
        </p>
        <ul className="pending-list">
          {pendingUsers.map((u) => {
            const s = suggestFor(u)
            return (
              <li key={u.id}>
                <div>
                  <b>{u.display_name}</b> <span className="muted small">@{u.username}</span>
                </div>
                <div className="pending-actions">
                  {s && (
                    <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void linkPlayer(u, s.id)}>
                      Koppel aan {s.name}
                    </button>
                  )}
                  <select value="" disabled={busy} onChange={(e) => void linkPlayer(u, e.target.value)} aria-label={`Koppel ${u.display_name}`}>
                    <option value="">{s ? 'Andere speler…' : 'Kies speler…'}</option>
                    {freePlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value="__new__">+ Nieuwe speler: {u.display_name}</option>
                  </select>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )}
    <div className="card">
      <h2>Alle accounts</h2>
      <p className="muted small">
        Nieuwe accounts zijn altijd supporter. Maak teamleden <b>speler</b> en koppel ze aan hun naam in de selectie,
        dan kunnen ze zich aan- en afmelden. Staat iemand nog niet in de selectie? Kies
        <b> "+ Nieuwe speler"</b>: dan wordt de speler aangemaakt, gekoppeld en (als het een supporter was) speler gemaakt.
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
                      disabled={busy}
                      onChange={(e) => void linkPlayer(u, e.target.value)}
                    >
                      <option value="">– geen –</option>
                      {!u.player_id && <option value="__new__">+ Nieuwe speler: {u.display_name}</option>}
                      {/* eigen speler + spelers die nog niet aan een ander account hangen */}
                      {players
                        .filter((p) => p.id === u.player_id || !linkedIds.has(p.id))
                        .map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
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
    </>
  )
}

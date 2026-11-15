import { useState } from 'react'
import { reasonText, rpc } from '../lib/supabase'
import type { AttendanceStatus } from '../lib/types'

const OPTIONS: { value: Exclude<AttendanceStatus, 'wachtlijst'>; label: string }[] = [
  { value: 'aanwezig', label: '✓ Ik kom' },
  { value: 'misschien', label: '? Misschien' },
  { value: 'afwezig', label: '✕ Kan niet' },
]

type Props = {
  eventId: string
  current: AttendanceStatus | undefined
  playerId?: string // alleen meegeven als staf voor iemand anders invult
  compact?: boolean
  // status zoals de server hem heeft vastgelegd (kan 'wachtlijst' zijn als de wedstrijd vol is)
  onChange: (status: AttendanceStatus) => void
}

// Drie knoppen om aanwezigheid door te geven. Schrijft via de set_attendance RPC.
export default function AttendanceButtons({ eventId, current, playerId, compact, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function choose(status: AttendanceStatus) {
    setBusy(true)
    setError(null)
    setInfo(null)
    const res = await rpc('set_attendance', {
      p_event_id: eventId,
      p_status: status,
      ...(playerId ? { p_player_id: playerId } : {}),
    })
    setBusy(false)
    if (!res.ok) return setError(reasonText(res.reason))
    const final = (res.status as AttendanceStatus) ?? status
    if (final === 'wachtlijst' && !compact) {
      setInfo(`De wedstrijd zit vol. Je staat op de wachtlijst${res.position ? ` (plek ${res.position as number})` : ''}; je schuift automatisch door als er iemand afmeldt.`)
    }
    onChange(final)
  }

  const waiting = current === 'wachtlijst'

  return (
    <div>
      <div className={`att-buttons ${compact ? 'att-compact' : ''}`}>
        {OPTIONS.map((o) => {
          // Op de wachtlijst: de ✓-knop toont dat in plaats van "Ik kom"
          const isWaitBtn = o.value === 'aanwezig' && waiting
          const label = isWaitBtn ? '⏳ Wachtlijst' : o.label
          return (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              className={`att-btn att-${isWaitBtn ? 'wachtlijst' : o.value} ${current === o.value || isWaitBtn ? 'is-active' : ''}`}
              onClick={(e) => {
                e.preventDefault() // knop staat soms in een link-kaart
                void choose(o.value)
              }}
            >
              {compact ? label.split(' ')[0] : label}
            </button>
          )
        })}
      </div>
      {info && <p className="notice small">{info}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

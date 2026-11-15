import { useState } from 'react'
import { reasonText, rpc } from '../lib/supabase'
import type { AttendanceStatus } from '../lib/types'

const OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: 'aanwezig', label: '✓ Ik kom' },
  { value: 'misschien', label: '? Misschien' },
  { value: 'afwezig', label: '✕ Kan niet' },
]

type Props = {
  eventId: string
  current: AttendanceStatus | undefined
  playerId?: string // alleen meegeven als staf voor iemand anders invult
  compact?: boolean
  onChange: (status: AttendanceStatus) => void
}

// Drie knoppen om aanwezigheid door te geven. Schrijft via de set_attendance RPC.
export default function AttendanceButtons({ eventId, current, playerId, compact, onChange }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(status: AttendanceStatus) {
    setBusy(true)
    setError(null)
    const res = await rpc('set_attendance', {
      p_event_id: eventId,
      p_status: status,
      ...(playerId ? { p_player_id: playerId } : {}),
    })
    setBusy(false)
    if (res.ok) onChange(status)
    else setError(reasonText(res.reason))
  }

  return (
    <div>
      <div className={`att-buttons ${compact ? 'att-compact' : ''}`}>
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={busy}
            className={`att-btn att-${o.value} ${current === o.value ? 'is-active' : ''}`}
            onClick={(e) => {
              e.preventDefault() // knop staat soms in een link-kaart
              void choose(o.value)
            }}
          >
            {compact ? o.label.split(' ')[0] : o.label}
          </button>
        ))}
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}

import type { TeamEvent } from '../lib/types'

// Kleine weergave-onderdelen die op meerdere pagina's terugkomen

export function EventTitle({ ev }: { ev: TeamEvent }) {
  if (ev.kind === 'training') return <span>Training</span>
  // Thuis: Botlek eerst, uit: tegenstander eerst (zoals op voetbal.nl)
  return ev.is_home === false ? (
    <span>{ev.opponent} – <b>SC Botlek</b></span>
  ) : (
    <span><b>SC Botlek</b> – {ev.opponent}</span>
  )
}

export function Score({ ev }: { ev: TeamEvent }) {
  const us = ev.score_us ?? 0
  const them = ev.score_them ?? 0
  const result = us > them ? 'win' : us < them ? 'loss' : 'draw'
  const [left, right] = ev.is_home === false ? [them, us] : [us, them]
  return <div className={`score score-${result}`}>{left} – {right}</div>
}

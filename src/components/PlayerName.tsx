import type { Player } from '../lib/types'

// Rugnummer + naam, met een "Leen"-label voor leenspelers
export default function PlayerName({ player }: { player: Player }) {
  return (
    <>
      {player.shirt_number && <span className="shirt">{player.shirt_number}</span>}
      {player.name}
      {player.position === 'leenspeler' && <span className="badge badge-guest">Leen</span>}
    </>
  )
}

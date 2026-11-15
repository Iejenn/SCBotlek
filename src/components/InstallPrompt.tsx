import { useEffect, useState } from 'react'

// Pop-up om de site als app op het beginscherm te zetten.
// * Android/Chrome: de browser geeft een "beforeinstallprompt"-event; wij tonen
//   een eigen knop die de echte installatie start.
// * iPhone/iPad: Safari heeft geen installatieknop, dus we tonen uitleg
//   (Deel-knop → "Zet op beginscherm").
// Niet tonen als de app al geïnstalleerd is, of als iemand "Later" koos (14 dagen).

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

const KEY = 'scb-install-dismissed'
const SNOOZE_DAYS = 14

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS doet zich voor als Mac, maar heeft wel een touchscreen
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function snoozed(): boolean {
  try {
    const t = Number(localStorage.getItem(KEY) ?? 0)
    return Date.now() - t < SNOOZE_DAYS * 24 * 3600_000
  } catch {
    return false
  }
}

export default function InstallPrompt() {
  const [androidEvent, setAndroidEvent] = useState<InstallEvent | null>(null)
  const [showIos, setShowIos] = useState(false)
  const [hidden, setHidden] = useState(() => isStandalone() || snoozed())

  useEffect(() => {
    if (hidden) return
    const onPrompt = (e: Event) => {
      e.preventDefault() // eigen pop-up i.p.v. de standaard browserbalk
      setAndroidEvent(e as InstallEvent)
    }
    const onInstalled = () => setHidden(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    // iPhone: even wachten zodat de pop-up niet meteen over het inloggen valt
    const t = isIos() ? window.setTimeout(() => setShowIos(true), 1500) : undefined
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      if (t) window.clearTimeout(t)
    }
  }, [hidden])

  function later() {
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      /* privémodus: dan gewoon alleen voor nu verbergen */
    }
    setHidden(true)
  }

  async function install() {
    if (!androidEvent) return
    await androidEvent.prompt()
    const { outcome } = await androidEvent.userChoice
    if (outcome === 'accepted') setHidden(true)
    else later()
  }

  if (hidden || (!androidEvent && !showIos)) return null

  return (
    <div className="install-sheet" role="dialog" aria-labelledby="install-title">
      <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" className="install-icon" />
      <div className="install-body">
        <h2 id="install-title">Zet SC Botlek op je telefoon</h2>
        {androidEvent ? (
          <p>Installeer de app op je beginscherm: sneller openen, net als een gewone app.</p>
        ) : (
          <ol className="install-steps">
            <li>
              Tik onderin op <b>Deel</b> <ShareIcon />
            </li>
            <li>
              Kies <b>Zet op beginscherm</b> <span aria-hidden="true">➕</span>
            </li>
            <li>
              Tik rechtsboven op <b>Voeg toe</b>
            </li>
          </ol>
        )}
        <div className="install-actions">
          {androidEvent && (
            <button className="btn btn-primary btn-small" onClick={() => void install()}>
              Installeren
            </button>
          )}
          <button className="btn btn-small" onClick={later}>
            {androidEvent ? 'Later' : 'Begrepen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Het "Deel"-icoon van Safari (vierkant met pijl omhoog)
function ShareIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" width="18" height="18" aria-label="Deel-icoon">
      <path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11v9h12v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

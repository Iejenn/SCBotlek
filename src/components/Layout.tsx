import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS, isStaff } from '../lib/types'
import { usePendingCount } from '../lib/pendingUsers'

export default function Layout({ children }: { children: ReactNode }) {
  const { session, profile, signOut } = useAuth()
  const pending = usePendingCount(profile?.role === 'beheerder')

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="" className="brand-logo" />
            <span>SC Botlek</span>
          </NavLink>
          <nav className="nav">
            {/* Ingelogd: agenda op "/"; bezoekers: "/" is de startpagina */}
            {session ? <NavLink to="/" end>Agenda</NavLink> : <NavLink to="/agenda">Agenda</NavLink>}
            <NavLink to="/statistieken">Statistieken</NavLink>
            {isStaff(profile?.role) && (
              <NavLink to="/beheer">
                Beheer
                {pending > 0 && <span className="nav-dot" aria-label={`${pending} nieuwe accounts`} />}
              </NavLink>
            )}
          </nav>
          <div className="user">
            {profile && (
              <span className="user-name">
                {profile.display_name}
                <span className="role-tag">{ROLE_LABELS[profile.role]}</span>
              </span>
            )}
            {session ? (
              <button className="btn btn-ghost btn-small" onClick={signOut}>Uitloggen</button>
            ) : (
              <Link to="/inloggen" className="btn btn-ghost btn-small">Inloggen</Link>
            )}
          </div>
        </div>
        {/* rood-blauwe band uit het clublogo */}
        <div className="club-stripe" aria-hidden="true">
          <span className="stripe-red" />
          <span className="stripe-blue" />
        </div>
      </header>
      <main className="content">{children}</main>
    </div>
  )
}

import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ROLE_LABELS, isStaff } from '../lib/types'

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="" className="brand-logo" />
            <span>SC Botlek</span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>Agenda</NavLink>
            <NavLink to="/statistieken">Statistieken</NavLink>
            {isStaff(profile?.role) && <NavLink to="/beheer">Beheer</NavLink>}
          </nav>
          <div className="user">
            {profile && (
              <span className="user-name">
                {profile.display_name}
                <span className="role-tag">{ROLE_LABELS[profile.role]}</span>
              </span>
            )}
            <button className="btn btn-ghost btn-small" onClick={signOut}>Uitloggen</button>
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

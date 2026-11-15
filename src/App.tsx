import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { supabaseConfigured } from './lib/supabase'
import { isStaff } from './lib/types'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import AgendaPage from './pages/AgendaPage'
import EventPage from './pages/EventPage'
import EventFormPage from './pages/EventFormPage'
import ManagePage from './pages/ManagePage'
import StatsPage from './pages/StatsPage'

export default function App() {
  const { session, profile, loading, signOut } = useAuth()

  if (!supabaseConfigured) {
    return (
      <div className="center-screen">
        <div className="card">
          <h2>Nog niet gekoppeld</h2>
          <p>Maak een bestand <code>.env.local</code> aan met de Supabase-gegevens (zie <code>.env.example</code>).</p>
        </div>
      </div>
    )
  }

  if (loading) return <div className="center-screen muted">Laden…</div>
  if (!session) return <LoginPage />

  if (profile?.blocked) {
    return (
      <div className="center-screen">
        <div className="card">
          <h2>Account geblokkeerd</h2>
          <p>Neem contact op met de beheerder van het team.</p>
          <button className="btn" onClick={signOut}>Uitloggen</button>
        </div>
      </div>
    )
  }

  const staff = isStaff(profile?.role)

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<AgendaPage />} />
        <Route path="/activiteit/:id" element={<EventPage />} />
        <Route path="/statistieken" element={<StatsPage />} />
        {/* Beheerpagina's alleen tonen aan staf; de database checkt het nogmaals */}
        {staff && <Route path="/activiteit/nieuw" element={<EventFormPage />} />}
        {staff && <Route path="/activiteit/:id/bewerken" element={<EventFormPage />} />}
        {staff && <Route path="/beheer" element={<ManagePage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

import { useState, type FormEvent } from 'react'
import { supabase, usernameToEmail, USERNAME_PATTERN } from '../lib/supabase'

// Inloggen of registreren met gebruikersnaam + wachtwoord.
// Nieuwe accounts zijn altijd "supporter"; de beheerder wijst rollen toe.
export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const name = username.trim().toLowerCase()

    if (!USERNAME_PATTERN.test(name)) {
      setError('Gebruikersnaam: 3–20 tekens, alleen kleine letters, cijfers en _.')
      return
    }
    if (password.length < 8) {
      setError('Wachtwoord moet minimaal 8 tekens zijn.')
      return
    }

    setBusy(true)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(name),
        password,
      })
      if (error) setError('Gebruikersnaam of wachtwoord klopt niet.')
    } else {
      const { error } = await supabase.auth.signUp({
        email: usernameToEmail(name),
        password,
        // username + weergavenaam gaan mee; de database-trigger maakt het profiel
        options: { data: { username: name, display_name: displayName.trim() || name } },
      })
      if (error) {
        setError(
          error.message.toLowerCase().includes('already')
            ? 'Deze gebruikersnaam is al in gebruik.'
            : 'Registreren mislukt. Probeer een andere gebruikersnaam.',
        )
      }
    }
    setBusy(false)
  }

  return (
    <div className="center-screen login-bg">
      <form className="card login-card" onSubmit={handleSubmit}>
        <img src={`${import.meta.env.BASE_URL}logo.jpg`} alt="SC Botlek" className="login-logo" />
        <h1>SC Botlek</h1>
        <p className="muted">{mode === 'login' ? 'Log in om verder te gaan' : 'Maak een account aan'}</p>

        <label>
          Gebruikersnaam
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            required
          />
        </label>

        {mode === 'register' && (
          <label>
            Naam (zichtbaar voor het team)
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              placeholder="bijv. Jan de Vries"
            />
          </label>
        )}

        <label>
          Wachtwoord
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Even geduld…' : mode === 'login' ? 'Inloggen' : 'Registreren'}
        </button>

        <button
          type="button"
          className="btn btn-link"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? 'Nog geen account? Registreer' : 'Al een account? Log in'}
        </button>
      </form>
    </div>
  )
}

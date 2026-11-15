import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './styles.css'
import App from './App.tsx'
import { AuthProvider } from './lib/auth.tsx'
import InstallPrompt from './components/InstallPrompt.tsx'

// Service worker: maakt de site installeerbaar als app (Android)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <App />
        <InstallPrompt />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dark mode follows the system setting; the tokens live under `.dark` in index.css.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')
const syncTheme = () => document.documentElement.classList.toggle('dark', prefersDark.matches)
syncTheme()
prefersDark.addEventListener('change', syncTheme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

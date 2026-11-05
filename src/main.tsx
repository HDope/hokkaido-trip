import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { useStore } from './store'

if (import.meta.env.DEV) (window as unknown as { __hk: typeof useStore }).__hk = useStore

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

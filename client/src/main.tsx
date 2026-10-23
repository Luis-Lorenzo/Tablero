import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const raiz = createRoot(document.getElementById('root')!)
const parametros = new URLSearchParams(window.location.search)

// La preview de la sala (Fase 0) solo existe en desarrollo: `?preview=1`.
// En producción el import dinámico se elimina y no viaja en el bundle.
if (import.meta.env.DEV && parametros.get('preview') === '1') {
  void import('./preview/PreviewApp.tsx').then(({ default: PreviewApp }) => {
    raiz.render(
      <StrictMode>
        <PreviewApp />
      </StrictMode>,
    )
  })
} else {
  raiz.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

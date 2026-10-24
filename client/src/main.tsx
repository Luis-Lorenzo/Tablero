import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const raiz = createRoot(document.getElementById('root')!)
const parametros = new URLSearchParams(window.location.search)

// La preview de la sala (Fase 0) se abre con `?preview=1`.
// Se deja disponible también en producción para poder enseñar la demo desde
// Render. Al ser un import dinámico solo se descarga esa pantalla cuando se
// pide; el resto de la app sigue cargando igual.
if (parametros.get('preview') === '1') {
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

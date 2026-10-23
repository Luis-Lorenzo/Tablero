interface MapaProps {
  onVolver: () => void;
}

/**
 * Página del mapa (fase 1). De momento es el papel en blanco: el máster podrá
 * colgar aquí su mapa sin que la sala 3D lo deforme.
 */
export function Mapa({ onVolver }: MapaProps) {
  return (
    <div className="mapa-page">
      <div className="mapa-papel" aria-hidden="true" />

      <div className="pizarra-barra">
        <button type="button" className="pizarra-btn" onClick={onVolver}>
          ← Volver a la sala
        </button>

        <span className="pizarra-titulo">Mapa</span>

        <span className="mapa-etiqueta">fase 1</span>
      </div>

      <div className="mapa-lienzo">
        <p className="mapa-vacio">Aquí se cargará el mapa</p>
      </div>
    </div>
  );
}

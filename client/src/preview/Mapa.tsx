import { ArrowLeft, Map as MapIcon } from "lucide-react";

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
          <ArrowLeft size={14} aria-hidden="true" />
          <span>Volver</span>
        </button>
      </div>

      <div className="mapa-lienzo">
        <p className="mapa-vacio">
          <MapIcon size={18} aria-hidden="true" />
          <span>Aquí se cargará el mapa</span>
        </p>
      </div>
    </div>
  );
}

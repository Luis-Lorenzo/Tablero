import { DadoPixelD6, DadoPixelPoliedro } from "./Dado";
import { LogoPocketRol } from "./LogoPocketRol";

interface PanelDerechoProps {
  onLogoClick: () => void;
}

/**
 * Panel lateral derecho: logotipo grande retro pixel 3D blanco "POCKET ROL"
 * acompañado de dados d6 blancos cuadrados y dados poliédricos de colores
 * (d4, d8, d12, d20) en estilo pixel art.
 */
export function PanelDerecho({ onLogoClick }: PanelDerechoProps) {
  return (
    <aside className="panel-lateral panel-derecho" aria-label="Emblema Pocket Rol">
      <div className="panel-caja panel-emblema">
        {/* Fila superior: dados blancos cuadrados d6 */}
        <div className="dados-pixel-fila dados-blancos" aria-hidden="true">
          <DadoPixelD6 cara={3} clase="rot-izq" />
          <DadoPixelD6 cara={6} clase="rot-centro" />
          <DadoPixelD6 cara={5} clase="rot-der" />
        </div>

        {/* Logo grande retro pixel 3D */}
        <div className="panel-logo-wrap">
          <LogoPocketRol variante="panel" onClick={onLogoClick} />
        </div>

        {/* Fila inferior: dados poliédricos de colores */}
        <div className="dados-pixel-fila dados-colores" aria-hidden="true">
          <DadoPixelPoliedro tipo="d4" clase="rot-izq" />
          <DadoPixelPoliedro tipo="d8" clase="rot-suave" />
          <DadoPixelPoliedro tipo="d20" clase="destacado" />
          <DadoPixelPoliedro tipo="d12" clase="rot-der" />
        </div>

        <p className="emblema-subtitulo">MESA DE ROL ONLINE</p>
      </div>
    </aside>
  );
}

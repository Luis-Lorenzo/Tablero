import { DadoPixelD6, DadoPixelPoliedro } from "./Dado";
import { LogoPocketRol } from "./LogoPocketRol";

interface PanelDerechoProps {
  onLogoClick: () => void;
}

/**
 * Escena decorativa pixel art (hoguera animada, espada clavada, pergamino y jarra)
 * para equilibrar visualmente el panel derecho.
 */
function EscenaPixelRPG() {
  return (
    <div className="escena-pixel-caja" aria-hidden="true">
      <svg
        viewBox="0 0 96 52"
        className="escena-pixel-svg"
        shapeRendering="crispEdges"
      >
        {/* Suelo empedrado */}
        <rect x="0" y="42" width="96" height="10" fill="#1b1429" />
        <rect x="4" y="44" width="14" height="3" fill="#2a2040" />
        <rect x="26" y="46" width="18" height="3" fill="#2a2040" />
        <rect x="54" y="44" width="16" height="3" fill="#2a2040" />
        <rect x="76" y="46" width="14" height="3" fill="#2a2040" />

        {/* Espada pixelada clavada a la izquierda */}
        <g>
          <rect x="15" y="14" width="4" height="2" fill="#d8a838" />
          <rect x="16" y="10" width="2" height="4" fill="#6b3e26" />
          <rect x="13" y="16" width="8" height="2" fill="#f5d57a" />
          <rect x="16" y="18" width="2" height="24" fill="#d9e4f5" />
          <rect x="17" y="18" width="1" height="24" fill="#8ea3c7" />
        </g>

        {/* Hoguera central con llamas animadas */}
        <g>
          {/* Troncos */}
          <rect x="38" y="38" width="20" height="4" fill="#5c351e" />
          <rect x="40" y="36" width="16" height="3" fill="#7a4728" />
          {/* Piedras */}
          <rect x="36" y="40" width="4" height="3" fill="#6d6482" />
          <rect x="56" y="40" width="4" height="3" fill="#6d6482" />
          {/* Llama exterior naranja */}
          <g className="llama-exterior">
            <rect x="42" y="24" width="12" height="12" fill="#f26b29" />
            <rect x="44" y="20" width="8" height="4" fill="#f26b29" />
            <rect x="46" y="17" width="4" height="3" fill="#ff9642" />
          </g>
          {/* Llama interior amarilla */}
          <g className="llama-interior">
            <rect x="44" y="28" width="8" height="8" fill="#ffd84d" />
            <rect x="46" y="24" width="4" height="4" fill="#fff59e" />
          </g>
          {/* Chispas */}
          <rect x="43" y="13" width="2" height="2" fill="#ffd84d" className="chispa-1" />
          <rect x="51" y="11" width="2" height="2" fill="#ff9642" className="chispa-2" />
        </g>

        {/* Pergamino y jarra a la derecha */}
        <g>
          {/* Pergamino */}
          <rect x="66" y="34" width="12" height="8" fill="#f0dfb8" />
          <rect x="65" y="33" width="2" height="10" fill="#c9a86b" />
          <rect x="77" y="33" width="2" height="10" fill="#c9a86b" />
          <rect x="68" y="36" width="7" height="1" fill="#8c6d46" />
          <rect x="68" y="38" width="5" height="1" fill="#8c6d46" />
          {/* Jarra de taberna */}
          <rect x="82" y="33" width="7" height="9" fill="#9e6434" />
          <rect x="89" y="35" width="2" height="5" fill="#734520" />
          <rect x="82" y="31" width="7" height="2" fill="#fff8e8" />
        </g>
      </svg>

      <div className="escena-pixel-barra">
        <span>READY TO ROLL</span>
        <span className="escena-pixel-sep">•</span>
        <span>MAX 6 JUGADORES</span>
      </div>
    </div>
  );
}

/**
 * Panel lateral derecho: logotipo grande retro pixel 3D blanco "POCKET ROL"
 * acompañado de dados d6 blancos cuadrados, dados poliédricos de colores
 * (d4, d8, d12, d20) y una escena pixel art RPG en la parte inferior.
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

        <EscenaPixelRPG />
      </div>
    </aside>
  );
}

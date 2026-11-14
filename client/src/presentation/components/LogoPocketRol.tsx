import { useId } from "react";

interface LogoPocketRolProps {
  onClick?: () => void;
  clickable?: boolean;
  variante?: "panel" | "banner";
}

const EXTRUSION_CAPAS = [
  { dx: 10, dy: 12, color: "#120b20" },
  { dx: 8.5, dy: 10, color: "#23153d" },
  { dx: 7, dy: 8.2, color: "#36205c" },
  { dx: 5.5, dy: 6.4, color: "#4b2d7d" },
  { dx: 4, dy: 4.6, color: "#623d9e" },
  { dx: 2.5, dy: 2.8, color: "#7f58bd" },
  { dx: 1.2, dy: 1.4, color: "#b6a2db" }
];

/**
 * Logotipo "POCKET ROL" en estilo retro pixel 3D: letras rectas, gruesas y
 * blancas con extrusión de profundidad en perspectiva.
 */
export function LogoPocketRol({
  onClick,
  clickable = true,
  variante = "panel"
}: LogoPocketRolProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradId = `pixel-face-${uid}`;
  const esPanel = variante === "panel";

  const viewBox = esPanel ? "0 0 280 128" : "0 0 420 76";

  const contenido = (
    <svg
      viewBox={viewBox}
      role="img"
      aria-label="POCKET ROL"
      className={`logo-pixel-svg ${variante}`}
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="68%" stopColor="#f2eef9" />
          <stop offset="100%" stopColor="#d4cbe6" />
        </linearGradient>
      </defs>

      {esPanel ? (
        <g transform="skewY(-5)">
          {EXTRUSION_CAPAS.map((capa, idx) => (
            <g key={idx} transform={`translate(${capa.dx}, ${capa.dy})`}>
              <text
                x="134"
                y="54"
                textAnchor="middle"
                className="logo-pixel-texto panel-linea-1"
                fill={capa.color}
              >
                POCKET
              </text>
              <text
                x="134"
                y="108"
                textAnchor="middle"
                className="logo-pixel-texto panel-linea-2"
                fill={capa.color}
              >
                ROL
              </text>
            </g>
          ))}

          <text
            x="134"
            y="54"
            textAnchor="middle"
            className="logo-pixel-texto panel-linea-1 logo-pixel-cara"
            fill={`url(#${gradId})`}
          >
            POCKET
          </text>
          <text
            x="134"
            y="108"
            textAnchor="middle"
            className="logo-pixel-texto panel-linea-2 logo-pixel-cara"
            fill={`url(#${gradId})`}
          >
            ROL
          </text>
        </g>
      ) : (
        <g transform="skewY(-2.5)">
          {EXTRUSION_CAPAS.map((capa, idx) => (
            <text
              key={idx}
              x="204"
              y="52"
              textAnchor="middle"
              className="logo-pixel-texto banner-linea"
              fill={capa.color}
              transform={`translate(${capa.dx * 0.75}, ${capa.dy * 0.75})`}
            >
              POCKET ROL
            </text>
          ))}
          <text
            x="204"
            y="52"
            textAnchor="middle"
            className="logo-pixel-texto banner-linea logo-pixel-cara"
            fill={`url(#${gradId})`}
          >
            POCKET ROL
          </text>
        </g>
      )}
    </svg>
  );

  if (!clickable || !onClick) {
    return <div className={`logo-pixel ${variante} estatico`}>{contenido}</div>;
  }

  return (
    <button
      type="button"
      className={`logo-pixel ${variante}`}
      onClick={onClick}
      title="Ir a la recepción"
      aria-label="Ir a la recepción"
    >
      {contenido}
    </button>
  );
}

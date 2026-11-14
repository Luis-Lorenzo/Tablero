import { useId } from "react";

interface LogoPocketRolProps {
  onClick?: () => void;
  clickable?: boolean;
}

/**
 * Logotipo "POCKET ROL" con el arco de los rótulos clásicos de mesa/casino,
 * acabado dorado metálico y ornamento inferior. Si es clickable, vuelve a la recepción.
 */
export function LogoPocketRol({ onClick, clickable = true }: LogoPocketRolProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const arco = `arco-${uid}`;
  const oro = `oro-${uid}`;
  const sombra = `sombra-${uid}`;

  const contenido = (
    <svg viewBox="0 0 360 104" role="img" aria-label="POCKET ROL">
      <defs>
        <path id={arco} d="M 18 82 Q 180 6 342 82" fill="none" />
        <linearGradient id={oro} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff9e8" />
          <stop offset="48%" stopColor="#f5d57a" />
          <stop offset="100%" stopColor="#c4942a" />
        </linearGradient>
        <filter id={sombra} x="-10%" y="-15%" width="120%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#09070f" floodOpacity="0.75" />
        </filter>
      </defs>

      <text
        className="logo-poker-texto"
        fill={`url(#${oro})`}
        filter={`url(#${sombra})`}
        textAnchor="middle"
      >
        <textPath href={`#${arco}`} startOffset="50%">
          POCKET ROL
        </textPath>
      </text>

      {/* Ornamento inferior sutil */}
      <g className="logo-ornamento" opacity="0.85">
        <line x1="92" y1="88" x2="164" y2="88" stroke={`url(#${oro})`} strokeWidth="1.2" strokeLinecap="round" />
        <polygon points="180,82 186,88 180,94 174,88" fill={`url(#${oro})`} />
        <line x1="196" y1="88" x2="268" y2="88" stroke={`url(#${oro})`} strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );

  if (!clickable || !onClick) {
    return <div className="logo-poker estatico">{contenido}</div>;
  }

  return (
    <button
      type="button"
      className="logo-poker"
      onClick={onClick}
      title="Ir a la recepción"
      aria-label="Ir a la recepción"
    >
      {contenido}
    </button>
  );
}

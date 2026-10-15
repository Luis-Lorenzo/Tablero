import { useId } from "react";

interface LogoPocketRolProps {
  onClick?: () => void;
}

/**
 * Logotipo "POCKET ROL" con el arco de los rótulos de casino (Las Vegas / póker)
 * y tipografía de fantasía, todo en mayúsculas. El botón vuelve a la recepción.
 */
export function LogoPocketRol({ onClick }: LogoPocketRolProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const arco = `arco-${uid}`;
  const oro = `oro-${uid}`;

  return (
    <button
      type="button"
      className="logo-poker"
      onClick={onClick}
      title="Ir a la recepción"
      aria-label="Ir a la recepción"
    >
      <svg viewBox="0 0 340 92" role="img" aria-label="POCKET ROL">
        <defs>
          <path id={arco} d="M 16 76 Q 170 4 324 76" fill="none" />
          <linearGradient id={oro} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="55%" stopColor="#f7f4ff" />
            <stop offset="100%" stopColor="#d9d2ea" />
          </linearGradient>
        </defs>

        <text className="logo-poker-texto" fill={`url(#${oro})`} textAnchor="middle">
          <textPath href={`#${arco}`} startOffset="50%">
            POCKET ROL
          </textPath>
        </text>
      </svg>
    </button>
  );
}

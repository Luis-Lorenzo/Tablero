import { useId } from "react";

/**
 * Dado decorativo con acabado marfil y bisel sutil para acompañar al logotipo.
 */

/** Coordenadas de los puntos de cada cara sobre un cuadrado de 0 a 100. */
const CARAS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72]
  ],
  3: [
    [28, 28],
    [50, 50],
    [72, 72]
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72]
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72]
  ],
  6: [
    [28, 28],
    [28, 50],
    [28, 72],
    [72, 28],
    [72, 50],
    [72, 72]
  ]
};

export function Dado({ cara, clase }: { cara: number; clase: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const grad = `dado-grad-${uid}`;

  return (
    <svg
      className={`dado ${clase}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="100%" stopColor="#dfd3be" />
        </linearGradient>
      </defs>
      <rect className="dado-cuerpo" x="6" y="6" width="88" height="88" rx="20" fill={`url(#${grad})`} />
      <rect className="dado-bisel" x="11" y="11" width="78" height="78" rx="15" />
      {(CARAS[cara] ?? []).map(([cx, cy], indice) => (
        <circle key={indice} className="dado-punto" cx={cx} cy={cy} r="8.5" />
      ))}
    </svg>
  );
}

/**
 * Dado decorativo (no pulsable) para acompañar al logotipo de la barra
 * superior. Cada uso le pasa su cara y una clase para darle su giro.
 */

/** Coordenadas de los puntos de cada cara sobre un cuadrado de 0 a 100. */
const CARAS: Record<number, Array<[number, number]>> = {
  1: [[50, 50]],
  2: [
    [27, 27],
    [73, 73]
  ],
  3: [
    [27, 27],
    [50, 50],
    [73, 73]
  ],
  4: [
    [27, 27],
    [73, 27],
    [27, 73],
    [73, 73]
  ],
  5: [
    [27, 27],
    [73, 27],
    [50, 50],
    [27, 73],
    [73, 73]
  ],
  6: [
    [27, 27],
    [27, 50],
    [27, 73],
    [73, 27],
    [73, 50],
    [73, 73]
  ]
};

export function Dado({ cara, clase }: { cara: number; clase: string }) {
  return (
    <svg
      className={`dado ${clase}`}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="5" y="5" width="90" height="90" rx="20" />
      {(CARAS[cara] ?? []).map(([cx, cy], indice) => (
        <circle key={indice} cx={cx} cy={cy} r="9" />
      ))}
    </svg>
  );
}

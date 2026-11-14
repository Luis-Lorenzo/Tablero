/**
 * Dados decorativos en estilo retro pixel art:
 * - DadoPixelD6: dado cuadrado blanco con profundidad pixelada.
 * - DadoPixelPoliedro: dados de colores (d4, d8, d10, d12, d20) en pixel art.
 */

export type TipoDadoPoliedro = "d4" | "d8" | "d10" | "d12" | "d20";

/** Puntos de un d6 en cuadrícula de 16x16. */
const PIPS_D6: Record<number, Array<[number, number]>> = {
  1: [[7, 7]],
  2: [
    [4, 4],
    [10, 10]
  ],
  3: [
    [4, 4],
    [7, 7],
    [10, 10]
  ],
  4: [
    [4, 4],
    [10, 4],
    [4, 10],
    [10, 10]
  ],
  5: [
    [4, 4],
    [10, 4],
    [7, 7],
    [4, 10],
    [10, 10]
  ],
  6: [
    [4, 3],
    [10, 3],
    [4, 7],
    [10, 7],
    [4, 11],
    [10, 11]
  ]
};

export function DadoPixelD6({
  cara = 5,
  clase = ""
}: {
  cara?: number;
  clase?: string;
}) {
  const puntos = PIPS_D6[cara] ?? PIPS_D6[5];

  return (
    <svg
      className={`dado-pixel dado-pixel-d6 ${clase}`}
      viewBox="0 0 18 18"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {/* Sombra / Extrusión 3D pixelada */}
      <rect x="3" y="3" width="14" height="14" fill="#181226" />
      <rect x="2" y="2" width="14" height="14" fill="#8b8399" />
      {/* Contorno negro/oscuro */}
      <rect x="1" y="1" width="14" height="14" fill="#231b33" />
      {/* Cara blanca principal */}
      <rect x="2" y="2" width="12" height="12" fill="#ffffff" />
      {/* Bisel inferior/derecho */}
      <rect x="2" y="13" width="12" height="1" fill="#ded7e8" />
      <rect x="13" y="2" width="1" height="12" fill="#ded7e8" />
      {/* Puntos */}
      {puntos.map(([px, py], i) => (
        <rect key={i} x={px} y={py} width="2" height="2" fill="#231b33" />
      ))}
    </svg>
  );
}

const PALETA_POLIEDRO: Record<
  TipoDadoPoliedro,
  { claro: string; medio: string; oscuro: string; etiqueta: string }
> = {
  d4: { claro: "#5ef2c8", medio: "#1bb893", oscuro: "#0c6351", etiqueta: "4" },
  d8: { claro: "#7cc8ff", medio: "#2f85e0", oscuro: "#184682", etiqueta: "8" },
  d10: { claro: "#ffd25c", medio: "#e89222", oscuro: "#8c4a0a", etiqueta: "10" },
  d12: { claro: "#f585ff", medio: "#b838d6", oscuro: "#63167a", etiqueta: "12" },
  d20: { claro: "#ff7a8a", medio: "#d9324e", oscuro: "#751226", etiqueta: "20" }
};

export function DadoPixelPoliedro({
  tipo,
  clase = ""
}: {
  tipo: TipoDadoPoliedro;
  clase?: string;
}) {
  const pal = PALETA_POLIEDRO[tipo];

  return (
    <svg
      className={`dado-pixel dado-pixel-poli ${clase}`}
      viewBox="0 0 20 20"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {tipo === "d4" && (
        <g>
          {/* Pirámide pixel art */}
          <polygon points="10,1 18,16 2,16" fill="#181226" transform="translate(1,1)" />
          <polygon points="10,1 18,16 2,16" fill={pal.oscuro} />
          <polygon points="10,2 10,15 3,15" fill={pal.claro} />
          <polygon points="10,2 17,15 10,15" fill={pal.medio} />
        </g>
      )}

      {tipo === "d8" && (
        <g>
          {/* Octaedro (rombo) pixel art */}
          <polygon points="10,1 18,10 10,19 2,10" fill="#181226" transform="translate(1,1)" />
          <polygon points="10,1 18,10 10,19 2,10" fill={pal.oscuro} />
          <polygon points="10,2 10,10 3,10" fill={pal.claro} />
          <polygon points="10,2 17,10 10,10" fill={pal.medio} />
          <polygon points="3,10 10,10 10,18" fill={pal.medio} />
          <polygon points="10,10 17,10 10,18" fill={pal.oscuro} />
        </g>
      )}

      {tipo === "d10" && (
        <g>
          {/* Trapezoedro pixel art */}
          <polygon points="10,1 18,9 10,19 2,9" fill="#181226" transform="translate(1,1)" />
          <polygon points="10,1 18,9 10,19 2,9" fill={pal.oscuro} />
          <polygon points="10,2 15,9 10,13 5,9" fill={pal.claro} />
          <polygon points="15,9 17,9 10,18 10,13" fill={pal.medio} />
          <polygon points="3,9 5,9 10,13 10,18" fill={pal.medio} />
        </g>
      )}

      {tipo === "d12" && (
        <g>
          {/* Dodecaedro pixel art */}
          <polygon
            points="10,1 17,5 18,13 13,18 7,18 2,13 3,5"
            fill="#181226"
            transform="translate(1,1)"
          />
          <polygon points="10,1 17,5 18,13 13,18 7,18 2,13 3,5" fill={pal.oscuro} />
          <polygon points="10,2 16,6 14,13 6,13 4,6" fill={pal.medio} />
          <polygon points="10,5 14,8 12,12 8,12 6,8" fill={pal.claro} />
        </g>
      )}

      {tipo === "d20" && (
        <g>
          {/* Icosaedro hexagonal pixel art */}
          <polygon
            points="10,1 18,5 18,15 10,19 2,15 2,5"
            fill="#181226"
            transform="translate(1,1)"
          />
          <polygon points="10,1 18,5 18,15 10,19 2,15 2,5" fill={pal.oscuro} />
          <polygon points="10,2 17,6 10,10 3,6" fill={pal.claro} />
          <polygon points="3,6 10,10 10,18 3,14" fill={pal.medio} />
          <polygon points="17,6 17,14 10,18 10,10" fill={pal.oscuro} />
          <polygon points="10,5 14,12 6,12" fill={pal.claro} />
        </g>
      )}

      <text
        x="10"
        y={tipo === "d4" ? "13.5" : "11.8"}
        textAnchor="middle"
        className="dado-pixel-num"
      >
        {pal.etiqueta}
      </text>
    </svg>
  );
}

/** Compatibilidad con el componente anterior si se importa por nombre. */
export function Dado({ cara, clase }: { cara: number; clase: string }) {
  return <DadoPixelD6 cara={cara} clase={clase} />;
}

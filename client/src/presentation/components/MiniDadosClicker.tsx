import { useState } from "react";
import { Sparkles } from "lucide-react";
import { DadoPixelD6, DadoPixelPoliedro, type TipoDadoPoliedro } from "./Dado";

interface Tirada {
  dado: string;
  valor: number;
  max: number;
}

const DADOS: Array<{
  etiqueta: string;
  caras: number;
  tipo: "d6" | TipoDadoPoliedro;
}> = [
  { etiqueta: "d4", caras: 4, tipo: "d4" },
  { etiqueta: "d6", caras: 6, tipo: "d6" },
  { etiqueta: "d8", caras: 8, tipo: "d8" },
  { etiqueta: "d10", caras: 10, tipo: "d10" },
  { etiqueta: "d12", caras: 12, tipo: "d12" },
  { etiqueta: "d20", caras: 20, tipo: "d20" }
];

/**
 * Widget compacto estilo clicker retro para tirar dados mientras esperas en
 * recepción. 100% local.
 */
export function MiniDadosClicker() {
  const [tiradas, setTiradas] = useState(0);
  const [ultima, setUltima] = useState<Tirada | null>(null);
  const [pulso, setPulso] = useState(0);

  function lanzar(etiqueta: string, caras: number) {
    const valor = Math.floor(Math.random() * caras) + 1;
    setUltima({ dado: etiqueta, valor, max: caras });
    setTiradas(prev => prev + 1);
    setPulso(prev => prev + 1);
  }

  const esCritico = ultima !== null && ultima.valor === ultima.max;
  const esPifia = ultima !== null && ultima.valor === 1;

  return (
    <section className="panel-caja clicker-widget" aria-label="Lanzador rápido de dados">
      <div className="panel-cabecera">
        <span className="panel-titulo-pixel">DADOS RÁPIDOS</span>
        <span className="clicker-contador" title="Total de tiradas">
          #{tiradas}
        </span>
      </div>

      <div key={pulso} className="clicker-visor">
        {ultima ? (
          <>
            <span className="clicker-dado-tag">{ultima.dado.toUpperCase()}</span>
            <span
              className={`clicker-resultado${
                esCritico ? " critico" : esPifia ? " pifia" : ""
              }`}
            >
              {ultima.valor}
            </span>
            {esCritico && (
              <span className="clicker-estado critico">
                <Sparkles size={11} aria-hidden="true" />
                <span>CRÍTICO</span>
              </span>
            )}
            {esPifia && <span className="clicker-estado pifia">PIFIA</span>}
          </>
        ) : (
          <span className="clicker-placeholder">Pulsa un dado para tirar</span>
        )}
      </div>

      <div className="clicker-grid">
        {DADOS.map(item => (
          <button
            key={item.etiqueta}
            type="button"
            className="clicker-btn"
            onClick={() => lanzar(item.etiqueta, item.caras)}
            title={`Tirar ${item.etiqueta}`}
          >
            {item.tipo === "d6" ? (
              <DadoPixelD6 cara={ultima?.dado === "d6" ? ultima.valor : 5} clase="mini" />
            ) : (
              <DadoPixelPoliedro tipo={item.tipo} clase="mini" />
            )}
            <span>{item.etiqueta}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

import type { TipoEspecialTirada } from "./tipos";

let audioCtx: AudioContext | null = null;

function obtenerContexto(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;

  if (!audioCtx) {
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function tocarNota(
  ctx: AudioContext,
  frecuencia: number,
  inicio: number,
  duracion: number,
  tipo: OscillatorType,
  volumen: number
): void {
  const osc = ctx.createOscillator();
  const ganancia = ctx.createGain();

  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencia, inicio);

  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(volumen, inicio + 0.015);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

  osc.connect(ganancia);
  ganancia.connect(ctx.destination);

  osc.start(inicio);
  osc.stop(inicio + duracion + 0.02);
}

/**
 * Reproduce un efecto breve con Web Audio API cuando una tirada de d20 saca
 * 20 natural (crítico) o 1 natural (pifia).
 */
export function reproducirSonidoTirada(especial: TipoEspecialTirada | undefined): void {
  if (!especial) return;

  try {
    const ctx = obtenerContexto();
    if (!ctx) return;

    const ahora = ctx.currentTime;

    if (especial === "critico") {
      // Acorde ascendente brillante de logro (Do5 - Mi5 - Sol5 - Do6).
      const notas = [523.25, 659.25, 783.99, 1046.5];
      notas.forEach((freq, i) => {
        tocarNota(ctx, freq, ahora + i * 0.075, 0.24, "triangle", 0.16);
      });
      return;
    }

    // Pifia: descenso grave de fallo.
    tocarNota(ctx, 220, ahora, 0.18, "sawtooth", 0.11);
    tocarNota(ctx, 185, ahora + 0.14, 0.18, "sawtooth", 0.11);
    tocarNota(ctx, 138.59, ahora + 0.28, 0.3, "triangle", 0.14);
  } catch {
    // Sin soporte de audio o bloqueado por política del navegador: se ignora.
  }
}

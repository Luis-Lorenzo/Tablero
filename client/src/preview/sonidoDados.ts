import { estaSonidoSilenciado } from "./sonido";
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

function ejecutarConContexto(fn: (ctx: AudioContext) => void): void {
  const ctx = obtenerContexto();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx
      .resume()
      .then(() => {
        fn(ctx);
      })
      .catch(() => {});
    return;
  }
  fn(ctx);
}

/**
 * Reproduce un efecto breve de dados rodando sobre la mesa (Web Audio API)
 * pensado para las tiradas rápidas.
 */
export function reproducirSonidoRoll(): void {
  if (estaSonidoSilenciado()) return;
  try {
    ejecutarConContexto(ctx => {
      const ahora = ctx.currentTime;
      const golpes = [
        { t: 0, freq: 290, dur: 0.045, vol: 0.07 },
        { t: 0.055, freq: 380, dur: 0.04, vol: 0.065 },
        { t: 0.11, freq: 250, dur: 0.045, vol: 0.06 },
        { t: 0.165, freq: 440, dur: 0.038, vol: 0.055 },
        { t: 0.225, freq: 320, dur: 0.045, vol: 0.045 },
        { t: 0.29, freq: 265, dur: 0.055, vol: 0.035 }
      ];

      golpes.forEach(g => {
        tocarNota(ctx, g.freq, ahora + g.t, g.dur, "triangle", g.vol);
      });
    });
  } catch {
    // Sin soporte de audio o bloqueado por política del navegador: se ignora.
  }
}

/**
 * Reproduce un efecto breve con Web Audio API cuando una tirada de un solo dado
 * saca su máximo natural (crítico) o 1 natural (pifia).
 */
export function reproducirSonidoTirada(especial: TipoEspecialTirada | undefined): void {
  if (!especial || estaSonidoSilenciado()) return;

  try {
    ejecutarConContexto(ctx => {
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
    });
  } catch {
    // Sin soporte de audio o bloqueado por política del navegador: se ignora.
  }
}

function tocarBarridoZigZag(
  ctx: AudioContext,
  destino: AudioNode,
  frecuencias: [number, number, number],
  inicio: number,
  duracion: number,
  tipo: OscillatorType,
  volumen: number
): void {
  const osc = ctx.createOscillator();
  const ganancia = ctx.createGain();
  const mitad = inicio + duracion * 0.45;
  const fin = inicio + duracion;

  osc.type = tipo;
  osc.frequency.setValueAtTime(frecuencias[0], inicio);
  osc.frequency.exponentialRampToValueAtTime(frecuencias[1], mitad);
  osc.frequency.exponentialRampToValueAtTime(frecuencias[2], fin);

  ganancia.gain.setValueAtTime(0.0001, inicio);
  ganancia.gain.exponentialRampToValueAtTime(volumen, inicio + 0.012);
  ganancia.gain.exponentialRampToValueAtTime(0.0001, fin);

  osc.connect(ganancia);
  ganancia.connect(destino);

  osc.start(inicio);
  osc.stop(fin + 0.02);
}

/**
 * Reproduce un efecto furtivo, zigzagueante y misterioso para dados secretos
 * del Máster o tiradas ocultas (Web Audio API).
 */
export function reproducirSonidoRollSecreto(): void {
  if (estaSonidoSilenciado()) return;
  try {
    ejecutarConContexto(ctx => {
      const ahora = ctx.currentTime;

      // Filtro paso-banda oscuro para apagar el brillo y dar aire sigiloso.
      const filtro = ctx.createBiquadFilter();
      filtro.type = "bandpass";
      filtro.Q.setValueAtTime(2.6, ahora);
      filtro.frequency.setValueAtTime(340, ahora);
      filtro.frequency.exponentialRampToValueAtTime(560, ahora + 0.14);
      filtro.frequency.exponentialRampToValueAtTime(300, ahora + 0.28);
      filtro.frequency.exponentialRampToValueAtTime(460, ahora + 0.42);
      filtro.connect(ctx.destination);

      // Cadencia sigilosa con barridos en zig-zag (subida-bajada / bajada-subida)
      // y armónicos menores/suspendidos suaves.
      const pasos: Array<{
        t: number;
        dur: number;
        freqs: [number, number, number];
        fantasma: number;
        vol: number;
      }> = [
        { t: 0.0, dur: 0.06, freqs: [293.66, 392.0, 261.63], fantasma: 349.23, vol: 0.055 },
        { t: 0.065, dur: 0.065, freqs: [369.99, 277.18, 415.3], fantasma: 311.13, vol: 0.05 },
        { t: 0.145, dur: 0.055, freqs: [246.94, 349.23, 233.08], fantasma: 293.66, vol: 0.048 },
        { t: 0.21, dur: 0.07, freqs: [392.0, 261.63, 329.63], fantasma: 277.18, vol: 0.044 },
        { t: 0.295, dur: 0.065, freqs: [233.08, 311.13, 207.65], fantasma: 246.94, vol: 0.038 },
        { t: 0.37, dur: 0.095, freqs: [277.18, 196.0, 164.81], fantasma: 220.0, vol: 0.032 }
      ];

      pasos.forEach(p => {
        tocarBarridoZigZag(
          ctx,
          filtro,
          p.freqs,
          ahora + p.t,
          p.dur,
          "sine",
          p.vol
        );
        tocarBarridoZigZag(
          ctx,
          filtro,
          [p.fantasma, p.fantasma * 0.94, p.fantasma * 1.03],
          ahora + p.t + 0.01,
          p.dur * 0.9,
          "triangle",
          p.vol * 0.45
        );
      });
    });
  } catch {
    // Sin soporte de audio o bloqueado por política del navegador: se ignora.
  }
}

/**
 * Reproduce un remate susurrado y misterioso para críticos o pifias en tiradas secretas.
 */
export function reproducirSonidoTiradaSecreta(
  especial: TipoEspecialTirada | undefined
): void {
  if (!especial || estaSonidoSilenciado()) return;

  try {
    ejecutarConContexto(ctx => {
      const ahora = ctx.currentTime;
      const filtro = ctx.createBiquadFilter();
      filtro.type = "lowpass";
      filtro.frequency.setValueAtTime(880, ahora);
      filtro.connect(ctx.destination);

      if (especial === "critico") {
        // Arpegio menor/suspendido tenue y enigmático (Re4 - Fa4 - La4 - Mi5).
        const notas: Array<[number, number, number]> = [
          [293.66, 311.13, 293.66],
          [349.23, 369.99, 349.23],
          [440.0, 466.16, 440.0],
          [659.25, 622.25, 659.25]
        ];
        notas.forEach((freqs, i) => {
          tocarBarridoZigZag(
            ctx,
            filtro,
            freqs,
            ahora + i * 0.085,
            0.22,
            "sine",
            0.075
          );
        });
        return;
      }

      // Pifia secreta: susurro descendente en tritono/menor.
      tocarBarridoZigZag(ctx, filtro, [233.08, 207.65, 196.0], ahora, 0.19, "triangle", 0.065);
      tocarBarridoZigZag(ctx, filtro, [185.0, 164.81, 155.56], ahora + 0.15, 0.2, "sine", 0.065);
      tocarBarridoZigZag(ctx, filtro, [146.83, 123.47, 110.0], ahora + 0.3, 0.3, "sine", 0.07);
    });
  } catch {
    // Sin soporte de audio o bloqueado por política del navegador: se ignora.
  }
}

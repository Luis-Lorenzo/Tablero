const CLAVE_SILENCIO = "pocketrol.sonido.silenciado";
const CLAVE_MUSICA_SILENCIO = "pocketrol.musica.silenciada";
const CLAVE_MUSICA_VOLUMEN = "pocketrol.musica.volumen";
let ultimoAvisoMs = 0;

function notificarCambioMusicaLocal(): void {
  try {
    window.dispatchEvent(new CustomEvent("pocketrol:musica-local"));
  } catch {
    // Ignorar en entornos sin window/CustomEvent.
  }
}

export function estaSonidoSilenciado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_SILENCIO) === "1";
  } catch {
    return false;
  }
}

export function establecerSonidoSilenciado(silenciado: boolean): void {
  try {
    if (silenciado) {
      window.localStorage.setItem(CLAVE_SILENCIO, "1");
    } else {
      window.localStorage.removeItem(CLAVE_SILENCIO);
    }
  } catch {
    // Ignorar errores de almacenamiento en modo privado.
  }
}

export function estaMusicaSilenciada(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_MUSICA_SILENCIO) === "1";
  } catch {
    return false;
  }
}

export function establecerMusicaSilenciada(silenciado: boolean): void {
  try {
    if (silenciado) {
      window.localStorage.setItem(CLAVE_MUSICA_SILENCIO, "1");
    } else {
      window.localStorage.removeItem(CLAVE_MUSICA_SILENCIO);
    }
  } catch {
    // Ignorar errores de almacenamiento en modo privado.
  }
  notificarCambioMusicaLocal();
}

export function obtenerVolumenMusica(): number {
  try {
    const bruto = window.localStorage.getItem(CLAVE_MUSICA_VOLUMEN);
    if (bruto === null) return 1;
    const numero = Number(bruto);
    if (!Number.isFinite(numero)) return 1;
    return Math.max(0, Math.min(1, numero));
  } catch {
    return 1;
  }
}

export function guardarVolumenMusica(volumen: number): void {
  const limpio = Number.isFinite(volumen) ? Math.max(0, Math.min(1, volumen)) : 1;
  try {
    window.localStorage.setItem(CLAVE_MUSICA_VOLUMEN, String(limpio));
  } catch {
    // Ignorar errores de almacenamiento en modo privado.
  }
  notificarCambioMusicaLocal();
}

/**
 * Sintetiza un breve tono leve de notificación con Web Audio API, sin depender
 * de archivos de audio externos.
 */
export function reproducirSonidoNotificacion(): void {
  if (estaSonidoSilenciado()) return;

  const ahoraMs = Date.now();
  if (ahoraMs - ultimoAvisoMs < 400) return;
  ultimoAvisoMs = ahoraMs;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const ahora = ctx.currentTime;

    const tocarNota = (frecuencia: number, inicio: number, duracion: number) => {
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frecuencia, inicio);

      ganancia.gain.setValueAtTime(0.001, inicio);
      ganancia.gain.exponentialRampToValueAtTime(0.06, inicio + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.001, inicio + duracion);

      osc.connect(ganancia);
      ganancia.connect(ctx.destination);

      osc.start(inicio);
      osc.stop(inicio + duracion + 0.02);
    };

    tocarNota(587.33, ahora, 0.12); // Re5
    tocarNota(880, ahora + 0.09, 0.18); // La5

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 450);
  } catch {
    // Si el navegador bloquea el audio antes de la interacción, no interrumpimos la UI.
  }
}

/**
 * Reproduce un ping muy suave y breve para señalar un punto en pizarra o mapa.
 */
export function reproducirSonidoPing(): void {
  if (estaSonidoSilenciado()) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const ahora = ctx.currentTime;
    const osc = ctx.createOscillator();
    const ganancia = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(987.77, ahora);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ahora + 0.09);

    ganancia.gain.setValueAtTime(0.0008, ahora);
    ganancia.gain.exponentialRampToValueAtTime(0.032, ahora + 0.018);
    ganancia.gain.exponentialRampToValueAtTime(0.0008, ahora + 0.22);

    osc.connect(ganancia);
    ganancia.connect(ctx.destination);

    osc.start(ahora);
    osc.stop(ahora + 0.24);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 320);
  } catch {
    // Ignorar si el navegador bloquea audio.
  }
}

/**
 * Reproduce un sonido de monedas al cambiar la divisa:
 * - `delta >= 0`: "chiclín" metálico brillante y adictivo de moneda ganada.
 * - `delta < 0`: cadencia descendente melancólica de pérdida de dinero.
 */
export function reproducirSonidoMonedas(delta: number = 1): void {
  if (estaSonidoSilenciado()) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const ahora = ctx.currentTime;

    if (delta >= 0) {
      // "Chiclín!" brillante de moneda: ataque rápido en quinta/octava + cola cristalina
      const notas = [
        { t: 0, freq: 987.77, dur: 0.085, gain: 0.07, tipo: "triangle" as OscillatorType },
        { t: 0.058, freq: 1318.51, dur: 0.28, gain: 0.08, tipo: "sine" as OscillatorType },
        { t: 0.058, freq: 2637.02, dur: 0.22, gain: 0.036, tipo: "triangle" as OscillatorType },
        { t: 0.11, freq: 1975.53, dur: 0.22, gain: 0.03, tipo: "sine" as OscillatorType },
        { t: 0.135, freq: 3135.96, dur: 0.16, gain: 0.018, tipo: "sine" as OscillatorType }
      ];

      for (const n of notas) {
        const osc = ctx.createOscillator();
        const ganancia = ctx.createGain();
        osc.type = n.tipo;
        osc.frequency.setValueAtTime(n.freq, ahora + n.t);

        ganancia.gain.setValueAtTime(0.0001, ahora + n.t);
        ganancia.gain.exponentialRampToValueAtTime(n.gain, ahora + n.t + 0.008);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + n.t + n.dur);

        osc.connect(ganancia);
        ganancia.connect(ctx.destination);
        osc.start(ahora + n.t);
        osc.stop(ahora + n.t + n.dur + 0.02);
      }
    } else {
      // Sonido triste/descendente cuando pierdes dinero
      const filtro = ctx.createBiquadFilter();
      filtro.type = "lowpass";
      filtro.frequency.setValueAtTime(920, ahora);
      filtro.connect(ctx.destination);

      const caida = [
        { t: 0, f1: 392.0, f2: 369.99, dur: 0.13, gain: 0.065 },
        { t: 0.11, f1: 349.23, f2: 311.13, dur: 0.15, gain: 0.06 },
        { t: 0.23, f1: 293.66, f2: 220.0, dur: 0.24, gain: 0.055 }
      ];

      for (const c of caida) {
        const osc = ctx.createOscillator();
        const ganancia = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(c.f1, ahora + c.t);
        osc.frequency.exponentialRampToValueAtTime(c.f2, ahora + c.t + c.dur);

        ganancia.gain.setValueAtTime(0.0001, ahora + c.t);
        ganancia.gain.exponentialRampToValueAtTime(c.gain, ahora + c.t + 0.015);
        ganancia.gain.exponentialRampToValueAtTime(0.0001, ahora + c.t + c.dur);

        osc.connect(ganancia);
        ganancia.connect(filtro);
        osc.start(ahora + c.t);
        osc.stop(ahora + c.t + c.dur + 0.02);
      }
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 560);
  } catch {
    // Silencioso si el navegador bloquea el audio.
  }
}

/**
 * Reproduce un sonido breve de "expirado / consumido" al gastar un objeto.
 */
export function reproducirSonidoConsumir(): void {
  if (estaSonidoSilenciado()) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const ahora = ctx.currentTime;

    const osc = ctx.createOscillator();
    const ganancia = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(523.25, ahora); // Do5
    osc.frequency.exponentialRampToValueAtTime(329.63, ahora + 0.14); // Mi4
    osc.frequency.exponentialRampToValueAtTime(196, ahora + 0.34); // Sol3

    ganancia.gain.setValueAtTime(0.001, ahora);
    ganancia.gain.exponentialRampToValueAtTime(0.06, ahora + 0.025);
    ganancia.gain.exponentialRampToValueAtTime(0.0008, ahora + 0.36);

    osc.connect(ganancia);
    ganancia.connect(ctx.destination);
    osc.start(ahora);
    osc.stop(ahora + 0.38);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 450);
  } catch {
    // Silencioso si el navegador bloquea el audio.
  }
}

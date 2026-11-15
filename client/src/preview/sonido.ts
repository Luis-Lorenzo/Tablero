const CLAVE_SILENCIO = "pocketrol.sonido.silenciado";
let ultimoAvisoMs = 0;

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
 * Reproduce un sonido breve de monedas metálicas amontonándose al cambiar la divisa.
 */
export function reproducirSonidoMonedas(): void {
  if (estaSonidoSilenciado()) return;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const ahora = ctx.currentTime;
    const golpes = [
      { t: 0, f1: 1960, f2: 2637 },
      { t: 0.055, f1: 2217, f2: 2960 },
      { t: 0.115, f1: 2489, f2: 3322 }
    ];

    for (const g of golpes) {
      const osc = ctx.createOscillator();
      const ganancia = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(g.f1, ahora + g.t);
      osc.frequency.exponentialRampToValueAtTime(g.f2, ahora + g.t + 0.045);

      ganancia.gain.setValueAtTime(0.001, ahora + g.t);
      ganancia.gain.exponentialRampToValueAtTime(0.055, ahora + g.t + 0.01);
      ganancia.gain.exponentialRampToValueAtTime(0.001, ahora + g.t + 0.09);

      osc.connect(ganancia);
      ganancia.connect(ctx.destination);
      osc.start(ahora + g.t);
      osc.stop(ahora + g.t + 0.11);
    }

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 360);
  } catch {
    // Silencioso si el navegador bloquea el audio.
  }
}

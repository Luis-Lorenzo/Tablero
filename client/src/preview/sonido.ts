let ultimoAvisoMs = 0;

/**
 * Sintetiza un breve tono leve de notificación con Web Audio API, sin depender
 * de archivos de audio externos.
 */
export function reproducirSonidoNotificacion(): void {
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

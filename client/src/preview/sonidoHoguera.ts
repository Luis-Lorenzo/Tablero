const CLAVE_HOGUERA_SILENCIADA = "pocketrol_hoguera_silenciada";

let audioCtx: AudioContext | null = null;
let nodoMaestro: GainNode | null = null;
let fuenteBase: AudioBufferSourceNode | null = null;
let timerChispas: number | null = null;
let activo = false;
let listenerDesbloqueo: (() => void) | null = null;

export function estaHogueraSilenciada(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CLAVE_HOGUERA_SILENCIADA) === "1";
  } catch {
    return false;
  }
}

export function alternarHogueraSilenciada(): boolean {
  const nuevo = !estaHogueraSilenciada();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CLAVE_HOGUERA_SILENCIADA, nuevo ? "1" : "0");
    } catch {
      // Sin almacenamiento disponible.
    }
  }
  return nuevo;
}

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
  return audioCtx;
}

function crearBufferRuidoMarron(ctx: AudioContext, duracionSeg: number): AudioBuffer {
  const longitud = Math.floor(ctx.sampleRate * duracionSeg);
  const buffer = ctx.createBuffer(1, longitud, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  let ultimo = 0;

  for (let i = 0; i < longitud; i++) {
    const blanco = Math.random() * 2 - 1;
    ultimo = (ultimo + 0.03 * blanco) / 1.03;
    datos[i] = ultimo * 2.2;
  }

  // Suavizado en los extremos para que el bucle no haga clic.
  const fade = Math.min(2048, Math.floor(longitud / 8));
  for (let i = 0; i < fade; i++) {
    const k = i / fade;
    datos[i] *= k;
    datos[longitud - 1 - i] *= k;
  }

  return buffer;
}

function crearBufferChispa(ctx: AudioContext): AudioBuffer {
  const duracion = 0.024;
  const longitud = Math.floor(ctx.sampleRate * duracion);
  const buffer = ctx.createBuffer(1, longitud, ctx.sampleRate);
  const datos = buffer.getChannelData(0);

  for (let i = 0; i < longitud; i++) {
    const env = Math.pow(1 - i / longitud, 2.6);
    datos[i] = (Math.random() * 2 - 1) * env;
  }

  return buffer;
}

function programarChispa(): void {
  if (!activo || !audioCtx || !nodoMaestro) return;

  const esperaMs = 190 + Math.random() * 520;
  timerChispas = window.setTimeout(() => {
    if (!activo || !audioCtx || !nodoMaestro) return;
    if (audioCtx.state === "running") {
      try {
        const src = audioCtx.createBufferSource();
        src.buffer = crearBufferChispa(audioCtx);

        const filtro = audioCtx.createBiquadFilter();
        filtro.type = "bandpass";
        filtro.frequency.value = 1700 + Math.random() * 2200;
        filtro.Q.value = 2.2;

        const ganancia = audioCtx.createGain();
        ganancia.gain.value = 0.015 + Math.random() * 0.025;

        src.connect(filtro);
        filtro.connect(ganancia);
        ganancia.connect(nodoMaestro);
        src.start();
      } catch {
        // Ignorar errores puntuales de audio.
      }
    }
    programarChispa();
  }, esperaMs);
}

function limpiarDesbloqueo(): void {
  if (!listenerDesbloqueo || typeof window === "undefined") return;
  window.removeEventListener("pointerdown", listenerDesbloqueo);
  window.removeEventListener("keydown", listenerDesbloqueo);
  listenerDesbloqueo = null;
}

function arrancarNodos(ctx: AudioContext): void {
  if (!activo || fuenteBase) return;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.45);
  master.connect(ctx.destination);
  nodoMaestro = master;

  const src = ctx.createBufferSource();
  src.buffer = crearBufferRuidoMarron(ctx, 4);
  src.loop = true;

  const pasoBajo = ctx.createBiquadFilter();
  pasoBajo.type = "lowpass";
  pasoBajo.frequency.value = 230;

  const gananciaBase = ctx.createGain();
  gananciaBase.gain.value = 0.032;

  src.connect(pasoBajo);
  pasoBajo.connect(gananciaBase);
  gananciaBase.connect(master);
  src.start();
  fuenteBase = src;

  programarChispa();
}

/**
 * Inicia el sonido tenue y en bucle de la hoguera del lobby.
 * Si el navegador aún bloquea el audio hasta el primer clic/tecla,
 * se reanuda automáticamente en cuanto el usuario interactúa.
 */
export function iniciarSonidoHoguera(): void {
  if (estaHogueraSilenciada()) return;
  const ctx = obtenerContexto();
  if (!ctx) return;

  activo = true;

  if (ctx.state === "running") {
    arrancarNodos(ctx);
    return;
  }

  void ctx
    .resume()
    .then(() => {
      if (activo && ctx.state === "running") {
        arrancarNodos(ctx);
        limpiarDesbloqueo();
      }
    })
    .catch(() => {});

  if (!listenerDesbloqueo && typeof window !== "undefined") {
    listenerDesbloqueo = () => {
      const actual = obtenerContexto();
      if (!actual || !activo) {
        limpiarDesbloqueo();
        return;
      }
      void actual
        .resume()
        .then(() => {
          if (activo && actual.state === "running") {
            arrancarNodos(actual);
            limpiarDesbloqueo();
          }
        })
        .catch(() => {});
    };
    window.addEventListener("pointerdown", listenerDesbloqueo, { passive: true });
    window.addEventListener("keydown", listenerDesbloqueo, { passive: true });
  }
}

/**
 * Detiene el sonido de la hoguera y libera los nodos activos.
 */
export function detenerSonidoHoguera(): void {
  activo = false;
  limpiarDesbloqueo();

  if (timerChispas !== null) {
    window.clearTimeout(timerChispas);
    timerChispas = null;
  }

  if (fuenteBase) {
    try {
      fuenteBase.stop();
      fuenteBase.disconnect();
    } catch {
      // Ya detenida.
    }
    fuenteBase = null;
  }

  if (nodoMaestro) {
    try {
      nodoMaestro.disconnect();
    } catch {
      // Ya desconectada.
    }
    nodoMaestro = null;
  }
}

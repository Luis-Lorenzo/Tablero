const CLAVE_HOGUERA_SILENCIADA = "pocketrol_hoguera_silenciada";
const RUTA_AUDIO_HOGUERA = "/BucleLobby.wav";
const VOLUMEN_HOGUERA = 0.25;

let audio: HTMLAudioElement | null = null;
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

function obtenerAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (!audio) {
    audio = new Audio(RUTA_AUDIO_HOGUERA);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = VOLUMEN_HOGUERA;
  }
  return audio;
}

function limpiarDesbloqueo(): void {
  if (!listenerDesbloqueo || typeof window === "undefined") return;
  window.removeEventListener("pointerdown", listenerDesbloqueo);
  window.removeEventListener("keydown", listenerDesbloqueo);
  listenerDesbloqueo = null;
}

function registrarDesbloqueo(): void {
  if (listenerDesbloqueo || typeof window === "undefined") return;
  listenerDesbloqueo = () => {
    if (!activo) {
      limpiarDesbloqueo();
      return;
    }
    const el = obtenerAudio();
    if (!el) return;
    void el
      .play()
      .then(() => {
        limpiarDesbloqueo();
      })
      .catch(() => {});
  };
  window.addEventListener("pointerdown", listenerDesbloqueo, { passive: true });
  window.addEventListener("keydown", listenerDesbloqueo, { passive: true });
}

/**
 * Inicia el audio de la hoguera del lobby (/BucleLobby.wav) en bucle de forma tenue.
 * Si el navegador bloquea la reproducción automática hasta la primera interacción,
 * se reanuda automáticamente en cuanto el usuario hace clic o pulsa una tecla.
 */
export function iniciarSonidoHoguera(): void {
  if (estaHogueraSilenciada()) return;
  const el = obtenerAudio();
  if (!el) return;

  activo = true;
  el.loop = true;
  el.volume = VOLUMEN_HOGUERA;

  void el
    .play()
    .then(() => {
      if (activo) {
        limpiarDesbloqueo();
      }
    })
    .catch(() => {
      if (activo) {
        registrarDesbloqueo();
      }
    });
}

/**
 * Pausa y reinicia el audio de la hoguera.
 */
export function detenerSonidoHoguera(): void {
  activo = false;
  limpiarDesbloqueo();

  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // Ignorar si no estaba listo.
    }
  }
}

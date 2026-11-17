import type { EstadoMapaCompartido } from "../repositories/mapa-estado.repository.js";

/**
 * Aviso de que el estado de las mesas cambió o de eventos en tiempo real dentro
 * de una mesa (chat, tiradas de dados, compartir, mapa).
 */
export interface MesasNotifier {
  notificarCambio(): void;
  notificarUsuario(userId: string, evento: unknown): void;
  enviarAUsuarios(userIds: readonly string[], payload: unknown): void;
  mapaActualizado(
    userIds: readonly string[],
    mesaId: string,
    mapa: EstadoMapaCompartido
  ): void;
  estaConectado?(userId: string): boolean;
}

/** Implementación vacía (pruebas o entornos sin canal en vivo). */
export class NoopMesasNotifier implements MesasNotifier {
  notificarCambio(): void {
    // Intencionadamente no hace nada.
  }

  notificarUsuario(_userId: string, _evento: unknown): void {
    // Intencionadamente no hace nada.
  }

  enviarAUsuarios(_userIds: readonly string[], _payload: unknown): void {
    // Intencionadamente no hace nada.
  }

  mapaActualizado(
    _userIds: readonly string[],
    _mesaId: string,
    _mapa: EstadoMapaCompartido
  ): void {
    // Intencionadamente no hace nada.
  }
}

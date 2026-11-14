/**
 * Aviso de que el estado de las mesas cambió o de que hay un evento dirigido
 * a un usuario concreto.
 */
export interface MesasNotifier {
  notificarCambio(): void;
  notificarUsuario(userId: string, evento: unknown): void;
}

/** Implementación vacía (pruebas o entornos sin canal en vivo). */
export class NoopMesasNotifier implements MesasNotifier {
  notificarCambio(): void {
    // Intencionadamente no hace nada.
  }

  notificarUsuario(_userId: string, _evento: unknown): void {
    // Intencionadamente no hace nada.
  }
}

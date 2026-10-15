/**
 * Aviso de que el estado de las mesas cambió. El canal en vivo no manda datos:
 * solo invalida, y cada cliente vuelve a pedir lo que le corresponde ver.
 */
export interface MesasNotifier {
  notificarCambio(): void;
}

/** Implementación vacía (pruebas o entornos sin canal en vivo). */
export class NoopMesasNotifier implements MesasNotifier {
  notificarCambio(): void {
    // Intencionadamente no hace nada.
  }
}

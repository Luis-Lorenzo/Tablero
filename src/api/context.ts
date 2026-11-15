import type { AppConfig } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { AuthService } from "../services/auth.service.js";
import type { BloqueoService } from "../services/bloqueo.service.js";
import type { UserService } from "../services/user.service.js";

import type { MesaRepository } from "../repositories/mesa.repository.js";
import type { MesaService } from "../services/mesa.service.js";
import type { ChatService } from "../services/chat.service.js";
import type { MesasNotifier } from "../realtime/mesas-notifier.js";
import type { ArchivoService } from "../services/archivo.service.js";
import type { MesaEstadoRepository } from "../repositories/mesa-estado.repository.js";
import type { PizarraEstadoRepository } from "../repositories/pizarra-estado.repository.js";
import type { TransferenciaService } from "../services/transferencia.service.js";
import type { UserMacrosRepository } from "../repositories/user-macros.repository.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  userRepository: UserRepository;
  userMacrosRepository?: UserMacrosRepository;
  mesaRepository: MesaRepository;
  mesaEstadoRepository?: MesaEstadoRepository;
  pizarraEstadoRepository?: PizarraEstadoRepository;
  authService: AuthService;
  userService: UserService;
  bloqueoService: BloqueoService;
  mesaService: MesaService;
  chatService: ChatService;
  archivoService: ArchivoService;
  transferenciaService?: TransferenciaService;
  /** Canal en vivo: avisa a las pestañas abiertas de que las mesas cambiaron. */
  mesasNotifier: MesasNotifier;
}

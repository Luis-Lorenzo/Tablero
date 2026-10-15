import type { AppConfig } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { AuthService } from "../services/auth.service.js";
import type { BloqueoService } from "../services/bloqueo.service.js";
import type { UserService } from "../services/user.service.js";

import type { MesaRepository } from "../repositories/mesa.repository.js";
import type { MesaService } from "../services/mesa.service.js";
import type { MesasNotifier } from "../realtime/mesas-notifier.js";
import type { ArchivoService } from "../services/archivo.service.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  userRepository: UserRepository;
  mesaRepository: MesaRepository;
  authService: AuthService;
  userService: UserService;
  bloqueoService: BloqueoService;
  mesaService: MesaService;
  archivoService: ArchivoService;
  /** Canal en vivo: avisa a las pestañas abiertas de que las mesas cambiaron. */
  mesasNotifier: MesasNotifier;
}

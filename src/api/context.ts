import type { AppConfig } from "../lib/config.js";
import type { Logger } from "../lib/logger.js";
import type { UserRepository } from "../repositories/user.repository.js";
import type { AuthService } from "../services/auth.service.js";
import type { UserService } from "../services/user.service.js";

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  userRepository: UserRepository;
  authService: AuthService;
  userService: UserService;
}

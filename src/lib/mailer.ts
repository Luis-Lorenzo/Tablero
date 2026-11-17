import type { BrevoConfig } from "./config.js";
import { errors } from "./errors.js";
import type { Logger } from "./logger.js";

export interface VerificationEmailInput {
  toEmail: string;
  verificationUrl: string;
}

export interface EmailSender {
  sendVerificationEmail(input: VerificationEmailInput): Promise<void>;
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Envía correos transaccionales mediante la API HTTP v3 oficial de Brevo
 * usando una plantilla activa (`templateId`) y `params.verification_url`.
 * Nunca registra la API Key ni el token/URL de verificación en los logs.
 */
export class BrevoEmailSender implements EmailSender {
  constructor(
    private readonly config: BrevoConfig,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(BREVO_API_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.config.apiKey
        },
        body: JSON.stringify({
          sender: {
            email: this.config.senderEmail,
            name: this.config.senderName
          },
          to: [{ email: input.toEmail }],
          templateId: this.config.templateId,
          params: {
            verification_url: input.verificationUrl
          }
        })
      });
    } catch (error) {
      this.logger.error("Fallo de red al contactar con Brevo", {
        toEmail: input.toEmail,
        templateId: this.config.templateId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw errors.emailDeliveryFailed();
    }

    if (!response.ok) {
      const detalle = await response.text().catch(() => "");
      this.logger.error("Brevo rechazó el envío del correo de verificación", {
        toEmail: input.toEmail,
        templateId: this.config.templateId,
        senderEmail: this.config.senderEmail,
        status: response.status,
        detalle: detalle.slice(0, 300)
      });
      throw errors.emailDeliveryFailed();
    }

    this.logger.info("Correo de verificación enviado con Brevo", {
      toEmail: input.toEmail,
      templateId: this.config.templateId
    });
  }
}

/**
 * Emisor en memoria para desarrollo local sin `BREVO_API_KEY` y para pruebas
 * automatizadas. Guarda los envíos en memoria sin exponer tokens en logs.
 */
export class MemoryEmailSender implements EmailSender {
  public readonly sent: VerificationEmailInput[] = [];

  constructor(private readonly logger?: Logger) {}

  async sendVerificationEmail(input: VerificationEmailInput): Promise<void> {
    this.sent.push({ ...input });
    this.logger?.info("Correo de verificación registrado en memoria (sin Brevo)", {
      toEmail: input.toEmail
    });
  }
}

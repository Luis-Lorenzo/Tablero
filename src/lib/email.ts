import type { Logger } from "./logger.js";

export interface EmailSender {
  sendConfirmation(to: string, confirmationUrl: string): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  async sendConfirmation(to: string, confirmationUrl: string): Promise<void> {
    this.logger.info("Enlace de confirmacion generado", {
      to,
      confirmationUrl
    });
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly logger: Logger
  ) {}

  async sendConfirmation(to: string, confirmationUrl: string): Promise<void> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to,
        subject: "Confirma tu cuenta en el Tablero de rol",
        html: `
          <p>¡Bienvenido al Tablero de rol!</p>
          <p>Confirma tu cuenta pulsando el siguiente enlace:</p>
          <p><a href="${confirmationUrl}">Confirmar mi cuenta</a></p>
          <p>Si no te registraste, puedes ignorar este mensaje.</p>
        `
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error("Fallo al enviar el correo de confirmacion", {
        to,
        status: response.status,
        detail
      });
      throw new Error("EMAIL_SEND_FAILED");
    }

    this.logger.info("Correo de confirmacion enviado", { to });
  }
}

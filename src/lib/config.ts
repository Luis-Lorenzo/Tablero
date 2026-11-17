import "dotenv/config";

function read(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

const env = process.env.NODE_ENV ?? "development";

export const config = {
  env,
  isProduction: env === "production",
  isTest: env === "test",
  port: Number(process.env.PORT) || 8080,
  databaseUrl: read("DATABASE_URL"),
  sessionSecret: read("SESSION_SECRET", "dev-only-insecure-secret"),
  admin: {
    email: read("ADMIN_EMAIL"),
    password: read("ADMIN_PASSWORD")
  },
  r2: {
    accountId: read("R2_ACCOUNT_ID"),
    accessKeyId: read("R2_ACCESS_KEY_ID"),
    secretAccessKey: read("R2_SECRET_ACCESS_KEY"),
    bucket: read("R2_BUCKET_NAME"),
    endpoint: read("R2_ENDPOINT")
  },
  archivos: {
    /** Tamaño máximo por archivo subido (30 MiB por defecto). */
    maxBytes: Number(process.env.ARCHIVO_MAX_BYTES) || 30 * 1024 * 1024
  },
  appUrl: read("APP_URL", read("APP_BASE_URL", "http://localhost:5173")).replace(
    /\/+$/,
    ""
  ),
  brevo: {
    apiKey: read("BREVO_API_KEY", read("EMAIL_API_KEY")),
    templateId: Number(process.env.BREVO_TEMPLATE_ID) || 5,
    senderEmail: read(
      "BREVO_SENDER_EMAIL",
      read("EMAIL_FROM", "infoluisloxc@gmail.com")
    ),
    senderName: read("BREVO_SENDER_NAME", "Pocket Rol")
  }
} as const;

export type AppConfig = typeof config;
export type R2Config = AppConfig["r2"];
export type BrevoConfig = AppConfig["brevo"];

/** Indica si hay credenciales suficientes para enviar correos con Brevo. */
export function brevoConfigurado(brevo: BrevoConfig): boolean {
  return Boolean(brevo.apiKey && brevo.senderEmail && brevo.templateId > 0);
}

/** Indica si hay credenciales suficientes para hablar con Cloudflare R2. */
export function r2Configurado(r2: R2Config): boolean {
  return Boolean(
    r2.accessKeyId &&
      r2.secretAccessKey &&
      r2.bucket &&
      r2.endpoint
  );
}

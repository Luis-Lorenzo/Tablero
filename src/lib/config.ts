import "dotenv/config";

function read(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

const env = process.env.NODE_ENV ?? "development";

export const config = {
  env,
  isProduction: env === "production",
  isTest: env === "test",
  port: Number(process.env.PORT) || 8080,
  appBaseUrl: read("APP_BASE_URL", "http://localhost:8080"),
  databaseUrl: read("DATABASE_URL"),
  sessionSecret: read("SESSION_SECRET", "dev-only-insecure-secret"),
  google: {
    clientId: read("GOOGLE_CLIENT_ID"),
    clientSecret: read("GOOGLE_CLIENT_SECRET")
  },
  email: {
    apiKey: read("EMAIL_API_KEY"),
    from: read("EMAIL_FROM", "Tablero de rol <onboarding@resend.dev>")
  },
  admin: {
    email: read("ADMIN_EMAIL"),
    password: read("ADMIN_PASSWORD")
  }
} as const;

export type AppConfig = typeof config;

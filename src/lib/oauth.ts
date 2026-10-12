import type { AppConfig } from "./config.js";
import { errors } from "./errors.js";

export interface GoogleProfile {
  email: string;
  emailConfirmed: boolean;
}

export function buildGoogleAuthUrl(config: AppConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: `${config.appBaseUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account"
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForProfile(
  config: AppConfig,
  code: string
): Promise<GoogleProfile> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      redirect_uri: `${config.appBaseUrl}/api/auth/google/callback`,
      grant_type: "authorization_code"
    })
  });

  if (!tokenResponse.ok) {
    throw errors.oauthFailed();
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string };

  if (!tokens.access_token) {
    throw errors.oauthFailed();
  }

  const profileResponse = await fetch(
    "https://www.googleapis.com/oauth2/v3/userinfo",
    { headers: { authorization: `Bearer ${tokens.access_token}` } }
  );

  if (!profileResponse.ok) {
    throw errors.oauthFailed();
  }

  const profile = (await profileResponse.json()) as {
    email?: string;
    email_verified?: boolean;
  };

  if (!profile.email) {
    throw errors.oauthFailed();
  }

  return {
    email: profile.email,
    emailConfirmed: profile.email_verified !== false
  };
}

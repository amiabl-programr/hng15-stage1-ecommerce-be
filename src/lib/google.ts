import { env } from '../config/env.ts';
import { UnauthorizedError } from './errors.ts';

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

export interface GoogleTokens {
  accessToken: string;
  idToken?: string | undefined;
  expiresIn?: number | undefined;
  tokenType?: string | undefined;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string | undefined;
}

export function buildGoogleAuthUrl(state: string): string {
  const config = env();
  const params = new URLSearchParams({
    client_id: config.googleClientId,
    redirect_uri: config.googleRedirectUri.toString(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const config = env();
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.googleRedirectUri.toString(),
  });

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new UnauthorizedError(`Google token exchange failed: ${text || response.statusText}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    id_token?: string;
    expires_in?: number;
    token_type?: string;
  };

  if (!data.access_token) {
    throw new UnauthorizedError('Google token response did not contain an access token');
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token ?? undefined,
    expiresIn: data.expires_in ?? undefined,
    tokenType: data.token_type ?? undefined,
  };
}

export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new UnauthorizedError(`Failed to fetch Google user info: ${text || response.statusText}`);
  }

  const data = (await response.json()) as {
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  if (!data.id || !data.email) {
    throw new UnauthorizedError('Google user info response is missing id or email');
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name ?? '',
    picture: data.picture ?? undefined,
  };
}

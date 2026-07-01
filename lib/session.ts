import { cookies } from 'next/headers';
import { createHash } from 'crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';

export const SESSION_COOKIE = 'spx_wh_requisition_session';

export type Session = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
};

const SESSION_MAX_AGE = 60 * 60 * 24 * 365;

function secretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  return createHash('sha256').update(secret).digest();
}

export async function createSessionToken(session: Session) {
  return new EncryptJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .encrypt(secretKey());
}

async function refreshAccessToken(session: Session): Promise<Session | null> {
  if (!session.refreshToken) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: session.refreshToken,
      grant_type: 'refresh_token'
    })
  });
  if (!res.ok) return null;

  const tokens = await res.json() as { access_token?: string; expires_in?: number };
  if (!tokens.access_token) return null;
  return {
    ...session,
    accessToken: tokens.access_token,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined
  };
}

export async function readSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtDecrypt(raw, secretKey());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<Session | Response> {
  const session = await readSession();
  if (!session?.accessToken) return Response.json({ error: 'Sign in with Google first.' }, { status: 401 });
  if (session.expiresAt && session.expiresAt < Date.now() + 60_000) {
    const refreshed = await refreshAccessToken(session);
    if (!refreshed) return Response.json({ error: 'Google session expired. Sign in with Google again.' }, { status: 401 });
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, await createSessionToken(refreshed), sessionCookieOptions);
    return refreshed;
  }
  return session;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE
};

import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';
import { getGoogleUserInfo, getOAuthClient } from '@/lib/google';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const expectedState = req.cookies.get('google_oauth_state')?.value;
  if (!code || !state || state !== expectedState) return NextResponse.redirect(new URL('/?auth=failed', req.url));

  const oauth = getOAuthClient();
  const { tokens } = await oauth.getToken(code);
  if (!tokens.access_token) return NextResponse.redirect(new URL('/?auth=missing_token', req.url));
  const { data: profile } = await getGoogleUserInfo(tokens.access_token);
  if (!profile.id || !profile.email || !tokens.access_token) return NextResponse.redirect(new URL('/?auth=missing_profile', req.url));

  const encrypted = await createSessionToken({
    sub: profile.id,
    email: profile.email,
    name: profile.name ?? undefined,
    picture: profile.picture ?? undefined,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? undefined,
    expiresAt: tokens.expiry_date ?? undefined
  });
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.delete('google_oauth_state');
  res.cookies.set(SESSION_COOKIE, encrypted, sessionCookieOptions);
  return res;
}

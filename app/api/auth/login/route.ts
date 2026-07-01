import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { DRIVE_SCOPES, getOAuthClient } from '@/lib/google';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REDIRECT_URI) {
    return NextResponse.redirect(new URL('/?auth=oauth_config_missing', req.url));
  }

  const state = randomBytes(16).toString('hex');
  const authUrl = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    include_granted_scopes: true,
    scope: DRIVE_SCOPES,
    state
  });
  const res = NextResponse.redirect(authUrl);
  res.cookies.set('google_oauth_state', state, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}

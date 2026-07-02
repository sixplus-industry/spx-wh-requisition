import { GET as handleGoogleCallback } from '@/app/api/auth/callback/route';

export const runtime = 'nodejs';

export const GET = handleGoogleCallback;

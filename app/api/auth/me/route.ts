import { readSession } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const session = await readSession();
  if (!session) return Response.json({ user: null }, { status: 401 });
  return Response.json({ user: { email: session.email, name: session.name, picture: session.picture } });
}
